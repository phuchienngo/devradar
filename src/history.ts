import { FULL_TEXT_MIN_CHARS, MAX_CRAWL_TRIES, SITE_OF } from './config';
import type { Env, Item } from './types';

export interface HistoryRow {
  id: string;
  archived: number;
  url: string;
  title: string;
  source: string;
  channel: string;
  publishedAt: number | null;
  sentAt: number;
  /** 1 = đã gửi Google Chat, 0 = mới lưu, chưa gửi. */
  sent: number;
  summary: string;
  /** Chỉ có khi tìm kiếm: đoạn trích, từ khớp nằm giữa \uE000 và \uE001. */
  excerpt?: string;
}

const BASE = [
  `CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,           -- hash URL
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '', -- đoạn tóm tắt lấy từ feed
    body TEXT NOT NULL DEFAULT '',    -- nội dung bài dạng Markdown, '' nếu chưa lưu được
    body_tries INTEGER NOT NULL DEFAULT 0, -- số lần đã thử tải trang
    crawled INTEGER NOT NULL DEFAULT 0,    -- 1 = không cần/không còn tải trang (đã tải, feed đã đủ bài, hoặc bỏ cuộc)
    source TEXT NOT NULL,
    channel TEXT NOT NULL,
    published_at INTEGER,          -- epoch ms, có thể NULL
    sent_at INTEGER NOT NULL,      -- epoch ms: lúc gửi (sent = 1) hoặc lúc lưu vào D1 (sent = 0)
    sent INTEGER NOT NULL DEFAULT 1 -- 0 = đã lưu nhưng chưa gửi Google Chat, 1 = đã gửi
  )`,
  // Khoá chống chạy chồng giữa cron và nút bấm; tự hết hạn phòng khi lượt chạy chết giữa chừng.
  'CREATE TABLE IF NOT EXISTS locks (name TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)',
  // Số lượt liên tiếp mỗi nguồn bị lỗi, để chỉ báo khi lỗi dai dẳng
  'CREATE TABLE IF NOT EXISTS source_state (name TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT \'\', updated_at INTEGER NOT NULL DEFAULT 0)',
];

// Full-text search (FTS5) trên tiêu đề + tóm tắt + nội dung + nguồn; bỏ dấu để "toi uu" khớp "Tối ưu".
// content='articles': FTS chỉ giữ chỉ mục, văn bản vẫn nằm ở bảng articles.
const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source, sent_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_articles_pending ON articles (sent, published_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_articles_crawl ON articles (crawled, published_at DESC)',
];

const FTS = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
    title, summary, body, source,
    content='articles', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
    INSERT INTO articles_fts(rowid, title, summary, body, source) VALUES (new.rowid, new.title, new.summary, new.body, new.source);
  END`,
  `CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, summary, body, source) VALUES ('delete', old.rowid, old.title, old.summary, old.body, old.source);
  END`,
  // Chỉ chạy khi đổi nội dung chữ (không chạy khi chỉ tăng body_tries)
  `CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE OF title, summary, body, source ON articles BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, summary, body, source) VALUES ('delete', old.rowid, old.title, old.summary, old.body, old.source);
    INSERT INTO articles_fts(rowid, title, summary, body, source) VALUES (new.rowid, new.title, new.summary, new.body, new.source);
  END`,
];

// Tự tạo bảng nếu chưa có (không cần chạy migration). Mỗi isolate chỉ chạy một lần; lỗi thì lần sau thử lại.
let ready: Promise<unknown> | null = null;
function ensureSchema(env: Env): Promise<unknown> {
  ready ??= (async () => {
    await env.DB.batch(BASE.map((q) => env.DB.prepare(q)));
    await env.DB.batch(INDEXES.map((q) => env.DB.prepare(q)));
    await env.DB.batch(FTS.map((q) => env.DB.prepare(q)));
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Mọi bài đã lưu, gửi hay chưa (id = hash URL). Bảng này vừa là lịch sử vừa là dữ liệu dedupe. */
export async function loadSeen(env: Env): Promise<Set<string>> {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT id FROM articles').all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

const LOCK_MS = 10 * 60_000;

export async function acquireLock(env: Env): Promise<boolean> {
  await ensureSchema(env);
  const now = Date.now();
  const r = await env.DB.prepare(
    `INSERT INTO locks (name, expires_at) VALUES ('run', ?1)
     ON CONFLICT(name) DO UPDATE SET expires_at = ?1 WHERE locks.expires_at < ?2`,
  )
    .bind(now + LOCK_MS, now)
    .run();
  return r.meta.changes > 0;
}

export async function releaseLock(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM locks WHERE name = 'run'").run();
}

const INGEST_CHUNK = 50;

/** Cần tải trang khi feed chỉ có tóm tắt ngắn. Paper chỉ có abstract (trang nhà xuất bản thường chặn). */
const needsPage = (it: Item) => it.channel !== 'paper' && it.content.length < FULL_TEXT_MIN_CHARS;

/** Lưu bài mới với sent = 0. INSERT OR IGNORE nên chạy lại không tạo dòng trùng; trả về số dòng thực sự thêm. */
export async function ingestArticles(env: Env, entries: { hash: string; item: Item }[]): Promise<number> {
  if (!entries.length) return 0;
  await ensureSchema(env);
  const now = Date.now();
  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO articles (id, url, title, summary, body, body_tries, source, channel, published_at, sent_at, sent, crawled) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, ?)',
  );
  let added = 0;
  for (let i = 0; i < entries.length; i += INGEST_CHUNK) {
    const res = await env.DB.batch(
      entries.slice(i, i + INGEST_CHUNK).map(({ hash, item: it }) => stmt.bind(hash, it.url, it.title, it.snippet, it.content, it.source, it.channel, it.publishedAt, now, needsPage(it) ? 0 : 1)),
    );
    added += res.filter((r) => r.meta.changes > 0).length; // changes tính cả dòng trigger/FTS ghi thêm, nên đếm câu lệnh chứ không cộng changes
  }
  return added;
}

interface Pending {
  id: string;
  item: Item;
}

/** `limit` bài chưa gửi, chọn ngẫu nhiên (chọn id trước rồi mới đọc cột, để không phải sắp xếp cả cột nội dung của hàng chờ). */
export async function pendingToSend(env: Env, limit: number): Promise<Pending[]> {
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    `SELECT id, url, title, summary, body, source, channel, published_at AS publishedAt
     FROM articles WHERE id IN (SELECT id FROM articles WHERE sent = 0 ORDER BY RANDOM() LIMIT ?)`,
  )
    .bind(limit)
    .all<{ id: string; url: string; title: string; summary: string; body: string; source: string; channel: string; publishedAt: number | null }>();
  return results.map((r) => ({
    id: r.id,
    item: { id: r.id, url: r.url, title: r.title, source: r.source, channel: r.channel, publishedAt: r.publishedAt, snippet: r.summary, content: r.body },
  }));
}

export async function countPending(env: Env): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM articles WHERE sent = 0').first<{ n: number }>();
  return r?.n ?? 0;
}

export async function markSent(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const now = Date.now();
  const stmt = env.DB.prepare('UPDATE articles SET sent = 1, sent_at = ?1 WHERE id = ?2');
  await env.DB.batch(ids.map((id) => stmt.bind(now, id)));
}

/** Bài cần tải trang, mới nhất trước (cùng thứ tự với hàng đợi gửi). */
export async function pendingCrawl(env: Env, limit: number): Promise<{ id: string; url: string; body: string }[]> {
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    `SELECT id, url, body FROM articles WHERE crawled = 0
     ORDER BY MIN(COALESCE(published_at, sent_at), sent_at) DESC, id LIMIT ?`,
  )
    .bind(limit)
    .all<{ id: string; url: string; body: string }>();
  return results;
}

export async function countPendingCrawl(env: Env): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM articles WHERE crawled = 0').first<{ n: number }>();
  return r?.n ?? 0;
}

/** Có nội dung thì lưu và xong; không thì tăng số lần thử, đủ MAX_CRAWL_TRIES thì bỏ cuộc. */
export async function saveCrawl(env: Env, results: { id: string; body: string | null }[]): Promise<void> {
  if (!results.length) return;
  const ok = env.DB.prepare('UPDATE articles SET body = ?1, crawled = 1, body_tries = body_tries + 1 WHERE id = ?2');
  const fail = env.DB.prepare('UPDATE articles SET body_tries = body_tries + 1, crawled = (body_tries + 1 >= ?1) WHERE id = ?2');
  await env.DB.batch(results.map((r) => (r.body === null ? fail.bind(MAX_CRAWL_TRIES, r.id) : ok.bind(r.body, r.id))));
}

export interface Archived {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number | null;
  sentAt: number;
  body: string;
}

export async function getArticle(env: Env, id: string): Promise<Archived | null> {
  await ensureSchema(env);
  return env.DB.prepare(
    'SELECT id, title, url, source, published_at AS publishedAt, sent_at AS sentAt, body FROM articles WHERE id = ?',
  )
    .bind(id)
    .first<Archived>();
}

interface HistoryQuery {
  q: string;
  source: string;
  /** '' = tất cả, '1' = đã gửi, '0' = chưa gửi. */
  sent: '' | '0' | '1';
  page: number; // bắt đầu từ 1
  /** '' = mọi kênh. */
  channel: string;
  /** Chỉ lấy bài trong N ngày gần đây; 0 = không giới hạn. */
  days: number;
  /** 'rel' = độ liên quan (chỉ có tác dụng khi có từ khoá), còn lại = mới nhất. */
  sort: 'new' | 'rel';
}

export const PAGE_SIZE = 30;

const like = (s: string) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * Biến chuỗi người dùng gõ thành truy vấn FTS5 an toàn: mỗi từ là một "cụm" có tiền tố (gõ dở vẫn khớp),
 * các từ nối bằng AND. Bỏ mọi ký tự có nghĩa đặc biệt trong cú pháp FTS5 (" - : * ( ) ...).
 */
export function toFtsQuery(q: string): string {
  const terms = q.match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.slice(0, 8).map((t) => `"${t}"*`).join(' ');
}

const HL_OPEN = '\uE000';
const HL_CLOSE = '\uE001';

const DATE_EXPR = 'MIN(COALESCE(%a.published_at, %a.sent_at), %a.sent_at)';

export async function queryHistory(env: Env, { q, source, sent, page, channel, days, sort }: HistoryQuery) {
  await ensureSchema(env);
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const fts = /^https?:\/\/|\//i.test(q) ? '' : toFtsQuery(q); // có dấu "/" thì coi là tìm theo link
  const sourcesStmt = env.DB.prepare('SELECT DISTINCT source FROM articles ORDER BY source');

  let rowsStmt: D1PreparedStatement;
  let countStmt: D1PreparedStatement;
  if (fts) {
    const date = DATE_EXPR.replaceAll('%a.', 'a.');
    const src = `${source ? 'AND a.source = ?' : ''} ${sent ? 'AND a.sent = ?' : ''} ${channel ? 'AND a.channel = ?' : ''} ${days ? `AND ${date} >= ?` : ''}`;
    const srcArgs = [...(source ? [source] : []), ...(sent ? [Number(sent)] : []), ...(channel ? [channel] : []), ...(days ? [Date.now() - days * 86_400_000] : [])];
    // bm25: số càng nhỏ càng liên quan; tiêu đề nặng hơn tóm tắt, tóm tắt nặng hơn nội dung
    const order = sort === 'rel' ? `bm25(articles_fts, 10.0, 3.0, 1.0, 0.0), ${date} DESC` : `${date} DESC`;
    rowsStmt = env.DB.prepare(
      `SELECT a.id, a.url, a.title, a.summary, a.source, a.channel, a.published_at AS publishedAt, a.sent_at AS sentAt, a.sent,
              a.body <> '' AS archived,
              CASE WHEN a.body <> '' THEN snippet(articles_fts, 2, '${HL_OPEN}', '${HL_CLOSE}', '…', 24)
                   ELSE snippet(articles_fts, 1, '${HL_OPEN}', '${HL_CLOSE}', '…', 24) END AS excerpt
       FROM articles_fts JOIN articles a ON a.rowid = articles_fts.rowid
       WHERE articles_fts MATCH ? ${src}
       ORDER BY ${order}, a.id LIMIT ? OFFSET ?`,
    ).bind(fts, ...srcArgs, PAGE_SIZE, offset);
    countStmt = env.DB.prepare(
      `SELECT COUNT(*) AS n FROM articles_fts JOIN articles a ON a.rowid = articles_fts.rowid
       WHERE articles_fts MATCH ? ${src}`,
    ).bind(fts, ...srcArgs);
  } else {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (q) {
      where.push("url LIKE ? ESCAPE '\\'");
      args.push(like(q));
    }
    if (source) {
      where.push('source = ?');
      args.push(source);
    }
    if (sent) {
      where.push('sent = ?');
      args.push(Number(sent));
    }
    if (channel) {
      where.push('channel = ?');
      args.push(channel);
    }
    if (days) {
      where.push(`${DATE_EXPR.replaceAll('%a.', '')} >= ?`);
      args.push(Date.now() - days * 86_400_000);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    rowsStmt = env.DB.prepare(
      `SELECT id, url, title, summary, source, channel, published_at AS publishedAt, sent_at AS sentAt, sent, body <> '' AS archived
       FROM articles ${w} ORDER BY MIN(COALESCE(published_at, sent_at), sent_at) DESC, id LIMIT ? OFFSET ?`,
    ).bind(...args, PAGE_SIZE, offset);
    countStmt = env.DB.prepare(`SELECT COUNT(*) AS n FROM articles ${w}`).bind(...args);
  }

  const [rows, count, sources] = await env.DB.batch([rowsStmt, countStmt, sourcesStmt]);
  return {
    rows: rows!.results as unknown as HistoryRow[],
    total: (count!.results[0] as { n: number }).n,
    sources: (sources!.results as { source: string }[]).map((r) => r.source),
    logos: SITE_OF,
    pageSize: PAGE_SIZE,
    hl: [HL_OPEN, HL_CLOSE],
  };
}

const NOTIFY_AFTER = 3;
const REMIND_EVERY = 24;

/** Ghi kết quả từng nguồn; trả về những nguồn cần báo (lỗi liên tiếp đủ NOTIFY_AFTER lượt, rồi nhắc lại mỗi REMIND_EVERY lượt). Thành công thì đặt lại bộ đếm. */
export async function recordSourceResults(
  env: Env,
  results: { name: string; error?: string }[],
): Promise<{ name: string; error: string; fails: number }[]> {
  await ensureSchema(env);
  const { results: rows } = await env.DB.prepare('SELECT name, fails FROM source_state WHERE fails > 0').all<{ name: string; fails: number }>();
  const prev = new Map(rows.map((r) => [r.name, r.fails]));
  const now = Date.now();
  const notify: { name: string; error: string; fails: number }[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (const r of results) {
    if (r.error === undefined) {
      if (prev.has(r.name)) {
        stmts.push(env.DB.prepare("UPDATE source_state SET fails = 0, last_error = '', updated_at = ?1 WHERE name = ?2").bind(now, r.name));
      }
      continue;
    }
    const fails = (prev.get(r.name) ?? 0) + 1;
    stmts.push(
      env.DB.prepare(
        'INSERT INTO source_state (name, fails, last_error, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(name) DO UPDATE SET fails = ?2, last_error = ?3, updated_at = ?4',
      ).bind(r.name, fails, r.error.slice(0, 300), now),
    );
    if (fails === NOTIFY_AFTER || (fails > NOTIFY_AFTER && (fails - NOTIFY_AFTER) % REMIND_EVERY === 0)) notify.push({ name: r.name, error: r.error, fails });
  }
  if (stmts.length) await env.DB.batch(stmts);
  return notify;
}

import type { Env, Item } from './types';

export interface HistoryRow {
  url: string;
  title: string;
  source: string;
  channel: string;
  publishedAt: number | null;
  sentAt: number;
  summary: string;
  /** Chỉ có khi tìm kiếm: đoạn trích, từ khớp nằm giữa \uE000 và \uE001. */
  excerpt?: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,           -- hash URL
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '', -- đoạn tóm tắt lấy từ feed
    source TEXT NOT NULL,
    channel TEXT NOT NULL,
    published_at INTEGER,          -- epoch ms, có thể NULL
    sent_at INTEGER NOT NULL       -- epoch ms
  )`,
  'CREATE INDEX IF NOT EXISTS idx_articles_sent_at ON articles (sent_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source, sent_at DESC)',
  // Full-text search (FTS5) trên tiêu đề + tóm tắt + nguồn; bỏ dấu để "toi uu" khớp "Tối ưu".
  // content='articles': FTS chỉ giữ chỉ mục, văn bản vẫn nằm ở bảng articles.
  `CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
    title, summary, source,
    content='articles', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
    INSERT INTO articles_fts(rowid, title, summary, source) VALUES (new.rowid, new.title, new.summary, new.source);
  END`,
  `CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, summary, source) VALUES ('delete', old.rowid, old.title, old.summary, old.source);
  END`,
  // Khoá chống chạy chồng giữa cron và nút bấm; tự hết hạn phòng khi lượt chạy chết giữa chừng.
  'CREATE TABLE IF NOT EXISTS locks (name TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)',
];

// Tự tạo bảng nếu chưa có (không cần chạy migration). Mỗi isolate chỉ chạy một lần; lỗi thì lần sau thử lại.
let ready: Promise<unknown> | null = null;
function ensureSchema(env: Env): Promise<unknown> {
  ready ??= env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q))).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Các bài đã gửi (id = hash URL). Bảng này vừa là lịch sử vừa là dữ liệu dedupe. */
export async function loadSeen(env: Env): Promise<Set<string>> {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT id FROM articles').all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

const LOCK_MS = 10 * 60_000;

/** true nếu lấy được khoá (chưa có lượt nào đang chạy, hoặc khoá cũ đã hết hạn). */
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

/** Ghi các bài vừa gửi vào D1. INSERT OR IGNORE: chạy lại không tạo dòng trùng. Chạy 1 batch = 1 round-trip. */
export async function logToHistory(env: Env, entries: { hash: string; item: Item }[]): Promise<void> {
  if (!entries.length) return;
  await ensureSchema(env);
  const now = Date.now();
  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO articles (id, url, title, summary, source, channel, published_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  await env.DB.batch(
    entries.map(({ hash, item: it }) => stmt.bind(hash, it.url, it.title, it.snippet, it.source, it.channel, it.publishedAt, now)),
  );
}

export interface HistoryQuery {
  q: string;
  source: string;
  page: number; // bắt đầu từ 1
}

export const PAGE_SIZE = 30;

/** Escape % _ \ để ô tìm link khớp theo đúng ký tự người gõ. */
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

export async function queryHistory(env: Env, { q, source, page }: HistoryQuery) {
  await ensureSchema(env);
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;
  const fts = /^https?:\/\/|\//i.test(q) ? '' : toFtsQuery(q); // có dấu "/" thì coi là tìm theo link
  const sourcesStmt = env.DB.prepare('SELECT DISTINCT source FROM articles ORDER BY source');

  let rowsStmt: D1PreparedStatement;
  let countStmt: D1PreparedStatement;
  if (fts) {
    // Tìm full-text: xếp theo độ liên quan (bm25), tiêu đề được ưu tiên hơn tóm tắt.
    const src = source ? 'AND a.source = ?' : '';
    const srcArgs = source ? [source] : [];
    rowsStmt = env.DB.prepare(
      `SELECT a.url, a.title, a.summary, a.source, a.channel, a.published_at AS publishedAt, a.sent_at AS sentAt,
              snippet(articles_fts, 1, '${HL_OPEN}', '${HL_CLOSE}', '…', 24) AS excerpt
       FROM articles_fts JOIN articles a ON a.rowid = articles_fts.rowid
       WHERE articles_fts MATCH ? ${src}
       ORDER BY bm25(articles_fts, 10.0, 1.0, 2.0), a.sent_at DESC LIMIT ? OFFSET ?`,
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
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    rowsStmt = env.DB.prepare(
      `SELECT url, title, summary, source, channel, published_at AS publishedAt, sent_at AS sentAt
       FROM articles ${w} ORDER BY sent_at DESC, id LIMIT ? OFFSET ?`,
    ).bind(...args, PAGE_SIZE, offset);
    countStmt = env.DB.prepare(`SELECT COUNT(*) AS n FROM articles ${w}`).bind(...args);
  }

  const [rows, count, sources] = await env.DB.batch([rowsStmt, countStmt, sourcesStmt]);
  return {
    rows: rows!.results as unknown as HistoryRow[],
    total: (count!.results[0] as { n: number }).n,
    sources: (sources!.results as { source: string }[]).map((r) => r.source),
    pageSize: PAGE_SIZE,
    hl: [HL_OPEN, HL_CLOSE],
  };
}

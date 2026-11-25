import { FETCH_CONCURRENCY, MAX_INGEST_PER_RUN, MAX_PER_RUN, SOURCES } from './config';
import { crawlBodies } from './archive';
import { pool } from './hosts';
import { hashUrl } from './dedupe';
import { sendTextToGoogleChat, sendToGoogleChat } from './gchat';
import { acquireLock, countPending, countPendingCrawl, getArticle, ingestArticles, loadSeen, markSent, pendingToSend, queryHistory, recordSourceResults, releaseLock } from './history';
import { fetchSource, hydrate } from './sources';
import type { Candidate, Env, Item } from './types';
import { PAGE, renderArticle } from './pages';
import { msg } from './util';

export interface RunResult {
  summary: string;
  errors: string[];
}

const newestFirst = (a: { c: Candidate }, b: { c: Candidate }) => (b.c.publishedAt ?? 0) - (a.c.publishedAt ?? 0);

/** Báo lỗi vào Google Chat; chính nó lỗi thì chỉ log. */
async function notify(env: Env, text: string): Promise<void> {
  await sendTextToGoogleChat(env, text).catch((e) => console.error('notify failed:', msg(e)));
}

/** Pha LƯU: đọc feed và ghi bài mới vào D1 với sent = 0 (mới → cũ). Trả null nếu không đọc được D1: dừng lượt để khỏi lưu/gửi trùng. */
async function ingest(env: Env, errors: string[]): Promise<{ stats: string } | null> {
  let seen: Set<string>;
  try {
    seen = await loadSeen(env);
  } catch (e) {
    errors.push(`D1: không đọc được danh sách đã lưu (${msg(e)})`);
    return null;
  }

  // Worker chỉ có 128 MB mà mỗi bài giữ cả XML thô: lọc bài đã có ngay khi đọc xong từng nguồn/trang, và chỉ giữ
  // tối đa 2 × MAX_INGEST_PER_RUN bài mới nhất (vượt thì cắt bớt bài cũ, lượt sau lấy tiếp).
  const fresh: { hash: string; c: Candidate }[] = [];
  const dup = new Set<string>();
  let fetched = 0;
  let trimmed = false;
  const take = async (cands: Candidate[]) => {
    fetched += cands.length;
    for (const c of cands) {
      const hash = await hashUrl(c.url);
      if (seen.has(hash) || dup.has(hash)) continue;
      dup.add(hash);
      fresh.push({ hash, c });
    }
    if (fresh.length > 2 * MAX_INGEST_PER_RUN) {
      fresh.sort(newestFirst);
      fresh.length = MAX_INGEST_PER_RUN;
      trimmed = true;
    }
  };

  // Lỗi đơn lẻ (429, timeout) rất hay gặp từ IP Cloudflare nên chỉ báo khi một nguồn lỗi liên tiếp (xem recordSourceResults).
  const outcomes: { name: string; error?: string }[] = [];
  await pool(
    FETCH_CONCURRENCY,
    SOURCES.map((s) => async () => {
      try {
        await take(await fetchSource(s, env));
        outcomes.push({ name: s.name });
      } catch (e) {
        outcomes.push({ name: s.name, error: msg(e) });
      }
    }),
  );
  const failed = outcomes.filter((o) => o.error !== undefined);
  try {
    for (const f of await recordSourceResults(env, outcomes)) errors.push(`${f.name}: lỗi ${f.fails} lượt liên tiếp (${f.error})`);
  } catch (e) {
    console.warn(`source_state: ${msg(e)}`);
  }
  if (failed.length) console.warn(`sources failed: ${failed.map((f) => `${f.name} (${f.error})`).join('; ')}`);

  fresh.sort(newestFirst);
  const newCount = fresh.length;
  const toIngest = fresh.slice(0, MAX_INGEST_PER_RUN).map(({ hash, c }) => ({ hash, item: hydrate(c) }));
  fresh.length = 0; // giải phóng khối XML thô trước khi ghi D1
  let ingested = 0;
  try {
    ingested = await ingestArticles(env, toIngest);
  } catch (e) {
    errors.push(`D1: lưu bài mới lỗi (${msg(e)})`);
  }
  return { stats: `failed=${failed.length} fetched=${fetched} new=${newCount}${trimmed ? '+' : ''} ingested=${ingested}` };
}

async function send(env: Env, errors: string[]): Promise<number> {
  let pending: Awaited<ReturnType<typeof pendingToSend>> = [];
  try {
    pending = await pendingToSend(env, MAX_PER_RUN);
  } catch (e) {
    errors.push(`D1: không đọc được hàng đợi chưa gửi (${msg(e)})`);
  }
  const idOf = new Map<Item, string>(pending.map((p) => [p.item, p.id]));

  // Chỉ bài gửi được mới bị đánh dấu; bài còn lại vẫn sent = 0 và thử lại ở lượt sau.
  let sent: Item[] = [];
  try {
    const r = await sendToGoogleChat(env, pending.map((p) => p.item));
    sent = r.sent;
    if (r.error) errors.push(r.error);
  } catch (e) {
    errors.push(`Google Chat: ${msg(e)}`);
  }
  try {
    await markSent(env, sent.map((item) => idOf.get(item)!));
  } catch (e) {
    errors.push(`D1: đánh dấu đã gửi lỗi, các bài vừa gửi có thể bị gửi lại (${msg(e)})`);
  }
  return sent.length;
}

/** Một lượt: lưu bài mới, gửi, rồi crawl nội dung. Mỗi pha được cô lập: lỗi ở đâu chỉ mất phần việc ở đó. */
export async function run(env: Env): Promise<RunResult> {
  const errors: string[] = [];
  const stage = await ingest(env, errors);
  if (!stage) {
    await notify(env, errors.join('\n'));
    return { summary: 'aborted: không đọc được D1', errors };
  }
  const parts = [`sources=${SOURCES.length}`, stage.stats, `sent=${await send(env, errors)}`];

  try {
    parts.push(`crawled=${await crawlBodies(env)}`);
  } catch (e) {
    console.warn(`crawl: ${msg(e)}`);
  }

  const [toSend, toCrawl] = await Promise.all([countPending(env), countPendingCrawl(env)]).catch(() => [-1, -1]);
  parts.push(`queue_send=${toSend}`, `queue_crawl=${toCrawl}`, `errors=${errors.length}`);
  if (errors.length) {
    console.warn(errors.join(' ; '));
    await notify(env, errors.join('\n'));
  }
  return { summary: parts.join(' '), errors };
}

/** Khoá (bảng `locks`) để cron và nút bấm không chạy chồng nhau; tự hết hạn sau 10 phút. */
async function runLocked(env: Env): Promise<RunResult> {
  let locked = false;
  try {
    if (!(await acquireLock(env))) return { summary: 'skipped: đang có lượt chạy khác', errors: [] };
    locked = true;
  } catch {
    // Khoá lỗi thì vẫn chạy, chấp nhận rủi ro chạy chồng còn hơn bỏ lượt (D1 lỗi thật sẽ bị run() chặn lại).
  }
  try {
    return await run(env);
  } finally {
    if (locked) await releaseLock(env).catch(() => {});
  }
}

/** Chỉ chấp nhận POST từ chính trang này (chống CSRF); curl/API không có Origin/Sec-Fetch-Site nên bị từ chối. */
function sameOrigin(req: Request, url: URL): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  return req.headers.get('origin') === url.origin;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runLocked(env).then(
        (r) => console.log(r.summary),
        (e) => notify(env, `Lượt chạy lỗi: ${msg(e)}`),
      ),
    );
  },

  /** Không có xác thực trong code: domain của Worker phải nằm sau Cloudflare Access. */
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/history' && req.method === 'GET') {
      try {
        const get = (k: string) => url.searchParams.get(k) ?? '';
        const data = await queryHistory(env, {
          q: get('q').slice(0, 100),
          source: get('source'),
          sent: get('sent') === '0' ? '0' : get('sent') === '1' ? '1' : '',
          page: Number(get('page')) || 1,
          channel: ['backend', 'ai', 'security', 'paper'].includes(get('channel')) ? get('channel') : '',
          days: [7, 30, 90, 365].includes(Number(get('days'))) ? Number(get('days')) : 0,
          sort: get('sort') === 'rel' ? 'rel' : 'new',
        });
        return Response.json(data, { headers: { 'cache-control': 'no-store' } });
      } catch (e) {
        return Response.json({ error: msg(e) }, { status: 500 });
      }
    }
    if (url.pathname === '/read' && req.method === 'GET') {
      const id = url.searchParams.get('id') ?? '';
      const a = /^[0-9a-f]{16}$/.test(id) ? await getArticle(env, id).catch(() => null) : null;
      if (!a || !a.body) return new Response('Không có bản lưu cho bài này', { status: 404 });
      if (url.searchParams.get('format') === 'md') {
        return new Response(`# ${a.title}\n\nNguồn: ${a.source} · ${a.url}\n\n${a.body}\n`, {
          headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="${id}.md"`, 'cache-control': 'no-store' },
        });
      }
      return new Response(renderArticle(a), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname !== '/run') return new Response('Not found', { status: 404 });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
    if (!sameOrigin(req, url)) return new Response('Forbidden', { status: 403 });

    const job = runLocked(env);
    ctx.waitUntil(job.catch(() => {})); // vẫn chạy tiếp nếu client ngắt kết nối
    try {
      return Response.json(await job);
    } catch (e) {
      return Response.json({ error: msg(e) }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

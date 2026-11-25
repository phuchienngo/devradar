import { MAX_AGE_DAYS, MAX_PER_RUN, SOURCES } from './config';
import { archiveBodies, backfillBodies } from './archive';
import { hashUrl } from './dedupe';
import { sendTextToGoogleChat, sendToGoogleChat } from './gchat';
import { acquireLock, getArticle, loadSeen, logToHistory, queryHistory, recordSourceResults, releaseLock } from './history';
import { fetchSource, hydrate } from './sources';
import type { Candidate, Env, Item } from './types';
import { PAGE, renderArticle } from './pages';

export interface RunResult {
  summary: string;
  errors: string[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Báo lỗi vào Google Chat; chính nó lỗi thì chỉ log (không còn kênh nào khác). */
async function notify(env: Env, text: string): Promise<void> {
  await sendTextToGoogleChat(env, text).catch((e) => console.error('notify failed:', msg(e)));
}

/**
 * Mỗi bước được cô lập: một nguồn lỗi hay một lệnh ghi D1 lỗi chỉ làm mất phần việc của nó.
 */
export async function run(env: Env): Promise<RunResult> {
  const errors: string[] = [];

  // 1. Nguồn: mỗi nguồn độc lập. Lỗi đơn lẻ (429, timeout) rất thường gặp từ IP Cloudflare nên không báo ngay:
  //    chỉ báo khi một nguồn lỗi liên tiếp nhiều lượt (xem recordSourceResults).
  const results = await Promise.allSettled(SOURCES.map((s) => fetchSource(s, env)));
  const all: Candidate[] = [];
  const outcomes = results.map((r, i) => {
    if (r.status === 'fulfilled') {
      all.push(...r.value);
      return { name: SOURCES[i]!.name };
    }
    return { name: SOURCES[i]!.name, error: msg(r.reason) };
  });
  const failed = outcomes.filter((o) => o.error !== undefined);
  try {
    for (const f of await recordSourceResults(env, outcomes)) errors.push(`${f.name}: lỗi ${f.fails} lượt liên tiếp (${f.error})`);
  } catch (e) {
    console.warn(`source_state: ${msg(e)}`); // D1 hỏng thì bước đọc danh sách đã gửi bên dưới sẽ báo
  }
  if (failed.length) console.warn(`sources failed: ${failed.map((f) => `${f.name} (${f.error})`).join('; ')}`);

  // 2. Dedupe bằng bảng lịch sử trong D1. Không đọc được thì không biết bài nào đã gửi → dừng để khỏi gửi trùng.
  let seen: Set<string>;
  try {
    seen = await loadSeen(env);
  } catch (e) {
    errors.push(`D1: không đọc được danh sách đã gửi (${msg(e)})`);
    await notify(env, errors.join('\n'));
    return { summary: 'aborted: không đọc được D1', errors };
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;

  const hashOf = new Map<Candidate, string>();
  const fresh: Candidate[] = [];
  const dup = new Set<string>();
  for (const item of all) {
    const hash = await hashUrl(item.url);
    if (seen.has(hash) || dup.has(hash)) continue;
    dup.add(hash);
    if (item.publishedAt !== null && item.publishedAt < cutoff) continue; // quá cũ: bỏ qua, không cần lưu
    hashOf.set(item, hash);
    fresh.push(item);
  }
  const base = `sources=${SOURCES.length} failed=${failed.length} fetched=${all.length} new=${fresh.length}`;

  // 3. Mới → cũ: lấy MAX_PER_RUN bài mới nhất CHƯA gửi (đã bỏ bài có trong D1 ở trên). Đủ số thì dừng; chưa đủ thì
  //    đã lấy sâu vào các bài cũ hơn trong feed. Phần còn lại để các lượt sau. Chỉ tạo nội dung cho bài sắp gửi.
  fresh.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  const picked = fresh.slice(0, MAX_PER_RUN);
  const toSend: Item[] = picked.map(hydrate);
  const hashOfItem = new Map<Item, string>(toSend.map((it, i) => [it, hashOf.get(picked[i]!)!]));
  // 4. Gửi; chỉ bài đã gửi được mới bị đánh dấu, bài còn lại thử lại ở lượt sau.
  let sent: Item[] = [];
  try {
    const r = await sendToGoogleChat(env, toSend);
    sent = r.sent;
    if (r.error) errors.push(r.error);
  } catch (e) {
    errors.push(`Google Chat: ${msg(e)}`);
  }

  // 5. Lưu nội dung bài (feed nếu đủ dài, không thì tải trang). Lỗi ở đây không ảnh hưởng gì khác.
  let bodies: string[] = [];
  try {
    bodies = await archiveBodies(sent);
  } catch (e) {
    console.warn(`archive: ${msg(e)}`);
  }

  // 6. Ghi D1: vừa là lịch sử vừa đánh dấu đã gửi. Lỗi ở đây nghĩa là các bài đó có thể bị gửi lại.
  try {
    await logToHistory(env, sent.map((item, i) => ({ hash: hashOfItem.get(item)!, item, body: bodies[i] ?? '' })));
  } catch (e) {
    errors.push(`D1: ghi lịch sử lỗi, các bài vừa gửi có thể bị gửi lại (${msg(e)})`);
  }

  // 7. Thử lại các bài gần đây chưa lưu được nội dung
  let backfilled = 0;
  try {
    backfilled = await backfillBodies(env);
  } catch (e) {
    console.warn(`backfill: ${msg(e)}`);
  }

  if (errors.length) {
    console.warn(errors.join(' ; '));
    await notify(env, errors.join('\n'));
  }
  return { summary: `${base} sent=${sent.length} archived=${bodies.filter(Boolean).length} backfilled=${backfilled} errors=${errors.length}`, errors };
}

/** Khoá (bảng `locks` trong D1) để cron và trigger thủ công không chạy chồng nhau, tránh gửi trùng. Hết hạn sau 10 phút. */
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

  /**
   * GET /  → trang có nút "Xem trước" / "Chạy ngay" và mục lịch sử (dùng trong trình duyệt).
   * GET /history?q=&source=&page= → dữ liệu lịch sử cho trang.
   * POST /run → do chính trang đó gọi. KHÔNG có xác thực trong code:
   * phải bật Cloudflare Access cho workers.dev trước khi deploy.
   */
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/history' && req.method === 'GET') {
      try {
        const page = Number(url.searchParams.get('page')) || 1;
        const data = await queryHistory(env, { q: (url.searchParams.get('q') ?? '').slice(0, 100), source: url.searchParams.get('source') ?? '', page });
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

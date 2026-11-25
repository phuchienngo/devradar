import { perHost } from './hosts';
import { backfillCandidates, saveBody } from './history';
import { fetchRetry, USER_AGENT } from './http';
import { htmlToMarkdown } from './text';
import type { Env, Item } from './types';

/** Feed đã kèm nội dung dài hơn mức này thì coi là đủ bài, khỏi tải trang. */
const FEED_FULL_MIN = 1500;
/** Giới hạn mỗi bài (ký tự) để không phình D1. */
const BODY_MAX_CHARS = 100_000;
const MAX_HTML_BYTES = 2_000_000;
const MIN_PAGE_CHARS = 200; // ít hơn: trang render bằng JS hoặc bị chặn, coi như không lấy được
const BACKFILL_PER_RUN = 10;

const ENOUGH_CHARS = 1500;

/**
 * Văn bản thân bài: bỏ script/style trước, rồi thử lần lượt <article> (cái nhiều chữ nhất), <main>, <body>;
 * lấy ứng viên đầu tiên đủ dài, không có thì lấy ứng viên nhiều chữ nhất. (Một số site chỉ dùng <article>
 * cho các card "bài liên quan", nên không thể tin <article> một cách mù quáng.)
 */
function mainText(rawHtml: string, base: string): string {
  const html = rawHtml.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const text = (h: string) => htmlToMarkdown(h.slice(0, 600_000), base);
  let best = '';
  const consider = (t: string) => {
    if (t.length > best.length) best = t;
    return t.length >= ENOUGH_CHARS;
  };
  let article = '';
  for (const m of html.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
    const t = text(m[0]);
    if (t.length > article.length) article = t;
  }
  if (article && consider(article)) return article;
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (main && consider(text(main))) return best;
  consider(text(html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html));
  return best;
}

/** Tải trang và bóc văn bản; '' nếu lỗi / không phải HTML / gần như trống. */
async function fetchArticleText(url: string): Promise<string> {
  try {
    const res = await fetchRetry(
      url,
      { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }, redirect: 'follow' },
      { retries: 2, maxWaitMs: 8000, timeoutMs: 15_000 },
    );
    if (!res.ok || !res.body || !/html|xml/i.test(res.headers.get('content-type') ?? 'html')) return '';

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let html = '';
    let bytes = 0;
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += dec.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => {});

    const text = mainText(html, res.url || url);
    return text.length >= MIN_PAGE_CHARS ? text.slice(0, BODY_MAX_CHARS) : '';
  } catch {
    return '';
  }
}

/** Nội dung lưu cho từng bài (cùng thứ tự đầu vào): ưu tiên feed nếu đủ dài, không thì tải trang. */
export async function archiveBodies(items: Item[]): Promise<string[]> {
  return perHost(
    items.map((i) => i.url),
    async (_url, i) => {
      const item = items[i]!;
      if (item.content.length >= FEED_FULL_MIN) return item.content.slice(0, BODY_MAX_CHARS);
      const page = await fetchArticleText(item.url);
      return (page.length > item.content.length ? page : item.content).slice(0, BODY_MAX_CHARS);
    },
    '',
  );
}

/** Thử lại các bài gần đây chưa lưu được nội dung (tối đa 3 lần mỗi bài). Trả về số bài lưu thêm được. */
export async function backfillBodies(env: Env): Promise<number> {
  const pending = await backfillCandidates(env, BACKFILL_PER_RUN);
  if (!pending.length) return 0;
  const texts = await perHost(pending.map((p) => p.url), (u) => fetchArticleText(u), '');
  await Promise.all(pending.map((p, i) => saveBody(env, p.id, texts[i] ?? '')));
  return texts.filter(Boolean).length;
}

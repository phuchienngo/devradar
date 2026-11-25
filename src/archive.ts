import { perHost } from './hosts';
import { CRAWL_BUDGET_MS, CRAWL_PER_RUN } from './config';
import { pendingCrawl, saveCrawl } from './history';
import { fetchRetry, USER_AGENT } from './http';
import { htmlToMarkdown } from './text';
import type { Env } from './types';

const BODY_MAX_CHARS = 100_000;
const MAX_HTML_BYTES = 2_000_000;
const MIN_PAGE_CHARS = 200; // ít hơn: trang render bằng JS hoặc bị chặn, coi như không lấy được

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

/**
 * Tải nội dung đầy đủ của CRAWL_PER_RUN bài đã lưu (mới nhất trước) vì bài có thể bị xoá về sau. Quá CRAWL_BUDGET_MS thì bỏ qua
 * phần còn lại (không tính là một lần thử lỗi). Trả về số bài tải được.
 */
export async function crawlBodies(env: Env): Promise<number> {
  const rows = await pendingCrawl(env, CRAWL_PER_RUN);
  if (!rows.length) return 0;
  const deadline = Date.now() + CRAWL_BUDGET_MS;
  const pages = await perHost<string | null>(rows.map((r) => r.url), async (u) => (Date.now() > deadline ? null : fetchArticleText(u)), '');
  const done = rows.flatMap((r, i) => (pages[i] === null ? [] : [{ id: r.id, body: pages[i] ? (pages[i]!.length > r.body.length ? pages[i]! : r.body) : null }]));
  await saveCrawl(env, done);
  return pages.filter(Boolean).length;
}

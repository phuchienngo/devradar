import { FETCH_TIMEOUT_MS, type Source } from './config';
import { fetchRetry, USER_AGENT } from './http';
import { fetchPapers } from './papers';
import { decode, htmlToMarkdown, stripTags } from './text';
import type { Candidate, Env, Item } from './types';

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m?.[1] ?? null;
}

function linkOf(block: string): string | null {
  // Atom: <link rel="alternate" href="..."/>; RSS: <link>url</link>
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>(?:([^<]*)<\/link>)?/gi)];
  for (const l of links) {
    const attrs = l[1] ?? '';
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    const rel = attrs.match(/rel=["']([^"']+)["']/i)?.[1];
    if (href && (!rel || rel === 'alternate')) return decode(href);
    const text = l[2]?.trim();
    if (text) return decode(text);
  }
  return null;
}

/** Giới hạn an toàn số mục đọc từ một feed (feed lớn như Vert.x có hàng trăm bài). */
const MAX_ENTRIES_PER_FEED = 500;

function dateOf(block: string): number | null {
  const date = tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ?? tag(block, 'dc:date');
  const ts = date ? Date.parse(stripTags(date)) : NaN;
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Đọc mọi mục của feed ở dạng nhẹ (url, tiêu đề, ngày). Thứ tự không quan trọng: index.ts sắp xếp theo ngày trên toàn bộ,
 * vì có feed xếp cũ nhất lên đầu (Vert.x) hoặc không xếp theo ngày (Elastic).
 */
function parseFeed(xml: string, src: Source): Candidate[] {
  const blocks = (xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? []).slice(0, MAX_ENTRIES_PER_FEED);
  const out: Candidate[] = [];
  for (const block of blocks) {
    const url = linkOf(block);
    const title = tag(block, 'title');
    if (!url || !title) continue;
    out.push({ url, title: stripTags(title), source: src.name, channel: src.channel, publishedAt: dateOf(block), block });
  }
  return out;
}

/** Tạo tóm tắt và nội dung đầy đủ (Markdown, nếu feed có kèm) cho một bài. Chỉ gọi cho bài sắp gửi. */
export function hydrate({ block, hydrated, ...rest }: Candidate): Item {
  if (hydrated) return { ...rest, ...hydrated };
  const body = tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content') ?? tag(block, 'content:encoded') ?? '';
  // Nội dung đầy đủ nếu feed có kèm (content:encoded / content; một số feed nhét cả bài vào description)
  const content = [tag(block, 'content:encoded'), tag(block, 'content'), tag(block, 'description'), tag(block, 'summary')]
    .map((x) => (x ? htmlToMarkdown(x, rest.url) : ''))
    .reduce((a, c) => (c.length > a.length ? c : a), '');
  return { ...rest, snippet: stripTags(body).slice(0, 500), content };
}

export async function fetchSource(src: Source, env?: Pick<Env, 'OPENALEX_API_KEY'>): Promise<Candidate[]> {
  if (src.type === 'papers') return fetchPapers(src, env?.OPENALEX_API_KEY);
  const res = await fetchRetry(
    src.url,
    {
      headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
      redirect: 'follow',
    },
    { retries: 2, maxWaitMs: 10_000, timeoutMs: FETCH_TIMEOUT_MS },
  );
  if (!res.ok) throw new Error(`${src.name}: HTTP ${res.status}`);
  return parseFeed(await res.text(), src);
}

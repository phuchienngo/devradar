import { FETCH_TIMEOUT_MS, type Source } from './config';
import { fetchRetry, USER_AGENT } from './http';
import { decode, htmlToMarkdown, stripTags } from './text';
import type { Item } from './types';

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

const MAX_ITEMS_PER_FEED = 15;

function dateOf(block: string): number | null {
  const date = tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ?? tag(block, 'dc:date');
  const ts = date ? Date.parse(stripTags(date)) : NaN;
  return Number.isNaN(ts) ? null : ts;
}

function parseFeed(xml: string, src: Source): Item[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  // Không tin thứ tự trong feed: có feed xếp cũ nhất lên đầu (Vert.x, 250 bài từ 2015), có feed không xếp theo ngày (Elastic).
  // Sắp xếp mới → cũ theo ngày rồi mới lấy N bài; mục không có ngày giữ nguyên thứ tự và xếp trước.
  const newestFirst = blocks
    .map((block, i) => ({ block, i, ts: dateOf(block) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => b.ts - a.ts || a.i - b.i)
    .map((x) => x.block);

  const items: Item[] = [];
  for (const b of newestFirst.slice(0, MAX_ITEMS_PER_FEED)) {
    const url = linkOf(b);
    const title = tag(b, 'title');
    if (!url || !title) continue;
    const ts = dateOf(b);
    const body = tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content') ?? tag(b, 'content:encoded') ?? '';
    // Nội dung đầy đủ nếu feed có kèm (content:encoded / content; một số feed nhét cả bài vào description)
    const full = [tag(b, 'content:encoded'), tag(b, 'content'), tag(b, 'description'), tag(b, 'summary')]
      .map((x) => (x ? htmlToMarkdown(x, url) : ''))
      .reduce((a, c) => (c.length > a.length ? c : a), '');
    items.push({
      url,
      title: stripTags(title),
      source: src.name,
      channel: src.channel,
      publishedAt: ts,
      snippet: stripTags(body).slice(0, 500),
      content: full,
    });
  }
  return items;
}

export async function fetchSource(src: Source): Promise<Item[]> {
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

import { FETCH_TIMEOUT_MS, type Source } from './config';
import type { Item } from './types';

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const stripTags = (s: string) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

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

export function parseFeed(xml: string, src: Source): Item[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const items: Item[] = [];
  for (const b of blocks.slice(0, 15)) {
    const url = linkOf(b);
    const title = tag(b, 'title');
    if (!url || !title) continue;
    const date = tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date');
    const ts = date ? Date.parse(stripTags(date)) : NaN;
    const body = tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content') ?? tag(b, 'content:encoded') ?? '';
    items.push({
      url,
      title: stripTags(title),
      source: src.name,
      channel: src.channel,
      publishedAt: Number.isNaN(ts) ? null : ts,
      snippet: stripTags(body).slice(0, 300),
    });
  }
  return items;
}

export async function fetchSource(src: Source): Promise<Item[]> {
  const res = await fetch(src.url, {
    headers: { 'user-agent': 'devradar/0.1 (+rss reader)', accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${src.name}: HTTP ${res.status}`);
  return parseFeed(await res.text(), src);
}

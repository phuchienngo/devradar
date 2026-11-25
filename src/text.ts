const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»',
};

/** Bỏ vỏ CDATA và giải mã entity (&amp; &#39; …). */
export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export const stripTags = (s: string) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * HTML → văn bản thô, giữ ngắt đoạn và gạch đầu dòng. Bỏ script/style/nav/footer…
 * Nội dung trong feed thường là HTML bị mã hoá entity (&lt;p&gt;), nên giải mã trước khi bóc thẻ khi cần.
 */
export function htmlToText(html: string): string {
  let s = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  if (!/<[a-z!/]/i.test(s)) s = decode(s);
  s = s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|button|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section|article|blockquote|pre|table|figure)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');
  return decode(s)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

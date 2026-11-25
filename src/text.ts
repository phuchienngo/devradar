const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»',
};

export function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export const stripTags = (s: string) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const PH_OPEN = '';
const PH_CLOSE = '';
const CLEAN_TAGS = 'script|style|noscript|svg|nav|header|footer|aside|form|iframe|button|template|dialog|select|canvas';

function absUrl(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(decode(href).trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m?.[1] ?? m?.[2];
};
const plain = (h: string) => decode(h.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/**
  * HTML → Markdown (tiêu đề, đoạn, danh sách, code block, link/ảnh, trích dẫn) không cần thư viện; bảng và danh sách lồng nhau bị làm phẳng.
  * `base` đổi link/ảnh tương đối thành tuyệt đối. Nội dung trong feed hay bị mã hoá entity nên giải mã trước khi bóc thẻ.
  */
export function htmlToMarkdown(html: string, base = 'https://example.invalid/'): string {
  let s = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  if (!/<[a-z!/]/i.test(s)) s = decode(s);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(new RegExp(`<(${CLEAN_TAGS})\\b[\\s\\S]*?</\\1>`, 'gi'), ' ');

  // 1) Code block: tách ra trước để không bị các bước sau làm hỏng
  const blocks: string[] = [];
  s = s.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (_, attrs: string, inner: string) => {
    const lang = (attrs + ' ' + (inner.match(/<code\b([^>]*)>/i)?.[1] ?? '')).match(/(?:language|lang|highlight-source|brush:?)[-_ :]?([a-z0-9+#]+)/i)?.[1]?.toLowerCase() ?? '';
    const code = decode(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|tr)>/gi, '\n').replace(/<[^>]*>/g, '')).replace(/\n+$/, '').replace(/^\n+/, '');
    blocks.push('\n\n```' + lang + '\n' + code.replace(/```/g, '`​``') + '\n```\n\n');
    return PH_OPEN + (blocks.length - 1) + PH_CLOSE;
  });

  s = s
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, c: string) => {
      const t = decode(c.replace(/<[^>]*>/g, ''));
      return t.trim() ? (t.includes('`') ? '`` ' + t + ' ``' : '`' + t + '`') : '';
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c: string) => (c.replace(/<[^>]*>/g, '').trim() ? '**' + c.trim() + '**' : c))
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c: string) => (c.replace(/<[^>]*>/g, '').trim() ? '*' + c.trim() + '*' : c))
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = absUrl(attr(tag, 'src') ?? attr(tag, 'data-src'), base);
      return src ? `![${plain(attr(tag, 'alt') ?? '').replace(/[\[\]]/g, '')}](${src})` : '';
    })
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs: string, c: string) => {
      const href = absUrl(attr('<a ' + attrs + '>', 'href'), base);
      const text = c.replace(/<(?!img\b)[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return href && text ? `[${text.replace(/[\[\]]/g, '')}](${href})` : text;
    });

  s = s
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, c: string) => {
      const t = c.replace(/<(?!img\b)[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return t ? '\n\n' + '#'.repeat(Number(n)) + ' ' + t + '\n\n' : '';
    })
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c: string) => '\n\n' + htmlToMarkdown(c, base).split('\n').map((l) => '> ' + l).join('\n') + '\n\n')
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<hr\b[^>]*>/gi, '\n\n---\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(p|div|ul|ol|tr|section|article|table|figure|figcaption|dd|dt|details|summary)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');

  const out = decode(s)
    .split('\n')
    .map((l) => (l.startsWith('> ') ? l : l.replace(/[ \t ]+/g, ' ')).trimEnd())
    .join('\n')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(new RegExp(PH_OPEN + '(\\d+)' + PH_CLOSE, 'g'), (_, i: string) => blocks[Number(i)] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

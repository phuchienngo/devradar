const MAX_BYTES = 120_000;
const META = /<meta\b[^>]*>/gi;

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

/** Lấy og:image (hoặc twitter:image) của một trang; null nếu không có/lỗi. Chỉ đọc phần đầu HTML. */
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; devradar/0.1)', accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let html = '';
    let bytes = 0;
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    await reader.cancel().catch(() => {});

    let fallback: string | null = null;
    for (const tag of html.match(META) ?? []) {
      const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
      const content = attr(tag, 'content');
      if (!content) continue;
      if (key === 'og:image' || key === 'og:image:secure_url') return resolve(content, pageUrl);
      if (key === 'twitter:image' || key === 'twitter:image:src') fallback ??= content;
    }
    return fallback ? resolve(fallback, pageUrl) : null;
  } catch {
    return null;
  }
}

function resolve(src: string, base: string): string | null {
  try {
    const u = new URL(decode(src), base);
    return u.protocol === 'https:' ? u.toString() : null; // Google Chat chỉ nhận ảnh https
  } catch {
    return null;
  }
}

/** Lấy ảnh cho nhiều bài, tối đa `limit` request cùng lúc. */
export async function fetchOgImages(urls: string[], limit = 6): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, urls.length) }, async () => {
      while (next < urls.length) {
        const i = next++;
        out[i] = await fetchOgImage(urls[i]!);
      }
    }),
  );
  return out;
}

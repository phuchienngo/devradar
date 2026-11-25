import { SEEN_LIMIT } from './config';

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$|ref_src$|source$)/i;

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return raw;
  }
}

export async function hashUrl(url: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeUrl(url)));
  return [...new Uint8Array(buf).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** null = chưa có key (lần chạy đầu). */
export async function loadSeen(kv: KVNamespace): Promise<string[] | null> {
  return kv.get<string[]>('seen', 'json');
}

export async function saveSeen(kv: KVNamespace, prev: string[], added: string[]): Promise<void> {
  const next = [...prev, ...added].slice(-SEEN_LIMIT);
  await kv.put('seen', JSON.stringify(next));
}

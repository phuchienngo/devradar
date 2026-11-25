const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};

/**
 * Chạy fn cho nhiều URL. Các URL cùng host chạy tuần tự (cách nhau gapMs) để tránh bị 429;
 * host khác nhau chạy song song, tối đa `limit` host cùng lúc. Kết quả giữ đúng thứ tự đầu vào.
 */
export async function perHost<T>(urls: string[], fn: (url: string, i: number) => Promise<T>, fallback: T, gapMs = 400, limit = 6): Promise<T[]> {
  const out: T[] = new Array(urls.length).fill(fallback);
  const groups = new Map<string, number[]>();
  urls.forEach((u, i) => groups.set(hostOf(u), [...(groups.get(hostOf(u)) ?? []), i]));

  const queue = [...groups.values()];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let g = queue.shift(); g; g = queue.shift()) {
        for (const [k, i] of g.entries()) {
          if (k > 0) await sleep(gapMs);
          out[i] = await fn(urls[i]!, i).catch(() => fallback);
        }
      }
    }),
  );
  return out;
}

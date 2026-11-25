import { sleep } from './util';

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};

/** Chạy fn cho nhiều URL: cùng host tuần tự (cách nhau gapMs, tránh 429), host khác nhau song song (tối đa `limit`). Kết quả giữ thứ tự đầu vào. */
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

/** Chạy các việc với tối đa `limit` việc cùng lúc (giữ bộ nhớ thấp). */
export async function pool(limit: number, tasks: (() => Promise<void>)[]): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]!();
    }),
  );
}

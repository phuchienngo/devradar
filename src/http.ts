/**
 * User-Agent dùng chung cho mọi request ra ngoài (feed, trang bài, ảnh). Khai rõ là trình đọc RSS: đo thực tế cho thấy
 * cách này qua được nhiều site hơn UA giả trình duyệt (một số site chặn UA "Chrome" từ máy chủ vì không giống Chrome thật).
 */
export const USER_AGENT = 'Mozilla/5.0 (compatible; devradar/0.1; +rss reader)';

interface RetryOpts {
  /** Số lần thử lại tối đa (không tính lần đầu). */
  retries?: number;
  /** Chờ tối đa mỗi lần; server yêu cầu chờ lâu hơn thì bỏ cuộc và trả luôn response. */
  maxWaitMs?: number;
  /** Timeout mỗi lần gọi. */
  timeoutMs?: number;
  /** Mã trạng thái được thử lại. */
  statuses?: number[];
  /** Tự đọc thời gian chờ (ms) từ response, ví dụ trường retry_after trong body JSON. null = dùng header/backoff. */
  delayFrom?: (res: Response) => Promise<number | null>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterHeader(res: Response): number | null {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  if (/^\d+$/.test(h)) return Number(h) * 1000;
  const t = Date.parse(h); // dạng HTTP-date
  return Number.isNaN(t) ? null : Math.max(0, t - Date.now());
}

/**
 * fetch có thử lại khi gặp 429/503: ưu tiên thời gian server yêu cầu (Retry-After),
 * không có thì backoff luỹ thừa + jitter. Luôn trả về response cuối cùng (kể cả khi vẫn lỗi).
 */
export async function fetchRetry(url: string, init: RequestInit = {}, opts: RetryOpts = {}): Promise<Response> {
  const { retries = 3, maxWaitMs = 20_000, timeoutMs = 15_000, statuses = [429, 503] } = opts;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok || !statuses.includes(res.status) || attempt >= retries) return res;

    const wanted =
      (opts.delayFrom ? await opts.delayFrom(res).catch(() => null) : null) ??
      retryAfterHeader(res) ??
      Math.min(1000 * 2 ** attempt, maxWaitMs) + Math.random() * 500;
    if (wanted > maxWaitMs) return res; // server bắt chờ quá lâu: để lần chạy sau
    await res.body?.cancel().catch(() => {});
    await sleep(wanted + 100);
  }
}

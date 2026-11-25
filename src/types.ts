export interface Env {
  GOOGLE_CHAT_WEBHOOK_URL: string; // wrangler secret put GOOGLE_CHAT_WEBHOOK_URL
  /** Tuỳ chọn (wrangler secret put OPENALEX_API_KEY): không có khoá thì OpenAlex hay trả 429 từ IP Cloudflare. */
  OPENALEX_API_KEY?: string;
  /** Địa chỉ trang điều khiển, không có dấu / cuối (xem wrangler.jsonc). */
  SITE_URL?: string;
  DB: D1Database; // lịch sử các bài đã gửi + dedupe + khoá chạy
}

export interface Item {
  /** id trong D1; có thì card có nút mở bản lưu. */
  id?: string;
  url: string;
  title: string;
  source: string;
  channel: string;
  publishedAt: number | null; // epoch ms
  snippet: string;
  content: string;
}

/** Bài vừa đọc từ feed, chưa tạo tóm tắt/nội dung (tốn CPU nên chỉ làm cho bài sắp lưu). `block` là đoạn XML gốc. */
export type Candidate = Omit<Item, 'snippet' | 'content'> & {
  block: string;
  /** Nguồn không phải feed (paper từ API) đã có sẵn tóm tắt/nội dung. */
  hydrated?: Pick<Item, 'snippet' | 'content'>;
};

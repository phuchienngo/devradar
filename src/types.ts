export interface Env {
  GOOGLE_CHAT_WEBHOOK_URL: string; // wrangler secret put GOOGLE_CHAT_WEBHOOK_URL
  DB: D1Database; // lịch sử các bài đã gửi + dedupe + khoá chạy
}

export interface Item {
  url: string;
  title: string;
  source: string;
  channel: string;
  publishedAt: number | null; // epoch ms
  snippet: string;
  /** Văn bản đầy đủ nếu feed có kèm; rỗng nếu chỉ có tóm tắt. */
  content: string;
}

/** Bài vừa đọc từ feed, chưa tạo tóm tắt/nội dung (việc đó tốn CPU nên chỉ làm cho bài sắp gửi). `block` là đoạn XML gốc. */
export type Candidate = Omit<Item, 'snippet' | 'content'> & { block: string };

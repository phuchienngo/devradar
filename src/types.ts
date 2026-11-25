export interface Env {
  KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string; // wrangler secret put TELEGRAM_BOT_TOKEN
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_ERROR_CHAT_ID?: string; // tuỳ chọn, mặc định dùng TELEGRAM_CHAT_ID
  GOOGLE_CHAT_WEBHOOK_URL?: string; // tuỳ chọn; wrangler secret put GOOGLE_CHAT_WEBHOOK_URL
}

export interface Item {
  url: string;
  title: string;
  source: string;
  channel: string;
  publishedAt: number | null; // epoch ms
  snippet: string;
}

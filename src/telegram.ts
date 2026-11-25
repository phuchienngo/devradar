import { fetchRetry } from './http';
import type { Env, Item } from './types';

const LIMIT = 4096;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ICON: Record<string, string> = { backend: '⚙️', ai: '🤖', releases: '🚀', digest: '📰' };

function line(it: Item): string {
  const snip = it.snippet ? `\n<i>${esc(it.snippet.slice(0, 200))}${it.snippet.length > 200 ? '…' : ''}</i>` : '';
  return `${ICON[it.channel] ?? '•'} <a href="${esc(it.url)}">${esc(it.title)}</a>\n<code>${esc(it.source)}</code>${snip}`;
}

interface SendOpts {
  chatId?: string;
  /** Hiện link preview (mặc định tắt). */
  preview?: boolean;
  /** Không phát âm báo. */
  silent?: boolean;
}

// Telegram báo thời gian chờ trong body: {"parameters":{"retry_after":N}}
async function telegramRetryAfter(res: Response): Promise<number | null> {
  const j = (await res.clone().json()) as { parameters?: { retry_after?: number } };
  const s = j.parameters?.retry_after;
  return typeof s === 'number' ? s * 1000 : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendText(env: Env, text: string, opts: SendOpts = {}): Promise<void> {
  const res = await fetchRetry(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: opts.chatId ?? env.TELEGRAM_CHAT_ID,
      text: text.slice(0, LIMIT),
      parse_mode: 'HTML',
      disable_web_page_preview: !opts.preview,
      disable_notification: opts.silent ?? false,
    }),
  }, { delayFrom: telegramRetryAfter });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Mỗi bài một tin, cách nhau ~1,1 giây (giới hạn ~1 tin/giây/chat). Chỉ tin đầu có âm báo.
 * Trả về các bài đã gửi thành công; dừng ở lỗi đầu tiên (bài chưa gửi sẽ được thử lại lần sau).
 */
export async function sendItems(env: Env, items: Item[]): Promise<{ sent: Item[]; error?: string }> {
  const sent: Item[] = [];
  for (const [i, it] of items.entries()) {
    if (i > 0) await sleep(1100);
    try {
      await sendText(env, line(it), { preview: true, silent: i > 0 });
      sent.push(it);
    } catch (e) {
      return { sent, error: (e as Error).message };
    }
  }
  return { sent };
}

export async function sendError(env: Env, text: string): Promise<void> {
  await sendText(env, `⚠️ <b>devradar</b>\n${esc(text)}`, { chatId: env.TELEGRAM_ERROR_CHAT_ID || env.TELEGRAM_CHAT_ID });
}

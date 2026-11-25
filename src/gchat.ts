import { fetchOgImages } from './ogimage';
import type { Env, Item } from './types';

const ICON: Record<string, string> = { backend: '⚙️', ai: '🤖' };

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Mỗi bài là một card: tiêu đề + nguồn, đoạn trích, nút "Đọc bài". */
function card(it: Item, n: number, image: string | null) {
  const widgets: unknown[] = [];
  if (image) widgets.push({ image: { imageUrl: image, altText: it.title.slice(0, 100), onClick: { openLink: { url: it.url } } } });
  if (it.snippet) {
    const snip = it.snippet.slice(0, 220) + (it.snippet.length > 220 ? '…' : '');
    widgets.push({ textParagraph: { text: escHtml(snip) } });
  }
  widgets.push({
    buttonList: { buttons: [{ text: 'Đọc bài', onClick: { openLink: { url: it.url } } }] },
  });
  return {
    cardId: `item-${n}`,
    card: {
      header: { title: it.title.slice(0, 300), subtitle: `${ICON[it.channel] ?? '•'} ${it.source}` },
      sections: [{ widgets }],
    },
  };
}

async function post(url: string, body: unknown, retry = true): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 2000));
    return post(url, body, false);
  }
  // Không đưa URL (chứa key/token) vào thông báo lỗi.
  if (!res.ok) throw new Error(`Google Chat ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

/**
 * Mỗi bài một tin, cách nhau ~1,1 giây (~1 request/giây/space). No-op nếu chưa cấu hình URL.
 * Dừng ở lỗi đầu tiên và ném lỗi; không ảnh hưởng Telegram.
 */
export async function sendToGoogleChat(env: Env, items: Item[]): Promise<void> {
  if (!env.GOOGLE_CHAT_WEBHOOK_URL || !items.length) return;
  const images = await fetchOgImages(items.map((it) => it.url)); // preview kiểu Telegram
  for (const [i, it] of items.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    await post(env.GOOGLE_CHAT_WEBHOOK_URL, { cardsV2: [card(it, i, images[i] ?? null)] });
  }
}

import { fetchRetry } from './http';
import { fetchOgImages } from './ogimage';
import type { Env, Item } from './types';

const ICON: Record<string, string> = { backend: '⚙️', ai: '🤖', security: '🔒', paper: '📄' };

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetchRetry(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  // Không đưa URL (chứa key/token) vào thông báo lỗi.
  if (!res.ok) throw new Error(`Google Chat ${res.status}: ${(await res.text()).slice(0, 160)}`);
}

/** Mỗi bài một tin, cách nhau ~1,1 s (webhook giới hạn ~1 request/giây). Dừng ở lỗi đầu tiên và trả các bài đã gửi được để chỉ đánh dấu những bài đó. */
export async function sendToGoogleChat(env: Env, items: Item[]): Promise<{ sent: Item[]; error?: string }> {
  const sent: Item[] = [];
  if (!items.length) return { sent };
  const images = await fetchOgImages(items.map((it) => it.url)); // ảnh preview cho card
  for (const [i, it] of items.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    try {
      await post(env.GOOGLE_CHAT_WEBHOOK_URL, { cardsV2: [card(it, i, images[i] ?? null)] });
      sent.push(it);
    } catch (e) {
      return { sent, error: (e as Error).message };
    }
  }
  return { sent };
}

export async function sendTextToGoogleChat(env: Env, text: string): Promise<void> {
  await post(env.GOOGLE_CHAT_WEBHOOK_URL, { text: `⚠️ devradar\n${text}`.slice(0, 3900) });
}

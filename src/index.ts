import { MAX_AGE_DAYS, MAX_PER_RUN, SOURCES } from './config';
import { hashUrl, loadSeen, saveSeen } from './dedupe';
import { sendToGoogleChat } from './gchat';
import { fetchSource } from './sources';
import { sendError, sendItems } from './telegram';
import type { Env, Item } from './types';

export async function run(env: Env): Promise<string> {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const errors: string[] = [];
  const all: Item[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else errors.push(`${SOURCES[i]!.name}: ${(r.reason as Error).message ?? r.reason}`);
  });

  const prev = await loadSeen(env.KV);
  const seen = new Set(prev ?? []);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;

  const hashOf = new Map<Item, string>();
  const fresh: Item[] = [];
  const processed: string[] = []; // hash đánh dấu đã xử lý
  const dup = new Set<string>();
  for (const item of all) {
    const hash = await hashUrl(item.url);
    if (seen.has(hash) || dup.has(hash)) continue;
    dup.add(hash);
    hashOf.set(item, hash);
    if (item.publishedAt !== null && item.publishedAt < cutoff) processed.push(hash); // quá cũ
    else fresh.push(item);
  }

  let toSend: Item[] = [];
  if (prev === null) {
    // Lần chạy đầu: chỉ đánh dấu đã thấy, không gửi để khỏi ngập chat.
    for (const it of fresh) processed.push(hashOf.get(it)!);
  } else {
    // Cũ → mới để đọc theo thứ tự thời gian; phần vượt MAX_PER_RUN gửi ở lần sau.
    fresh.sort((a, b) => (a.publishedAt ?? 0) - (b.publishedAt ?? 0));
    toSend = fresh.slice(0, MAX_PER_RUN);
  }

  if (toSend.length) {
    // Telegram và Google Chat gửi song song; chỉ Telegram quyết định bài nào đã "xử lý".
    const [tg, gc] = await Promise.allSettled([sendItems(env, toSend), sendToGoogleChat(env, toSend)]);
    if (tg.status === 'fulfilled') {
      for (const it of tg.value.sent) processed.push(hashOf.get(it)!);
      toSend = tg.value.sent;
      if (tg.value.error) errors.push(`Telegram: ${tg.value.error}`);
    } else {
      toSend = [];
      errors.push(`Telegram: ${(tg.reason as Error).message}`);
    }
    if (gc.status === 'rejected') errors.push((gc.reason as Error).message); // không chặn Telegram
  }
  await saveSeen(env.KV, prev ?? [], processed);

  if (errors.length) {
    console.warn(errors.join(' ; '));
    await sendError(env, errors.join('\n')).catch(() => {});
  }
  return `sources=${SOURCES.length} fetched=${all.length} new=${fresh.length} sent=${toSend.length} errors=${errors.length}${prev === null ? ' (seeded)' : ''}`;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      run(env).then(console.log, (e) => sendError(env, String(e)).catch(() => console.error(e))),
    );
  },
} satisfies ExportedHandler<Env>;

// Lấy bài cũ của một blog WordPress qua ?paged=N và tạo file SQL (không ghi gì lên D1).
// Dùng: npm run backfill -- "ScyllaDB" [số trang tối đa]
// Rồi:  npx wrangler d1 execute devradar-history --remote --file .wrangler/backfill.sql
import { writeFileSync } from 'node:fs';
import { SOURCES } from '../src/config';
import { hashUrl } from '../src/dedupe';
import { parseFeed } from '../src/sources';
import { USER_AGENT } from '../src/http';

declare const process: { argv: string[]; exit(code: number): never };

const [name, maxArg] = process.argv.slice(2);
const src = SOURCES.find((s) => s.name === name);
if (!src || src.type !== 'rss') {
  console.error(`Không có nguồn RSS "${name}". Có: ${SOURCES.filter((s) => s.type === 'rss').map((s) => s.name).join(', ')}`);
  process.exit(1);
}
const maxPages = Number(maxArg) || 300;

const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

const seen = new Set<string>();
const rows: string[] = [];
const now = Date.now();
for (let page = 1; page <= maxPages; page++) {
  const res = await fetch(`${src.url}${src.url.includes('?') ? '&' : '?'}paged=${page}`, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) break; // WordPress trả 404 khi hết trang
  const items = parseFeed(await res.text(), src);
  const fresh = items.filter((c) => !seen.has(c.url));
  if (!fresh.length) break; // feed không hỗ trợ paged (trả lại trang đầu)
  for (const c of fresh) {
    seen.add(c.url);
    const hash = await hashUrl(c.url);
    // body rỗng + crawled = 0: để bước crawl của Worker tải bản đầy đủ dần
    rows.push(
      `INSERT OR IGNORE INTO articles (id, url, title, summary, body, body_tries, source, channel, published_at, sent_at, sent, crawled) VALUES (${q(hash)}, ${q(c.url)}, ${q(c.title)}, '', '', 0, ${q(c.source)}, ${q(c.channel)}, ${q(c.publishedAt)}, ${now}, 0, 0);`,
    );
  }
  console.log(`trang ${page}: +${fresh.length} (tổng ${rows.length})`);
  await new Promise((r) => setTimeout(r, 400));
}
writeFileSync('.wrangler/backfill.sql', rows.join('\n') + '\n');
console.log(`Xong: ${rows.length} bài -> .wrangler/backfill.sql (INSERT OR IGNORE, bài đã có sẽ bị bỏ qua)`);

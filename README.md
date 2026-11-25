# 📡 devradar

Bot chạy trên Cloudflare Workers: mỗi giờ quét ~80 engineering blog / advisory bảo mật qua RSS/Atom, lọc bài mới
và gửi **mỗi bài một card** vào Google Chat. Không dùng LLM, không lọc theo từ khoá.

- Dedupe, lịch sử và khoá chống chạy chồng đều nằm trong **Cloudflare D1**.
- Có trang web (`GET /`) để xem trước / chạy tay và **tìm lại lịch sử** (full-text search).
- Deploy bằng `npm run deploy` (workflow GitHub Actions đã được gỡ tạm).

## Luồng chạy

```
cron (mỗi giờ, UTC)  ─┐
nút "Chạy ngay"      ─┴─► khoá (D1) ─► tải ~80 feed ─► bỏ bài đã gửi (D1) / quá 3 ngày
                                         ─► cũ → mới, tối đa 30 bài ─► Google Chat (1 card/bài, có ảnh og:image)
                                         ─► ghi bài đã gửi vào D1 (vừa là lịch sử vừa là dedupe)
```

- Mỗi nguồn độc lập: một feed lỗi không ảnh hưởng nguồn khác. Lỗi được báo vào chính Google Chat.
- Chỉ bài **gửi thành công** mới được ghi vào D1; bài lỗi sẽ thử lại ở lượt sau.
- Bài vượt giới hạn 30 bài/lượt sẽ được gửi ở các giờ sau.
- HTTP 429/503 được retry theo `Retry-After`.

## Cấu trúc

| File | Việc |
|---|---|
| `src/index.ts` | `scheduled` (cron) + `fetch` (trang web, `/history`, `/run`), khoá, điều phối |
| `src/config.ts` | **Danh sách nguồn** và các hằng số (`MAX_PER_RUN`, `MAX_AGE_DAYS`) |
| `src/sources.ts` | Parse RSS/Atom |
| `src/dedupe.ts` | Chuẩn hoá URL, hash |
| `src/history.ts` | D1: tự tạo bảng, dedupe, khoá, ghi và tìm kiếm (FTS5) |
| `src/gchat.ts` | Dựng card, gửi Google Chat |
| `src/ogimage.ts` | Lấy ảnh preview |
| `src/ui.ts` | Trang điều khiển (Bootstrap 5.3 qua CDN) |

## Chuẩn bị (làm một lần)

Yêu cầu: Node 22+, tài khoản Cloudflare **gói Workers Paid** (bot cần nhiều subrequest hơn gói free), Google Chat space.

1. **Webhook Google Chat:** trong space, *Apps & integrations → Webhooks* → tạo webhook, copy URL.
2. **Cài đặt:**
   ```sh
   npm ci
   npx wrangler login
   ```
3. **Tạo D1** rồi dán `database_id` vào `wrangler.jsonc` (mục `d1_databases`):
   ```sh
   npx wrangler d1 create devradar-history
   ```
   Bảng và index tự tạo ở lần chạy đầu, **không cần migration**.
4. **Secret của Worker:**
   ```sh
   npx wrangler secret put GOOGLE_CHAT_WEBHOOK_URL
   ```
5. **Bảo vệ trang điều khiển bằng Cloudflare Access.** Code **không có xác thực**: ai vào được trang là bấm được
   "Chạy ngay" và xem lịch sử. Hãy gắn domain riêng (hoặc workers.dev) vào một *Access application* với policy
   chỉ cho email của bạn **trước khi** deploy. `workers_dev` đang tắt, chỉ vào qua domain riêng.

## Deploy

Chạy `npm run deploy` (cần đã `wrangler login`). Workflow GitHub Actions từng có (typecheck + deploy khi push `main`) đã bị revert; khôi phục bằng `git revert` commit revert đó.

> **Lần chạy đầu:** D1 trống nên bot sẽ gửi ngay 30 bài mới nhất (≤ 3 ngày) vào chat, phần còn lại gửi dần ở các giờ sau.

## Chạy cục bộ

Tạo `.dev.vars` (đã gitignore):

```
GOOGLE_CHAT_WEBHOOK_URL=https://chat.googleapis.com/v1/spaces/...
```

```sh
npm run dev                     # wrangler dev --test-scheduled, D1 là bản local (SQLite)
curl "http://localhost:8787/__scheduled"   # kích hoạt cron thủ công (gửi thật vào Google Chat!)
npm run typecheck
```

`POST /run` chỉ nhận request cùng origin (từ chính trang web), nên dùng nút trên trang `http://localhost:8787/`.

## Cấu hình

- **Thêm / tắt nguồn:** sửa `BLOGS` trong `src/config.ts`: `rss('Tên', 'https://…/feed', 'backend')`, tắt bằng tham số thứ 4 `false`.
  Kênh: `backend`, `ai`, `security` (hiển thị biểu tượng ở `src/gchat.ts`).
- **Số bài mỗi lượt:** `MAX_PER_RUN` (mặc định 30). Card cách nhau ~1,1 s vì webhook Google Chat giới hạn ~1 request/giây.
- **Tuổi tối đa của bài:** `MAX_AGE_DAYS` (mặc định 3).
- **Lịch chạy:** `triggers.crons` trong `wrangler.jsonc` (UTC).

## Vận hành

- **Gửi lại từ đầu:** xoá dữ liệu D1 (`DELETE FROM articles` qua `wrangler d1 execute devradar-history --remote`). Lượt sau sẽ gửi lại các bài ≤ 3 ngày.
- **Export D1:** D1 không export được database có virtual table. Xoá `articles_fts` trước khi export; nó dựng lại được từ bảng `articles` (bảng tự tạo lại khi Worker chạy).
- **Tìm kiếm** trên trang: FTS5 trên tiêu đề + tóm tắt + nguồn (bỏ dấu tiếng Việt, gõ dở từ vẫn khớp). Chuỗi có `/` được coi là tìm theo link.
- **Khoá:** bảng `locks` chống cron và nút bấm chạy chồng nhau, tự hết hạn sau 10 phút.

## Giới hạn đã biết

- Placement (`aws:ap-southeast-1`) chỉ áp dụng cho `fetch` (trang web), không áp dụng cho cron.
- Một số blog không có RSS công khai hoặc chặn bot (Uber, LinkedIn, DoorDash…), nên không có trong danh sách.
- Chỉ lưu **tóm tắt trong feed**, không tải toàn bộ bài.

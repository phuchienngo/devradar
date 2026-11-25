# 📡 devradar

Bot chạy trên Cloudflare Workers: mỗi giờ quét ~85 engineering blog / advisory bảo mật qua RSS/Atom, lưu bài mới vào D1
và gửi **mỗi giờ một bài ngẫu nhiên** (một card) vào Google Chat, đồng thời tải dần nội dung đầy đủ của các bài đã lưu. Không dùng LLM, không lọc theo từ khoá.

- Dedupe, lịch sử và khoá chống chạy chồng đều nằm trong **Cloudflare D1**.
- Có trang web (`GET /`) để chạy tay, **tìm lại lịch sử** (full-text search) và đọc lại **bản lưu nội dung bài dạng Markdown** (`/read`), phòng khi bài bị xoá.
- Deploy bằng `npm run deploy` (workflow GitHub Actions đã được gỡ tạm).

## Luồng chạy

```
cron (mỗi giờ, UTC)  ─┐
nút "Chạy ngay"      ─┴─► khoá (D1) ─► 1. LƯU:   đọc ~85 feed ─► bài chưa có trong D1, mới → cũ, tối đa 1000 bài
                                                  ─► ghi vào D1 với sent = 0 (kèm tóm tắt + nội dung từ feed)
                                       2. GỬI:   chọn ngẫu nhiên 1 bài sent = 0 ─► Google Chat (card, ảnh og:image) ─► sent = 1
                                       3. CRAWL: tải trang đầy đủ của 100 bài chưa có nội dung đầy đủ ─► Markdown vào D1
```

- Mỗi nguồn độc lập: một feed lỗi không ảnh hưởng nguồn khác. Lỗi đơn lẻ (429, timeout) rất hay gặp từ IP Cloudflare nên **chỉ báo vào Google Chat khi một nguồn lỗi 3 lượt liên tiếp** (rồi nhắc lại mỗi 24 lượt nếu vẫn lỗi); bộ đếm nằm ở bảng `source_state`.
- **Lưu, gửi và crawl tách riêng:** D1 được lấp đầy nhanh (tới `MAX_INGEST_PER_RUN` = 1000 bài mỗi lượt, bài mới trước), Google Chat nhận `MAX_PER_RUN` = 1 bài mỗi giờ, chọn ngẫu nhiên trong hàng chờ. Cột `articles.sent` phân biệt: 0 = đã lưu chưa gửi, 1 = đã gửi. Bài gửi lỗi vẫn `sent = 0` nên lượt sau gửi lại. Trang lịch sử/tìm kiếm tìm trên **tất cả** bài, có bộ lọc Tất cả / Đã gửi / Chưa gửi.
- **Crawl nội dung:** feed thường chỉ có tóm tắt ngắn mà bài hay bị xoá, nên mỗi lượt bot tải trang đầy đủ của `CRAWL_PER_RUN` (100) bài đã lưu, mới nhất trước, lưu Markdown vào `body`. Cột `crawled`: 0 = còn chờ tải, 1 = xong (đã tải, feed đã đủ bài, paper, hoặc bỏ cuộc sau `MAX_CRAWL_TRIES` = 3 lần lỗi). Log mỗi lượt có `queue_send=` (bài chờ gửi) và `queue_crawl=` (bài chờ tải trang).
- Bài nào cũng được lưu bất kể tuổi, nên backlog được gửi dần (mỗi giờ một bài, thứ tự ngẫu nhiên) cho tới khi hết.
- HTTP 429/503 được retry theo `Retry-After`.

## Cấu trúc

| File | Việc |
|---|---|
| `src/index.ts` | `scheduled` (cron) + `fetch` (trang web, `/history`, `/read`, `/run`), khoá, điều phối |
| `src/config.ts` | **Danh sách nguồn** và các hằng số (`MAX_PER_RUN`, `MAX_INGEST_PER_RUN`, `CRAWL_PER_RUN`) |
| `src/sources.ts` | Parse RSS/Atom, tạo tóm tắt/nội dung cho bài sắp gửi |
| `src/papers.ts` | Paper của các công ty lớn tại hội nghị hệ thống/CSDL/thuật toán, qua OpenAlex (JSON) |
| `src/archive.ts` | Lưu nội dung bài (feed hoặc tải trang → Markdown), thử lại bài trượt |
| `src/text.ts` | HTML → Markdown, giải mã entity |
| `src/hosts.ts` | Chạy song song theo host, cùng host thì tuần tự (tránh 429) |
| `src/dedupe.ts` | Chuẩn hoá URL, hash |
| `src/history.ts` | D1: tự tạo bảng, dedupe, khoá, ghi và tìm kiếm (FTS5) |
| `src/gchat.ts` | Dựng card, gửi Google Chat |
| `src/ogimage.ts` | Lấy ảnh preview |
| `src/pages.ts` + `src/web/*.html` | Trang điều khiển và trang đọc bản lưu: template là file HTML thật (Bootstrap 5.3 qua CDN) |
| `src/template.ts` | Template kiểu Mustache cỡ 10 dòng: `{{x}}` tự escape, `{{{x}}}` chèn nguyên văn |

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
   Bảng và index tự tạo ở lần chạy đầu, **không cần migration** (DB cũ chưa có cột `sent` sẽ được tự thêm, các bài sẵn có coi như đã gửi).
4. **Secret của Worker:**
   ```sh
   npx wrangler secret put GOOGLE_CHAT_WEBHOOK_URL
   npx wrangler secret put OPENALEX_API_KEY   # tuỳ chọn nhưng nên có: khoá OpenAlex miễn phí (openalex.org → Settings → API key)
   ```
   Không có khoá thì OpenAlex tính ngân sách theo IP và hay trả 429 trên Cloudflare, nguồn paper sẽ hay lỗi.
5. **Bảo vệ trang điều khiển bằng Cloudflare Access.** Code **không có xác thực**: ai vào được trang là bấm được
   "Chạy ngay" và xem lịch sử. Hãy gắn domain riêng (hoặc workers.dev) vào một *Access application* với policy
   chỉ cho email của bạn **trước khi** deploy. `workers_dev` đang tắt, chỉ vào qua domain riêng.

## Deploy

Chạy `npm run deploy` (cần đã `wrangler login`). Workflow GitHub Actions từng có (typecheck + deploy khi push `main`) đã bị revert; khôi phục bằng `git revert` commit revert đó.

> **Lần chạy đầu:** D1 trống nên lượt đầu lưu tối đa 1000 bài mới nhất, các lượt sau lưu nốt phần còn lại (và đọc lùi các trang cũ của feed phân trang). Google Chat nhận mỗi giờ một bài ngẫu nhiên nên backlog hàng chục nghìn bài mất rất lâu; muốn nhanh hơn thì tăng `MAX_PER_RUN`.

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
  Kênh: `backend`, `ai`, `security`, `paper` (hiển thị biểu tượng ở `src/gchat.ts`).
- **Paper:** `PAPER_VENUES` (hội nghị), `PAPER_COMPANIES` (mã tổ chức OpenAlex) và `PAPER_WINDOW_DAYS` (chỉ lấy paper trong N ngày gần đây) trong `src/config.ts`. Hiện khoảng 230 paper/năm từ VLDB, SIGMOD, ICDE, SIGCOMM, ASPLOS, EuroSys, SOSP, STOC, FOCS. NSDI, USENIX ATC, FAST, SoCC, CIDR, PODC, SODA đã khai báo sẵn nhưng OpenAlex chưa có dữ liệu mới cho chúng. Nội dung lưu của paper là abstract.
- **Số bài gửi mỗi giờ:** `MAX_PER_RUN` (mặc định 1, chọn ngẫu nhiên). Nhiều bài thì card cách nhau ~1,1 s vì webhook Google Chat giới hạn ~1 request/giây.
- **Lịch chạy:** `triggers.crons` trong `wrangler.jsonc` (UTC), hiện `0 * * * *` = đầu mỗi giờ.

## Vận hành

- **Gửi lại từ đầu:** xoá dữ liệu D1 (`DELETE FROM articles` qua `wrangler d1 execute devradar-history --remote`); lượt sau lưu lại toàn bộ rồi gửi dần 10 bài/lượt. Muốn bỏ qua backlog hiện có mà không gửi: `UPDATE articles SET sent = 1`.
- **Export D1:** D1 không export được database có virtual table. Xoá `articles_fts` trước khi export; nó dựng lại được từ bảng `articles` (bảng tự tạo lại khi Worker chạy).
- **Tìm kiếm** trên trang: FTS5 trên tiêu đề + tóm tắt + nội dung + nguồn (bỏ dấu tiếng Việt, gõ dở từ vẫn khớp). Chuỗi có `/` được coi là tìm theo link.
- **Bản lưu nội dung:** lưu Markdown trong cột `body` (tối đa 100.000 ký tự/bài). Nội dung được crawl dần cho mọi bài đã lưu (không chờ tới lúc gửi); bài tải lỗi được thử lại tối đa 3 lần. Xem ở `/read?id=…`, tải `.md` bằng `&format=md`. Trang dựng bằng JS hoặc chặn bot có thể không lấy được.
- **Khoá:** bảng `locks` chống cron và nút bấm chạy chồng nhau, tự hết hạn sau 10 phút.

## Giới hạn đã biết

- **Bộ nhớ Worker 128 MB:** mỗi bài giữ cả khối XML thô nên không gom hết các feed rồi mới lọc. Mỗi nguồn/trang được lọc ngay (bỏ bài đã có trong D1), đọc tối đa `FETCH_CONCURRENCY` (8) nguồn cùng lúc, và chỉ giữ tối đa 2 × `MAX_INGEST_PER_RUN` bài mới nhất. Vượt bộ nhớ thì Worker bị cắt giữa chừng (lỗi 503) và không kịp nhả khoá (tự hết hạn sau 10 phút).
- Placement (`aws:ap-southeast-1`) chỉ áp dụng cho `fetch` (trang web), không áp dụng cho cron.
- Một số blog không có RSS công khai hoặc chặn bot (Uber, LinkedIn, DoorDash…), nên không có trong danh sách.
- Bản lưu chỉ là Markdown: ảnh vẫn trỏ về site gốc (mất nếu họ xoá), bảng và danh sách lồng nhau bị làm phẳng. Dùng cho tra cứu cá nhân, đừng đăng lại.

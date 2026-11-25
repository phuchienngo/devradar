/** Trang điều khiển: GET / (nằm sau Cloudflare Access). Chỉ dùng textContent để tránh chèn HTML từ tiêu đề bài. */
export const PAGE = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>devradar</title>
<style>
  :root { --bg:#fafafa; --fg:#1a1a1a; --mut:#666; --card:#fff; --bd:#ddd; --ac:#2563eb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111; --fg:#eee; --mut:#999; --card:#1b1b1b; --bd:#333; --ac:#60a5fa; } }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width:640px; margin:0 auto; padding:24px 16px; }
  h1 { font-size:1.4rem; margin:0 0 4px; } p.sub { color:var(--mut); margin:0 0 20px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; }
  button { flex:1; min-width:140px; padding:12px 16px; font:inherit; font-weight:600; border-radius:8px; cursor:pointer;
           border:1px solid var(--ac); background:var(--ac); color:#fff; }
  button.alt { background:transparent; color:var(--ac); }
  button:disabled { opacity:.5; cursor:wait; }
  #out { margin-top:20px; padding:16px; background:var(--card); border:1px solid var(--bd); border-radius:8px; display:none; }
  #sum { font-family:ui-monospace,monospace; font-size:.9rem; word-break:break-word; }
  ul { padding-left:20px; margin:12px 0 0; } li { margin:4px 0; } .src { color:var(--mut); font-size:.85rem; }
  .err { color:#dc2626; margin-top:12px; font-size:.9rem; }
  h2 { font-size:1.1rem; margin:32px 0 12px; }
  .filters { display:flex; gap:8px; flex-wrap:wrap; }
  input, select { padding:10px 12px; font:inherit; border-radius:8px; border:1px solid var(--bd); background:var(--card); color:var(--fg); min-width:0; }
  input { flex:2; min-width:160px; } select { flex:1; min-width:120px; }
  #hist { list-style:none; padding:0; margin:12px 0 0; }
  #hist li { padding:10px 0; border-bottom:1px solid var(--bd); margin:0; }
  #hist a { color:var(--fg); text-decoration:none; font-weight:500; } #hist a:hover { text-decoration:underline; color:var(--ac); }
  .pager { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; color:var(--mut); font-size:.9rem; }
  .pager button { flex:none; min-width:0; padding:8px 14px; }
  #hmsg { color:var(--mut); margin-top:12px; }
</style>
</head>
<body>
<main>
  <h1>📡 devradar</h1>
  <p class="sub">Chạy thủ công bot quét tin kỹ thuật.</p>
  <div class="row">
    <button id="dry" class="alt">👀 Xem trước (không gửi)</button>
    <button id="run">▶️ Chạy ngay</button>
  </div>
  <div id="out"><div id="sum"></div><ul id="list"></ul><div id="errs" class="err"></div></div>
  <h2>🗂️ Lịch sử đã gửi</h2>
  <div class="filters">
    <input id="q" type="search" placeholder="Tìm theo tiêu đề, tóm tắt hoặc link…" autocomplete="off">
    <select id="src"><option value="">Mọi nguồn</option></select>
  </div>
  <div id="hmsg"></div>
  <ul id="hist"></ul>
  <div class="pager"><button id="prev" class="alt">← Trước</button><span id="pinfo"></span><button id="next" class="alt">Sau →</button></div>
</main>
<script>
const $ = (id) => document.getElementById(id);
async function go(dry) {
  if (!dry && !confirm('Chạy thật? Bot sẽ gửi các bài mới vào Google Chat.')) return;
  const btns = [$('dry'), $('run')];
  btns.forEach((b) => (b.disabled = true));
  $('out').style.display = 'block';
  $('sum').textContent = 'Đang chạy… (có thể mất vài chục giây)';
  $('list').replaceChildren(); $('errs').textContent = '';
  try {
    const res = await fetch('/run' + (dry ? '?dry=1' : ''), { method: 'POST' });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('HTTP ' + res.status + (res.redirected ? ' (phiên đăng nhập hết hạn? tải lại trang)' : ''));
    const d = await res.json();
    $('sum').textContent = d.summary || d.error || 'HTTP ' + res.status;
    for (const w of d.wouldSend || []) {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.href = w.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = w.title;
      const s = document.createElement('div'); s.className = 'src'; s.textContent = w.source;
      li.append(a, s); $('list').append(li);
    }
    if (d.errors && d.errors.length) $('errs').textContent = 'Lỗi:\\n' + d.errors.join('\\n');
  } catch (e) {
    $('sum').textContent = 'Lỗi: ' + e.message;
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}
$('dry').onclick = () => go(true);
$('run').onclick = () => go(false);

// ---- Lịch sử ----
let page = 1, timer, loadedSources = false;
const fmt = (ms) => new Date(ms).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
async function loadHist() {
  $('hmsg').textContent = 'Đang tải…';
  const qs = new URLSearchParams({ q: $('q').value.trim(), source: $('src').value, page: String(page) });
  try {
    const res = await fetch('/history?' + qs);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('HTTP ' + res.status + ' (tải lại trang nếu phiên đăng nhập hết hạn)');
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    if (!loadedSources) {
      loadedSources = true;
      for (const s of d.sources) { const o = document.createElement('option'); o.value = s; o.textContent = s; $('src').append(o); }
    }
    $('hist').replaceChildren();
    for (const r of d.rows) {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.title;
      const m = document.createElement('div'); m.className = 'src'; m.textContent = r.source + ' · gửi ' + fmt(r.sentAt);
      li.append(a, m);
      const text = r.excerpt || (r.summary || '').slice(0, 160);
      if (text) {
        const x = document.createElement('div'); x.className = 'ex';
        const parts = text.split(d.hl[0]);
        x.append(parts[0]);
        for (let i = 1; i < parts.length; i++) {
          const seg = parts[i].split(d.hl[1]);
          const mk = document.createElement('mark'); mk.textContent = seg[0]; x.append(mk, seg.slice(1).join(''));
        }
        li.append(x);
      }
      $('hist').append(li);
    }
    const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    $('hmsg').textContent = d.total === 0 ? 'Chưa có bài nào.' : d.total + ' bài';
    $('pinfo').textContent = 'Trang ' + page + '/' + pages;
    $('prev').disabled = page <= 1; $('next').disabled = page >= pages;
  } catch (e) { $('hmsg').textContent = 'Lỗi: ' + e.message; }
}
$('q').oninput = () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; loadHist(); }, 300); };
$('src').onchange = () => { page = 1; loadHist(); };
$('prev').onclick = () => { page--; loadHist(); };
$('next').onclick = () => { page++; loadHist(); };
loadHist();
</script>
</body>
</html>`;

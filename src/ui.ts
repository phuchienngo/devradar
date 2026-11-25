/** Trang điều khiển: GET / (nằm sau Cloudflare Access). Chỉ dùng textContent để tránh chèn HTML từ tiêu đề bài. */
// Lưu ý: không dùng dấu backtick hay dollar-ngoặc-nhọn trong HTML/JS bên dưới (nằm trong template literal).
export const PAGE = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>devradar</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.9/dist/css/bootstrap.min.css"
  integrity="sha384-yEPZ7jP9S0QKiUQ0m3jjsO4ProIW7wvR9gXkI7JOGa2XVsw53Yke2bsdkBbjmmiX" crossorigin="anonymous">
<script>
  // Theo chế độ sáng/tối của hệ thống
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const setTheme = () => document.documentElement.setAttribute('data-bs-theme', mq.matches ? 'dark' : 'light');
  setTheme(); mq.addEventListener('change', setTheme);
</script>
<style>
  .ava { flex:none; width:40px; height:40px; border-radius:10px; display:grid; place-items:center; font-weight:700; color:#fff; }
  .card-item { transition:border-color .15s, transform .15s; } .card-item:hover { border-color:var(--bs-primary); transform:translateY(-1px); }
  .ex { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
  mark { background:#fde68a; color:#000; border-radius:3px; padding:0 2px; }
  [data-bs-theme=dark] mark { background:#6b5a12; color:#fff; }
  .toolbar { position:sticky; top:0; z-index:5; background:var(--bs-body-bg); }
  kbd.slash { position:absolute; right:10px; top:50%; transform:translateY(-50%); pointer-events:none; }
  #sum { font:.85rem/1.5 ui-monospace,Menlo,monospace; word-break:break-word; }
  .err { white-space:pre-wrap; }
</style>
</head>
<body class="bg-body-tertiary">
<header class="bg-body border-bottom">
  <div class="container py-3" style="max-width:860px">
    <div class="row g-3 align-items-center">
      <div class="col-12 col-sm">
        <h1 class="h4 mb-0">📡 devradar</h1>
        <div class="text-body-secondary small">Tin kỹ thuật từ các engineering blog, gửi về Google Chat mỗi giờ.</div>
      </div>
      <div class="col-12 col-sm-auto d-flex gap-2">
        <button id="dry" class="btn btn-outline-primary flex-fill">👀 Xem trước</button>
        <button id="run" class="btn btn-primary flex-fill">▶️ Chạy ngay</button>
      </div>
    </div>
  </div>
</header>
<main class="container py-3 pb-5" style="max-width:860px">
  <div id="out" class="card shadow-sm mb-3 d-none"><div class="card-body">
    <div id="sum" class="text-body-secondary"></div>
    <ul id="list" class="list-group list-group-flush mt-2"></ul>
    <div id="errs" class="err text-danger small mt-2"></div>
  </div></div>

  <div class="toolbar py-2"><div class="row g-2">
    <div class="col-12 col-md position-relative">
      <input id="q" type="search" class="form-control form-control-lg fs-6" placeholder="🔎 Tìm theo tiêu đề, tóm tắt hoặc link…" autocomplete="off">
      <kbd id="kbd" class="slash d-none d-md-inline">/</kbd>
    </div>
    <div class="col-12 col-md-4"><select id="src" class="form-select form-select-lg fs-6"><option value="">Mọi nguồn</option></select></div>
  </div></div>
  <div id="hmsg" class="text-body-secondary small my-2" style="min-height:1.4em"></div>
  <ul id="hist" class="list-unstyled d-grid gap-2 mb-0"></ul>
  <div class="d-flex align-items-center justify-content-between mt-3 text-body-secondary small">
    <button id="prev" class="btn btn-outline-primary btn-sm">← Trước</button><span id="pinfo"></span><button id="next" class="btn btn-outline-primary btn-sm">Sau →</button>
  </div>
</main>
<script>
const $ = (id) => document.getElementById(id);
async function go(dry) {
  if (!dry && !confirm('Chạy thật? Bot sẽ gửi các bài mới vào Google Chat.')) return;
  const btns = [$('dry'), $('run')];
  btns.forEach((b) => (b.disabled = true));
  $('out').classList.remove('d-none');
  $('sum').textContent = 'Đang chạy… (có thể mất vài chục giây)';
  $('list').replaceChildren(); $('errs').textContent = '';
  try {
    const res = await fetch('/run' + (dry ? '?dry=1' : ''), { method: 'POST' });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('HTTP ' + res.status + (res.redirected ? ' (phiên đăng nhập hết hạn? tải lại trang)' : ''));
    const d = await res.json();
    $('sum').textContent = d.summary || d.error || 'HTTP ' + res.status;
    for (const w of d.wouldSend || []) {
      const li = document.createElement('li'); li.className = 'list-group-item px-0';
      const a = document.createElement('a'); a.href = w.url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'fw-medium text-decoration-none'; a.textContent = w.title;
      const s = document.createElement('div'); s.className = 'small text-body-secondary'; s.textContent = w.source;
      li.append(a, s); $('list').append(li);
    }
    if (d.errors && d.errors.length) $('errs').textContent = 'Lỗi:\\n' + d.errors.join('\\n');
    if (!dry) { page = 1; loadHist(); }
  } catch (e) {
    $('sum').textContent = 'Lỗi: ' + e.message;
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}
$('dry').onclick = () => go(true);
$('run').onclick = () => go(false);

// ---- Lịch sử ----
let page = 1, timer, loadedSources = false, seq = 0;
const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
function ago(ms) {
  const s = (ms - Date.now()) / 1000, a = Math.abs(s);
  if (a < 60) return 'vừa xong';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 2592000) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ms).toLocaleDateString('vi-VN');
}
function hue(name) { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) % 360; return h; }

function excerpt(text, hl) {
  const x = document.createElement('div'); x.className = 'ex small text-body-secondary mt-1';
  const parts = text.split(hl[0]);
  x.append(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i].split(hl[1]);
    const mk = document.createElement('mark'); mk.textContent = seg[0]; x.append(mk, seg.slice(1).join(''));
  }
  return x;
}

function card(r, hl) {
  const li = document.createElement('li'); li.className = 'card card-item shadow-sm';
  const row = document.createElement('div'); row.className = 'card-body d-flex gap-3 p-3';
  const ava = document.createElement('div'); ava.className = 'ava';
  ava.style.background = 'hsl(' + hue(r.source) + ' 55% 45%)';
  ava.textContent = (r.source.trim()[0] || '?').toUpperCase();
  const body = document.createElement('div'); body.className = 'flex-grow-1 min-w-0'; body.style.minWidth = '0';
  const a = document.createElement('a'); a.className = 'fw-semibold text-body text-decoration-none d-block'; a.style.overflowWrap = 'anywhere';
  a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.title;
   const m = document.createElement('div'); m.className = 'd-flex flex-wrap align-items-center gap-2 mt-1 small text-body-secondary';
  const chip = document.createElement('span'); chip.className = 'badge text-bg-primary-subtle text-primary-emphasis rounded-pill'; chip.textContent = r.source;
  const when = document.createElement('span'); when.textContent = r.publishedAt ? 'đăng ' + ago(r.publishedAt) : 'gửi ' + ago(r.sentAt);
  when.title = 'Gửi lúc ' + new Date(r.sentAt).toLocaleString('vi-VN');
  m.append(chip, when);
  if (r.archived) {
    const rd = document.createElement('a'); rd.href = '/read?id=' + encodeURIComponent(r.id); rd.target = '_blank'; rd.rel = 'noopener';
    rd.className = 'small text-decoration-none'; rd.textContent = '📄 Bản lưu';
    m.append(rd);
  }
  body.append(a, m);
  const text = r.excerpt || (r.summary || '').slice(0, 220);
  if (text) body.append(excerpt(text, hl));
  row.append(ava, body); li.append(row);
  return li;
}

async function loadHist() {
  const my = ++seq;
  $('hmsg').textContent = '';
  $('hist').replaceChildren(...[1, 2, 3].map(() => { const s = document.createElement('li'); s.className = 'card placeholder-glow'; const p = document.createElement('div'); p.className = 'card-body'; const l = document.createElement('span'); l.className = 'placeholder col-8'; const l2 = document.createElement('span'); l2.className = 'placeholder col-5 mt-2 d-block'; p.append(l, l2); s.append(p); return s; }));
  const qs = new URLSearchParams({ q: $('q').value.trim(), source: $('src').value, page: String(page) });
  try {
    const res = await fetch('/history?' + qs);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('HTTP ' + res.status + ' (tải lại trang nếu phiên đăng nhập hết hạn)');
    const d = await res.json();
    if (my !== seq) return; // đã có yêu cầu mới hơn
    if (d.error) throw new Error(d.error);
    if (!loadedSources) {
      loadedSources = true;
      for (const s of d.sources) { const o = document.createElement('option'); o.value = s; o.textContent = s; $('src').append(o); }
    }
    if (d.rows.length === 0) {
      const e = document.createElement('li'); e.className = 'text-center text-body-secondary py-5';
      e.textContent = $('q').value || $('src').value ? 'Không tìm thấy bài nào khớp.' : 'Chưa có bài nào được gửi.';
      $('hist').replaceChildren(e);
    } else {
      $('hist').replaceChildren(...d.rows.map((r) => card(r, d.hl)));
    }
    const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    $('hmsg').textContent = d.total + ' bài' + ($('q').value ? ' khớp' : '');
    $('pinfo').textContent = 'Trang ' + page + '/' + pages;
    $('prev').disabled = page <= 1; $('next').disabled = page >= pages;
  } catch (e) {
    if (my !== seq) return;
    $('hist').replaceChildren(); $('hmsg').textContent = 'Lỗi: ' + e.message;
  }
}
$('q').oninput = () => { clearTimeout(timer); timer = setTimeout(() => { page = 1; loadHist(); }, 300); };
$('src').onchange = () => { page = 1; loadHist(); };
$('prev').onclick = () => { page--; loadHist(); scrollTo(0, 0); };
$('next').onclick = () => { page++; loadHist(); scrollTo(0, 0); };
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('q') && document.activeElement.tagName !== 'SELECT') { e.preventDefault(); $('q').focus(); }
  if (e.key === 'Escape' && document.activeElement === $('q')) { $('q').value = ''; $('q').blur(); page = 1; loadHist(); }
});
$('q').onfocus = () => $('kbd').classList.add('invisible');
$('q').onblur = () => $('kbd').classList.remove('invisible');
loadHist();
</script>
</body>
</html>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Trang đọc bản lưu của một bài. Mọi chuỗi đều được escape; chỉ nhận link http(s). */
export function renderArticle(a: { title: string; url: string; source: string; publishedAt: number | null; sentAt: number; body: string }): string {
  const safeUrl = /^https?:\/\//i.test(a.url) ? a.url : '#';
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const paras = a.body
    .split(/\n{2,}/)
    .map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>')
    .join('\n');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(a.title)} · devradar</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.9/dist/css/bootstrap.min.css"
  integrity="sha384-yEPZ7jP9S0QKiUQ0m3jjsO4ProIW7wvR9gXkI7JOGa2XVsw53Yke2bsdkBbjmmiX" crossorigin="anonymous">
<script>
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const setTheme = () => document.documentElement.setAttribute('data-bs-theme', mq.matches ? 'dark' : 'light');
  setTheme(); mq.addEventListener('change', setTheme);
</script>
<style> article { line-height:1.75; font-size:1.05rem; overflow-wrap:anywhere; } article p { margin:0 0 1rem; } </style>
</head>
<body class="bg-body-tertiary">
<main class="container py-4" style="max-width:760px">
  <a href="/" class="text-decoration-none small">← Quay lại</a>
  <h1 class="h3 mt-2">${esc(a.title)}</h1>
  <div class="text-body-secondary small mb-3">
    ${esc(a.source)}${a.publishedAt ? ' · đăng ' + fmt(a.publishedAt) : ''} · lưu ${fmt(a.sentAt)} ·
    <a href="${esc(safeUrl)}" target="_blank" rel="noopener">bản gốc ↗</a>
  </div>
  <div class="alert alert-secondary small">Bản lưu văn bản thô để tra cứu cá nhân; ảnh, định dạng và code block có thể bị mất.</div>
  <article class="card card-body shadow-sm">
${paras}
  </article>
</main>
</body>
</html>`;
}

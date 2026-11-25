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
<style>
  :root {
    --bg:#f6f7f9; --fg:#14171c; --mut:#667085; --card:#fff; --bd:#e4e7ec; --ac:#4f46e5; --ac-soft:#eef2ff;
    --mark:#fde68a; --ok:#16a34a; --err:#dc2626; --shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e1013; --fg:#eceef2; --mut:#98a2b3; --card:#171a1f; --bd:#272b33; --ac:#818cf8; --ac-soft:#1e2140;
            --mark:#6b5a12; --shadow:none; }
  }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { margin:0; font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--fg); }
  header { background:var(--card); border-bottom:1px solid var(--bd); }
  .wrap { max-width:820px; margin:0 auto; padding:0 16px; }
  .top { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:18px 0; }
  .brand { flex:1; min-width:180px; }
  h1 { font-size:1.35rem; margin:0; letter-spacing:-.01em; }
  .sub { color:var(--mut); font-size:.88rem; margin:2px 0 0; }
  .actions { display:flex; gap:8px; }
  button { font:inherit; font-weight:600; border-radius:10px; cursor:pointer; padding:9px 16px; border:1px solid var(--ac);
           background:var(--ac); color:#fff; transition:filter .15s, transform .05s; }
  button:hover:not(:disabled) { filter:brightness(1.08); } button:active:not(:disabled) { transform:translateY(1px); }
  button.alt { background:transparent; color:var(--ac); }
  button:disabled { opacity:.45; cursor:not-allowed; }
  main.wrap { padding-top:20px; padding-bottom:48px; }

  #out { display:none; margin-bottom:20px; padding:16px; background:var(--card); border:1px solid var(--bd); border-radius:14px; box-shadow:var(--shadow); }
  #sum { font:.85rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-word; color:var(--mut); }
  #out ul { list-style:none; padding:0; margin:10px 0 0; } #out li { padding:8px 0; border-top:1px solid var(--bd); }
  #out a { color:var(--fg); font-weight:500; text-decoration:none; } #out a:hover { color:var(--ac); }
  .src { color:var(--mut); font-size:.8rem; }
  .err { color:var(--err); margin-top:10px; font-size:.85rem; white-space:pre-wrap; }

  .toolbar { position:sticky; top:0; z-index:5; background:var(--bg); padding:10px 0 12px; display:flex; gap:8px; flex-wrap:wrap; }
  .search { flex:3; min-width:200px; position:relative; }
  .search svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--mut); pointer-events:none; }
  input, select { width:100%; padding:10px 12px; font:inherit; border-radius:10px; border:1px solid var(--bd); background:var(--card); color:var(--fg); }
  input { padding-left:36px; } select { flex:1; min-width:140px; width:auto; }
  input:focus, select:focus { outline:2px solid var(--ac); outline-offset:-1px; border-color:transparent; }
  kbd { position:absolute; right:10px; top:50%; transform:translateY(-50%); font:.7rem ui-monospace,monospace; color:var(--mut);
        border:1px solid var(--bd); border-radius:5px; padding:0 5px; pointer-events:none; }
  #hmsg { color:var(--mut); font-size:.85rem; margin:2px 2px 10px; min-height:1.3em; }

  #hist { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
  .card { display:flex; gap:12px; padding:14px; background:var(--card); border:1px solid var(--bd); border-radius:14px; box-shadow:var(--shadow);
          transition:border-color .15s, transform .15s; }
  .card:hover { border-color:var(--ac); transform:translateY(-1px); }
  .ava { flex:none; width:38px; height:38px; border-radius:10px; display:grid; place-items:center; font-weight:700; font-size:.95rem; color:#fff; }
  .body { min-width:0; flex:1; }
  .card a.t { color:var(--fg); font-weight:600; text-decoration:none; font-size:1rem; line-height:1.35; display:block; overflow-wrap:anywhere; }
  .card a.t:hover { color:var(--ac); }
  .meta { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:3px; font-size:.8rem; color:var(--mut); }
  .chip { padding:1px 8px; border-radius:99px; background:var(--ac-soft); color:var(--ac); font-weight:600; font-size:.72rem; }
  .ex { margin-top:6px; color:var(--mut); font-size:.88rem; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  mark { background:var(--mark); color:inherit; border-radius:3px; padding:0 1px; }
  .empty { text-align:center; color:var(--mut); padding:40px 0; }
  .skel { height:84px; border-radius:14px; background:linear-gradient(90deg,var(--card),var(--bd),var(--card)); background-size:200% 100%; animation:sh 1.2s infinite; border:1px solid var(--bd); }
  @keyframes sh { to { background-position:-200% 0; } }

  .pager { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:16px; color:var(--mut); font-size:.88rem; }
  .pager button { padding:8px 14px; }
  @media (max-width:520px) { .actions { width:100%; } .actions button { flex:1; } .ava { width:32px; height:32px; font-size:.85rem; } }
</style>
</head>
<body>
<header>
  <div class="wrap top">
    <div class="brand">
      <h1>📡 devradar</h1>
      <p class="sub">Tin kỹ thuật từ các engineering blog, gửi về Google Chat mỗi giờ.</p>
    </div>
    <div class="actions">
      <button id="dry" class="alt">👀 Xem trước</button>
      <button id="run">▶️ Chạy ngay</button>
    </div>
  </div>
</header>
<main class="wrap">
  <div id="out"><div id="sum"></div><ul id="list"></ul><div id="errs" class="err"></div></div>

  <div class="toolbar">
    <div class="search">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg>
      <input id="q" type="search" placeholder="Tìm theo tiêu đề, tóm tắt hoặc link…" autocomplete="off">
      <kbd id="kbd">/</kbd>
    </div>
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
  const x = document.createElement('div'); x.className = 'ex';
  const parts = text.split(hl[0]);
  x.append(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i].split(hl[1]);
    const mk = document.createElement('mark'); mk.textContent = seg[0]; x.append(mk, seg.slice(1).join(''));
  }
  return x;
}

function card(r, hl) {
  const li = document.createElement('li'); li.className = 'card';
  const ava = document.createElement('div'); ava.className = 'ava';
  ava.style.background = 'hsl(' + hue(r.source) + ' 55% 45%)';
  ava.textContent = (r.source.trim()[0] || '?').toUpperCase();
  const body = document.createElement('div'); body.className = 'body';
  const a = document.createElement('a'); a.className = 't'; a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.title;
  const m = document.createElement('div'); m.className = 'meta';
  const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = r.source;
  const when = document.createElement('span'); when.textContent = r.publishedAt ? 'đăng ' + ago(r.publishedAt) : 'gửi ' + ago(r.sentAt);
  when.title = 'Gửi lúc ' + new Date(r.sentAt).toLocaleString('vi-VN');
  m.append(chip, when);
  body.append(a, m);
  const text = r.excerpt || (r.summary || '').slice(0, 220);
  if (text) body.append(excerpt(text, hl));
  li.append(ava, body);
  return li;
}

async function loadHist() {
  const my = ++seq;
  $('hmsg').textContent = '';
  $('hist').replaceChildren(...[1, 2, 3].map(() => { const s = document.createElement('li'); s.className = 'skel'; return s; }));
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
      const e = document.createElement('li'); e.className = 'empty';
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
$('q').onfocus = () => ($('kbd').style.display = 'none');
$('q').onblur = () => ($('kbd').style.display = '');
loadHist();
</script>
</body>
</html>`;

// Panel „Dodaj / Edytuj” – działa w całości w przeglądarce

import {
  GRENADES, THROWS, DIFFICULTY, SIDES, IMAGE_ROLES, grenadeOf, throwName, sideOf, icon, esc, h, toast,
  slugify, rand, fmtDate, videoEmbed, openLightbox, roleName,
} from './ui.js';
import {
  store, maps, getMap, getLineup, areasOf, imgUrl, canEdit, commit, loginGroup, loginToken, loginLocal,
  logout, lastNick, exportLocalZip, discardLocalDraft, localChangesCount, sortLineups, repo,
} from './store.js';
import { compressImage, fmtSize, imageFilesFrom, download } from './images.js';
import { encryptToken } from './github.js';
import { crumbs, go, setLeaveGuard, radarMarkup } from './app.js';

const app = document.getElementById('app');
const MAX_IMAGES = 6;
let cleanup = [];
const onCleanup = fn => cleanup.push(fn);

export function render(parts, q) {
  cleanup.forEach(fn => fn()); cleanup = [];
  if (!canEdit()) return viewLogin();
  const [page, arg] = parts;
  if (page === 'nowy') return viewEditor(null, q);
  if (page === 'edytuj') return viewEditor(arg, q);
  if (page === 'mapy') return viewMaps(q);
  if (page === 'ustawienia') return viewSettings();
  return viewDashboard(q);
}
window.addEventListener('hashchange', () => { cleanup.forEach(fn => fn()); cleanup = []; });

function errMsg(e) {
  if (e?.status === 401) return 'Token jest nieprawidłowy lub wygasł.';
  if (e?.status === 403) return e.message || 'Brak uprawnień.';
  if (e?.status === 404) return 'Nie znaleziono repozytorium/gałęzi – sprawdź config.json i uprawnienia tokena.';
  return e?.message || String(e);
}

// ===== Logowanie =====
function viewLogin() {
  crumbs([['Mapy', '#/'], ['Logowanie']]);
  const hasGroup = !!store.config.encryptedToken;
  app.innerHTML = `
    <div style="max-width:560px;margin:0 auto">
      <h1>Panel edycji</h1>
      <p class="muted">Przeglądanie jest publiczne. Żeby dodawać i edytować lineupy, zaloguj się.</p>
      <div class="panel">
        <label class="field"><span>Twój nick (będzie widoczny jako autor)</span>
          <input id="nick" value="${esc(lastNick())}" placeholder="np. Kuba" maxlength="30" autocomplete="nickname"></label>
      </div>
      <form class="panel" id="groupForm">
        <h2>Hasło grupy</h2>
        ${hasGroup ? `
          <label class="field"><span>Wspólne hasło</span><input type="password" id="pass" autocomplete="current-password"></label>
          <div class="btn-row" style="margin-top:.8rem"><button class="btn primary">Zaloguj</button></div>`
        : `<p class="muted small">Hasło grupy nie jest jeszcze ustawione. Osoba, która zakładała repozytorium, loguje się raz własnym tokenem
            i w zakładce <b>Ustawienia</b> tworzy hasło dla wszystkich.</p>`}
      </form>
      <details class="panel" ${hasGroup ? '' : 'open'}>
        <summary style="cursor:pointer;font-weight:700">Zaloguj własnym tokenem GitHub</summary>
        <form id="tokenForm" style="margin-top:.8rem" class="form-grid">
          <label class="field"><span>Fine-grained personal access token</span>
            <input type="password" id="token" placeholder="github_pat_…" autocomplete="off">
            <span class="hint">Repozytorium: <b>${esc(store.config.repo || 'nie wykryto – uzupełnij config.json')}</b>. Token potrzebuje uprawnienia <i>Contents: Read and write</i> tylko do tego repo.</span></label>
          <div class="btn-row"><button class="btn">Zaloguj tokenem</button></div>
        </form>
      </details>
      <details class="panel">
        <summary style="cursor:pointer;font-weight:700">Tryb lokalny (bez GitHuba)</summary>
        <p class="muted small" style="margin-top:.6rem">Zmiany zapisują się tylko w tej przeglądarce. Na koniec pobierasz paczkę ZIP
          (lineups.json + nowe zdjęcia) i ręcznie wrzucasz ją do repozytorium.</p>
        <button class="btn" id="localBtn">Edytuj lokalnie</button>
      </details>
    </div>`;

  const nick = () => {
    const v = app.querySelector('#nick').value.trim();
    if (!v) { toast('Wpisz swój nick', 'err'); app.querySelector('#nick').focus(); }
    return v;
  };
  const busy = async (btn, fn) => {
    btn.disabled = true; const t = btn.textContent; btn.textContent = 'Sprawdzam…';
    try { await fn(); toast('Zalogowano', 'ok'); go('#/admin'); }
    catch (e) { toast(errMsg(e), 'err', 6000); }
    finally { btn.disabled = false; btn.textContent = t; }
  };
  app.querySelector('#groupForm').onsubmit = e => {
    e.preventDefault(); const n = nick(); if (!n || !hasGroup) return;
    busy(e.submitter || e.target.querySelector('button'), () => loginGroup(app.querySelector('#pass').value, n));
  };
  app.querySelector('#tokenForm').onsubmit = e => {
    e.preventDefault(); const n = nick(); if (!n) return;
    busy(e.target.querySelector('button'), () => loginToken(app.querySelector('#token').value.trim(), n));
  };
  app.querySelector('#localBtn').onclick = () => { const n = nick(); if (!n) return; loginLocal(n); go('#/admin'); };
}

// ===== Pasek statusu + zakładki =====
function statusBar(active) {
  const a = store.auth;
  const local = a.mode === 'local';
  const changes = local ? localChangesCount() : 0;
  return `
    <div class="status-bar">
      <div class="who"><span class="dot ${local ? 'warn' : ''}"></span>
        <span><b>${esc(a.nick)}</b> · ${local ? 'tryb lokalny' : `zapis do <b>${esc(store.config.repo)}</b>`}</span></div>
      <div class="btn-row">
        ${local ? `<button class="btn sm primary" id="exportZip" ${changes ? '' : 'disabled'}>⬇ Pobierz paczkę ZIP</button>
                   <button class="btn sm danger" id="discard" ${changes ? '' : 'disabled'}>Odrzuć szkic</button>` : ''}
        <button class="btn sm ghost" id="logout">Wyloguj</button>
      </div>
    </div>
    <div class="tabs">
      <a class="chip ${active === 'l' ? 'on' : ''}" href="#/admin">Lineupy</a>
      <a class="chip ${active === 'm' ? 'on' : ''}" href="#/admin/mapy">Mapy</a>
      <a class="chip ${active === 's' ? 'on' : ''}" href="#/admin/ustawienia">Ustawienia</a>
    </div>`;
}
function bindStatus() {
  app.querySelector('#logout').onclick = () => { logout(); toast('Wylogowano'); go('#/'); };
  const ex = app.querySelector('#exportZip');
  if (ex) ex.onclick = async () => {
    download(await exportLocalZip(), `lineupy-${new Date().toISOString().slice(0, 10)}.zip`);
    toast('Rozpakuj ZIP w katalogu repozytorium i zrób commit (szczegóły w README).', 'ok', 7000);
  };
  const dc = app.querySelector('#discard');
  if (dc) dc.onclick = async () => {
    if (!confirm('Na pewno odrzucić wszystkie lokalne zmiany?')) return;
    await discardLocalDraft(); toast('Szkic odrzucony'); render([], new URLSearchParams());
  };
}

// ===== Lista lineupów =====
function viewDashboard(q) {
  crumbs([['Mapy', '#/'], ['Panel']]);
  const f = { map: q.get('map') || '', g: q.get('g') || '', text: '' };
  app.innerHTML = `
    ${statusBar('l')}
    <div class="page-head"><h1>Lineupy</h1><a class="btn primary" href="#/admin/nowy">+ Nowy lineup</a></div>
    <div class="filters">
      <label class="field" style="min-width:150px"><select id="fMap"><option value="">Wszystkie mapy</option>
        ${maps().map(m => `<option value="${esc(m.id)}" ${m.id === f.map ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field" style="min-width:150px"><select id="fG"><option value="">Wszystkie granaty</option>
        ${GRENADES.map(g => `<option value="${g.id}" ${g.id === f.g ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field" style="flex:1;min-width:160px"><input id="fText" placeholder="Filtruj po nazwie…"></label>
    </div>
    <div class="panel" style="padding:.3rem .6rem;overflow-x:auto"><table class="admin-table"><thead><tr>
      <th>Cel</th><th class="hide-m">Mapa</th><th>Granat</th><th class="hide-m">Strona</th><th class="hide-m">Autor</th><th class="act"></th>
    </tr></thead><tbody id="rows"></tbody></table></div>`;
  bindStatus();
  const rows = app.querySelector('#rows');
  function draw() {
    const t = f.text.toLowerCase();
    const list = sortLineups(store.data.lineups.filter(l =>
      (!f.map || l.map === f.map) && (!f.g || l.grenade === f.g) && (!t || l.title.toLowerCase().includes(t))));
    rows.innerHTML = list.length ? list.map(l => {
      const g = grenadeOf(l.grenade);
      return `<tr>
        <td><a href="#/l/${encodeURIComponent(l.id)}">${esc(l.title)}</a> <span class="muted small">${esc(l.area || '')}</span></td>
        <td class="hide-m">${esc(getMap(l.map)?.name || l.map)}</td>
        <td><span class="badge nade ${g.cls}">${icon(g.id)}${esc(g.name)}</span></td>
        <td class="hide-m">${esc(sideOf(l.side).name)}</td>
        <td class="hide-m muted small">${esc(l.author || '')}<br>${esc(fmtDate(l.updatedAt || l.createdAt))}</td>
        <td class="act"><a class="btn sm" href="#/admin/edytuj/${encodeURIComponent(l.id)}">Edytuj</a>
          <button class="btn sm danger" data-del="${esc(l.id)}" aria-label="Usuń">✕</button></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">Brak lineupów.</td></tr>';
  }
  app.querySelector('#fMap').onchange = e => { f.map = e.target.value; draw(); };
  app.querySelector('#fG').onchange = e => { f.g = e.target.value; draw(); };
  app.querySelector('#fText').oninput = e => { f.text = e.target.value; draw(); };
  rows.addEventListener('click', async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const l = getLineup(b.dataset.del);
    if (await deleteLineup(l)) draw();
  });
  draw();
}

const isRepoImage = src => typeof src === 'string' && src.startsWith('images/');

async function deleteLineup(l) {
  if (!l || !confirm(`Usunąć „${l.title}”? Tej operacji nie da się cofnąć z poziomu strony.`)) return false;
  const t = toast('Usuwanie…', '', 0);
  try {
    await commit({
      mutate: d => { d.lineups = d.lineups.filter(x => x.id !== l.id); return d; },
      deletes: l.images.map(i => i.src).filter(isRepoImage),
      message: `Usuń lineup: ${l.title}`,
    });
    toast('Usunięto', 'ok');
    return true;
  } catch (e) { toast('Błąd: ' + errMsg(e), 'err', 7000); return false; }
  finally { t.remove(); }
}

// ===== Wspólne: obsługa wgrywania zdjęć =====
function bindDropzone(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { onFiles(imageFilesFrom(input.files)); input.value = ''; });
  zone.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); zone.classList.add('over'); } });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => {
    zone.classList.remove('over');
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    onFiles(imageFilesFrom(e.dataTransfer.files));
  });
}
function bindPaste(onFiles) {
  const fn = e => {
    const files = imageFilesFrom(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    onFiles(files);
  };
  document.addEventListener('paste', fn);
  onCleanup(() => document.removeEventListener('paste', fn));
}

// ===== Edytor lineupu =====
function viewEditor(id, q) {
  const orig = id ? getLineup(id) : null;
  if (id && !orig) { app.innerHTML = '<div class="empty">Nie ma takiego lineupu.</div>'; return; }
  const allMaps = maps();
  if (!allMaps.length) {
    crumbs([['Mapy', '#/'], ['Panel', '#/admin'], ['Nowy lineup']]);
    app.innerHTML = '<div class="empty">Najpierw dodaj mapę.<br><a class="btn primary" href="#/admin/mapy">Dodaj mapę</a></div>';
    return;
  }
  const L = orig ? structuredClone(orig) : {
    map: q.get('map') && getMap(q.get('map')) ? q.get('map') : allMaps[0].id,
    grenade: GRENADES.some(g => g.id === q.get('g')) ? q.get('g') : 'smoke',
    side: 'T', area: '', title: '', throw: 'lmb', difficulty: 'easy', description: '', video: '', tags: [], images: [], radar: null,
  };
  // obrazy w edytorze
  let imgs = L.images.map(i => ({ kind: 'old', src: i.src, caption: i.caption || '', url: imgUrl(i.src) }));
  let radar = L.radar ? structuredClone(L.radar) : {};
  let radarMode = 'target';
  let dirty = false;
  const markDirty = () => { dirty = true; };
  setLeaveGuard(silent => !dirty || (!silent && confirm('Masz niezapisane zmiany. Wyjść bez zapisywania?')));

  crumbs([['Mapy', '#/'], ['Panel', '#/admin'], [orig ? `Edycja: ${orig.title}` : 'Nowy lineup']]);
  const seg = (name, list, cur, withIcon) => `<div class="seg" role="radiogroup">${list.map(o => `
      <label><input type="radio" name="${name}" value="${o.id}" ${o.id === cur ? 'checked' : ''}>
      <span class="${o.cls || ''}" ${withIcon ? 'style="color:var(--c)"' : ''}>${withIcon ? icon(o.id) : ''}<b style="color:var(--text)">${esc(o.name)}</b></span></label>`).join('')}</div>`;

  app.innerHTML = `
    <form id="ed" autocomplete="off">
      <div class="page-head"><h1>${orig ? 'Edytuj lineup' : 'Nowy lineup'}</h1>
        <div class="btn-row">
          ${orig ? '<button type="button" class="btn danger" id="delBtn">Usuń</button>' : ''}
          <button class="btn primary" id="saveTop">💾 Zapisz</button></div></div>

      <div class="panel"><div class="form-grid cols-2">
        <label class="field"><span>Mapa</span><select name="map">
          ${allMaps.map(m => `<option value="${esc(m.id)}" ${m.id === L.map ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Nazwa celu *</span><input name="title" required maxlength="80" value="${esc(L.title)}" placeholder="np. Smoke na Window" list="titleList"><datalist id="titleList"></datalist></label>
        <div class="field span-all"><span>Granat</span>${seg('grenade', GRENADES, L.grenade, true)}</div>
        <div class="field"><span>Strona</span>${seg('side', SIDES, L.side)}</div>
        <label class="field"><span>Miejsce</span><input name="area" list="areaList" value="${esc(L.area)}" placeholder="A / Mid / B">
          <datalist id="areaList"></datalist></label>
        <div class="field span-all"><span>Typ rzutu</span>${seg('throw', THROWS, L.throw)}</div>
        <div class="field"><span>Trudność</span>${seg('difficulty', DIFFICULTY, L.difficulty)}</div>
        <label class="field"><span>Tagi (po przecinku)</span><input name="tags" value="${esc(L.tags.join(', '))}" placeholder="np. window, top mid, wejście"></label>
        <label class="field span-all"><span>Opis</span><textarea name="description" placeholder="np. Stań w rogu przy skrzynce, wyceluj w czubek anteny, jump throw.">${esc(L.description)}</textarea></label>
        <label class="field span-all"><span>Link do klipu (YouTube / Medal / Streamable) – opcjonalnie</span>
          <input name="video" type="url" value="${esc(L.video)}" placeholder="https://youtu.be/…"><span class="hint" id="vidHint"></span></label>
      </div></div>

      <div class="panel">
        <h2>Zdjęcia</h2>
        <p class="muted small" style="margin-top:-.4rem">Kolejność: <b>1. gdzie stanąć</b>, <b>2. gdzie celować</b>, 3. efekt (opcjonalnie).
          Przeciągaj miniatury, żeby zmienić kolejność. Zdjęcia są automatycznie zmniejszane i zapisywane jako WebP.</p>
        <div class="dropzone" id="drop" tabindex="0" role="button">
          <strong>Przeciągnij zdjęcia tutaj</strong>, kliknij, aby wybrać,<br>albo wklej screenshot <kbd>Ctrl</kbd>+<kbd>V</kbd>
        </div>
        <input type="file" id="file" accept="image/*" multiple hidden>
        <div class="thumbs" id="thumbs"></div>
      </div>

      <div class="panel" id="radarPanel"></div>

      <div class="btn-row" style="justify-content:flex-end">
        <a class="btn ghost" href="${orig ? `#/l/${encodeURIComponent(orig.id)}` : '#/admin'}">Anuluj</a>
        <button class="btn primary">💾 Zapisz lineup</button>
      </div>
    </form>`;

  const form = app.querySelector('#ed');
  const thumbsEl = app.querySelector('#thumbs');
  const val = n => form.elements[n].value;

  function refreshAreas() {
    const m = getMap(val('map'));
    const known = new Set([...areasOf(m), ...store.data.lineups.filter(l => l.map === m?.id).map(l => l.area).filter(Boolean)]);
    app.querySelector('#areaList').innerHTML = [...known].map(a => `<option value="${esc(a)}">`).join('');
    const gName = grenadeOf(form.elements.grenade.value).name;
    app.querySelector('#titleList').innerHTML = [...known].map(a => `<option value="${esc(`${gName} na ${a}`)}">`).join('');
  }
  function refreshVideoHint() {
    const v = val('video').trim();
    const e = videoEmbed(v);
    app.querySelector('#vidHint').textContent = !v ? '' : e ? `✓ Rozpoznano ${e.name} – klip będzie osadzony w karcie` : 'Nie rozpoznano serwisu – będzie zwykły link';
  }

  // --- zdjęcia ---
  function drawThumbs() {
    thumbsEl.innerHTML = imgs.map((im, i) => `
      <div class="thumb" draggable="true" data-i="${i}">
        <div class="img"><img src="${esc(im.url)}" alt=""><span class="role">${i + 1}. ${esc(IMAGE_ROLES[i] || 'Dodatkowe')}</span>
          ${im.size ? `<span class="size">${fmtSize(im.size)}</span>` : ''}</div>
        <input placeholder="Podpis (domyślnie: ${esc(roleName(i))})" value="${esc(im.caption)}" data-cap="${i}" maxlength="60">
        <div class="tools">
          <button type="button" data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="W lewo">◀</button>
          <button type="button" data-zoom="${i}" aria-label="Powiększ">⤢</button>
          <button type="button" data-mv="1" data-i="${i}" ${i === imgs.length - 1 ? 'disabled' : ''} aria-label="W prawo">▶</button>
          <button type="button" class="del" data-rm="${i}" aria-label="Usuń zdjęcie">✕</button>
        </div>
      </div>`).join('');
  }
  async function addFiles(files) {
    const room = MAX_IMAGES - imgs.length;
    if (room <= 0) return toast(`Maksymalnie ${MAX_IMAGES} zdjęć`, 'err');
    const t = toast('Kompresja zdjęć…', '', 0);
    try {
      for (const f of files.slice(0, room)) {
        const c = await compressImage(f, { maxW: 1600, maxH: 1600 });
        imgs.push({ kind: 'new', blob: c.blob, ext: c.ext, caption: '', url: URL.createObjectURL(c.blob), size: c.blob.size, orig: f.size });
      }
      markDirty(); drawThumbs();
    } catch (e) { toast(e.message, 'err'); }
    finally { t.remove(); }
  }
  bindDropzone(app.querySelector('#drop'), app.querySelector('#file'), addFiles);
  bindPaste(addFiles);

  thumbsEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm != null) { imgs.splice(+b.dataset.rm, 1); markDirty(); drawThumbs(); }
    else if (b.dataset.mv != null) {
      const i = +b.dataset.i, j = i + +b.dataset.mv;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; markDirty(); drawThumbs();
    } else if (b.dataset.zoom != null) openLightbox(imgs.map((im, k) => ({ src: im.url, caption: roleName(k, im.caption) })), +b.dataset.zoom);
  });
  thumbsEl.addEventListener('input', e => { if (e.target.dataset.cap != null) { imgs[+e.target.dataset.cap].caption = e.target.value; markDirty(); } });
  // przeciąganie miniatur
  let dragFrom = null;
  thumbsEl.addEventListener('dragstart', e => {
    const t = e.target.closest('.thumb'); if (!t) return;
    dragFrom = +t.dataset.i; t.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-thumb', String(dragFrom));
  });
  thumbsEl.addEventListener('dragover', e => {
    if (dragFrom == null) return; e.preventDefault();
    thumbsEl.querySelectorAll('.thumb').forEach(t => t.classList.toggle('drop-target', t === e.target.closest('.thumb')));
  });
  thumbsEl.addEventListener('drop', e => {
    if (dragFrom == null) return; e.preventDefault();
    const t = e.target.closest('.thumb');
    if (t) { const to = +t.dataset.i; const [it] = imgs.splice(dragFrom, 1); imgs.splice(to, 0, it); markDirty(); }
    dragFrom = null; drawThumbs();
  });
  thumbsEl.addEventListener('dragend', () => { dragFrom = null; drawThumbs(); });

  // --- radar ---
  function drawRadar() {
    const panel = app.querySelector('#radarPanel');
    const m = getMap(val('map'));
    if (!m?.radar) {
      panel.innerHTML = `<h2>Punkt na radarze</h2><p class="muted small">Ta mapa nie ma obrazu radaru. Możesz go dodać w zakładce
        <a href="#/admin/mapy?edit=${encodeURIComponent(m?.id || '')}">Mapy</a> (opcjonalne).</p>`;
      return;
    }
    const preview = { id: '_preview', title: val('title') || 'Ten lineup', grenade: form.elements.grenade.value, radar };
    panel.innerHTML = `
      <h2>Punkt na radarze (opcjonalnie)</h2>
      <div class="radar-picker">
        <div class="btn-row">
          <div class="chip-group">
            <button type="button" class="chip ${radarMode === 'target' ? 'on' : ''}" data-mode="target">● Ustaw cel</button>
            <button type="button" class="chip ${radarMode === 'from' ? 'on' : ''}" data-mode="from">○ Ustaw miejsce rzutu</button>
          </div>
          <button type="button" class="btn sm ghost" id="radarClear">Wyczyść</button>
        </div>
        <span class="muted small">Kliknij na radarze. Punkt celu otwiera ten lineup w widoku radaru.</span>
        <div id="radarBox" style="max-width:520px">${radarMarkup(m, [preview], { editable: true })}</div>
      </div>`;
    const wrap = panel.querySelector('.radar-wrap');
    wrap.addEventListener('click', e => {
      const r = wrap.getBoundingClientRect();
      const pt = { x: +((e.clientX - r.left) / r.width).toFixed(4), y: +((e.clientY - r.top) / r.height).toFixed(4) };
      radar[radarMode] = pt;
      if (radarMode === 'from' && !radar.target) radarMode = 'target';
      else if (radarMode === 'target' && !radar.from) radarMode = 'from';
      markDirty(); drawRadar();
    });
    panel.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { radarMode = b.dataset.mode; drawRadar(); });
    panel.querySelector('#radarClear').onclick = () => { radar = {}; radarMode = 'target'; markDirty(); drawRadar(); };
  }

  form.addEventListener('input', e => { markDirty(); if (e.target.name === 'video') refreshVideoHint(); });
  form.addEventListener('change', e => {
    if (e.target.name === 'map') { refreshAreas(); radar = {}; drawRadar(); }
    if (e.target.name === 'grenade') { drawRadar(); refreshAreas(); }
    // podpowiedź nazwy: „Smoke na …”
    if (e.target.name === 'grenade' && !orig) {
      const t = form.elements.title;
      const names = GRENADES.map(g => g.name);
      const m = t.value.match(new RegExp(`^(${names.join('|')}) na (.*)$`));
      if (m) t.value = `${grenadeOf(e.target.value).name} na ${m[2]}`;
    }
  });

  const delBtn = app.querySelector('#delBtn');
  if (delBtn) delBtn.onclick = async () => { if (await deleteLineup(orig)) { dirty = false; go('#/admin'); } };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const title = val('title').trim();
    if (!title || /\sna\s*$/.test(title)) { toast('Uzupełnij nazwę celu', 'err'); form.elements.title.focus(); return; }
    if (!imgs.length) { toast('Dodaj przynajmniej jedno zdjęcie (gdzie stanąć / gdzie celować)', 'err'); return; }
    const map = val('map'), grenade = form.elements.grenade.value;
    const lid = orig?.id || `${map}-${grenade}-${slugify(title.replace(/^\S+\s+na\s+/i, ''))}-${rand(4)}`;
    const files = [];
    const images = imgs.map(im => {
      if (im.kind === 'old') return { src: im.src, caption: im.caption.trim() };
      const path = `images/${map}/${lid}-${rand(5)}.${im.ext}`;
      files.push({ path, blob: im.blob });
      return { src: path, caption: im.caption.trim() };
    }).map(i => (i.caption ? i : { src: i.src }));
    const kept = new Set(images.map(i => i.src));
    const deletes = (orig?.images || []).map(i => i.src).filter(s => isRepoImage(s) && !kept.has(s));
    const now = new Date().toISOString();
    const lineup = {
      id: lid, map, grenade,
      side: form.elements.side.value, area: val('area').trim(), title,
      throw: form.elements.throw.value, difficulty: form.elements.difficulty.value,
      description: val('description').trim(), video: val('video').trim(),
      tags: val('tags').split(',').map(s => s.trim()).filter(Boolean),
      images,
      ...(radar.target || radar.from ? { radar } : {}),
      author: orig?.author || store.auth.nick,
      createdAt: orig?.createdAt || now,
      updatedAt: now,
      ...(orig && orig.author !== store.auth.nick ? { editedBy: store.auth.nick } : {}),
    };
    const btns = form.querySelectorAll('button');
    btns.forEach(b => b.disabled = true);
    const t = toast('Zapisywanie…', '', 0);
    try {
      const res = await commit({
        mutate: d => {
          const i = d.lineups.findIndex(x => x.id === lid);
          if (i >= 0) d.lineups[i] = lineup; else d.lineups.push(lineup);
          return d;
        },
        files, deletes,
        message: `${orig ? 'Edytuj' : 'Dodaj'} lineup: ${getMap(map)?.name || map} – ${title}`,
        onProgress: msg => { t.textContent = msg; },
      });
      dirty = false;
      toast(res.mode === 'github' ? 'Zapisano ✓ Strona publiczna odświeży się za ok. 1 min.' : 'Zapisano lokalnie ✓ Pamiętaj o pobraniu paczki ZIP.', 'ok', 6000);
      go(`#/l/${encodeURIComponent(lid)}`);
    } catch (err) {
      toast('Nie udało się zapisać: ' + errMsg(err), 'err', 8000);
    } finally { t.remove(); btns.forEach(b => b.disabled = false); }
  });

  refreshAreas(); refreshVideoHint(); drawThumbs(); drawRadar();
}

// ===== Mapy =====
function viewMaps(q) {
  cleanup.forEach(fn => fn()); cleanup = [];
  crumbs([['Mapy', '#/'], ['Panel', '#/admin'], ['Mapy']]);
  const editId = q.get('edit');
  const list = maps();
  app.innerHTML = `
    ${statusBar('m')}
    <div class="page-head"><h1>Mapy</h1><button class="btn primary" id="newMap">+ Nowa mapa</button></div>
    <div id="mapForm"></div>
    <div class="panel" style="padding:.3rem .6rem;overflow-x:auto"><table class="admin-table"><thead><tr>
      <th></th><th>Nazwa</th><th class="hide-m">ID (folder)</th><th>Lineupy</th><th class="hide-m">Radar</th><th class="act"></th></tr></thead>
      <tbody>${list.map(m => `<tr>
        <td style="width:80px"><div class="thumb-preview" style="width:72px">${m.thumb ? `<img src="${esc(imgUrl(m.thumb))}" alt="">` : '—'}</div></td>
        <td><b>${esc(m.name)}</b><div class="muted small">${esc(areasOf(m).join(' · '))}</div></td>
        <td class="hide-m muted">${esc(m.id)}</td>
        <td>${store.data.lineups.filter(l => l.map === m.id).length}</td>
        <td class="hide-m">${m.radar ? '✓' : '—'}</td>
        <td class="act"><button class="btn sm" data-edit="${esc(m.id)}">Edytuj</button>
          <button class="btn sm danger" data-del="${esc(m.id)}" aria-label="Usuń mapę">✕</button></td></tr>`).join('')
        || '<tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">Brak map – dodaj pierwszą.</td></tr>'}
      </tbody></table></div>`;
  bindStatus();
  app.querySelector('#newMap').onclick = () => mapForm(null);
  app.querySelector('tbody').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return mapForm(getMap(ed.dataset.edit));
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const m = getMap(del.dataset.del);
    const n = store.data.lineups.filter(l => l.map === m.id).length;
    if (n) return toast(`Na tej mapie jest ${n} lineupów – najpierw je usuń lub przenieś.`, 'err', 6000);
    if (!confirm(`Usunąć mapę „${m.name}”?`)) return;
    const t = toast('Usuwanie…', '', 0);
    try {
      await commit({
        mutate: d => { d.maps = d.maps.filter(x => x.id !== m.id); return d; },
        deletes: [m.thumb, m.radar].filter(isRepoImage),
        message: `Usuń mapę: ${m.name}`,
      });
      toast('Usunięto mapę', 'ok'); viewMaps(new URLSearchParams());
    } catch (err) { toast('Błąd: ' + errMsg(err), 'err', 7000); }
    finally { t.remove(); }
  });
  if (editId && getMap(editId)) mapForm(getMap(editId));
  else if (!list.length) mapForm(null);
}

function mapForm(m) {
  cleanup.forEach(fn => fn()); cleanup = [];
  const box = app.querySelector('#mapForm');
  const pics = { thumb: { url: m?.thumb ? imgUrl(m.thumb) : '', blob: null, ext: '', removed: false },
                 radar: { url: m?.radar ? imgUrl(m.radar) : '', blob: null, ext: '', removed: false } };
  let dirty = false;
  setLeaveGuard(silent => !dirty || (!silent && confirm('Masz niezapisane zmiany mapy. Wyjść?')));
  box.innerHTML = `
    <form class="panel" id="mf">
      <h2>${m ? `Edytuj mapę: ${esc(m.name)}` : 'Nowa mapa'}</h2>
      <div class="form-grid cols-3">
        <label class="field"><span>Nazwa *</span><input name="name" required maxlength="30" value="${esc(m?.name || '')}" placeholder="np. Mirage"></label>
        <label class="field"><span>ID / nazwa folderu</span><input name="id" value="${esc(m?.id || '')}" ${m ? 'readonly' : ''} placeholder="np. mirage" pattern="[a-z0-9-]+">
          <span class="hint">${m ? 'Nie można zmienić po utworzeniu.' : 'Tworzy się automatycznie z nazwy.'}</span></label>
        <label class="field"><span>Kolejność</span><input name="order" type="number" value="${esc(m?.order ?? store.data.maps.length + 1)}"></label>
        <label class="field span-all"><span>Miejsca (do filtrowania, po przecinku)</span><input name="areas" value="${esc(areasOf(m).join(', '))}"></label>
        <div class="field"><span>Miniatura (kafelek)</span>
          <div class="thumb-preview" id="pv-thumb"></div>
          <div class="btn-row"><button type="button" class="btn sm" data-pick="thumb">Wybierz / upuść</button>
            <button type="button" class="btn sm ghost" data-clear="thumb">Usuń</button></div></div>
        <div class="field"><span>Radar (overview) – opcjonalnie</span>
          <div class="thumb-preview radar" id="pv-radar"></div>
          <div class="btn-row"><button type="button" class="btn sm" data-pick="radar">Wybierz / upuść</button>
            <button type="button" class="btn sm ghost" data-clear="radar">Usuń</button></div></div>
        <p class="muted small span-all">Możesz też wkleić obrazek <kbd>Ctrl</kbd>+<kbd>V</kbd> – trafi do miniatury (albo do radaru, jeśli miniatura już jest).</p>
      </div>
      <input type="file" accept="image/*" hidden id="mfile">
      <div class="btn-row" style="justify-content:flex-end;margin-top:1rem">
        <button type="button" class="btn ghost" id="mCancel">Anuluj</button>
        <button class="btn primary">💾 Zapisz mapę</button></div>
    </form>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const form = box.querySelector('#mf');
  const fileIn = box.querySelector('#mfile');
  let target = 'thumb';
  const draw = () => ['thumb', 'radar'].forEach(k => {
    box.querySelector(`#pv-${k}`).innerHTML = pics[k].url ? `<img src="${esc(pics[k].url)}" alt="">` : 'brak';
  });
  async function setPic(k, file) {
    const c = await compressImage(file, k === 'thumb' ? { maxW: 800, maxH: 800 } : { maxW: 1600, maxH: 1600, quality: 0.9 });
    Object.assign(pics[k], { blob: c.blob, ext: c.ext, url: URL.createObjectURL(c.blob), removed: false });
    dirty = true; draw();
  }
  box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { target = b.dataset.pick; fileIn.click(); });
  box.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { Object.assign(pics[b.dataset.clear], { url: '', blob: null, removed: true }); dirty = true; draw(); });
  fileIn.onchange = () => { if (fileIn.files[0]) setPic(target, fileIn.files[0]); fileIn.value = ''; };
  ['thumb', 'radar'].forEach(k => {
    const pv = box.querySelector(`#pv-${k}`);
    pv.addEventListener('dragover', e => { e.preventDefault(); pv.style.borderColor = 'var(--accent)'; });
    pv.addEventListener('dragleave', () => { pv.style.borderColor = ''; });
    pv.addEventListener('drop', e => { e.preventDefault(); pv.style.borderColor = ''; const f = imageFilesFrom(e.dataTransfer.files)[0]; if (f) setPic(k, f); });
    pv.style.cursor = 'pointer';
    pv.onclick = () => { target = k; fileIn.click(); };
  });
  bindPaste(files => setPic(pics.thumb.url ? 'radar' : 'thumb', files[0]));
  form.elements.name.addEventListener('input', e => { dirty = true; if (!m) form.elements.id.value = slugify(e.target.value); });
  form.addEventListener('input', () => { dirty = true; });
  box.querySelector('#mCancel').onclick = () => { dirty = false; setLeaveGuard(null); box.innerHTML = ''; };

  form.onsubmit = async e => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const id = m?.id || slugify(form.elements.id.value || name);
    if (!name) return;
    if (!m && getMap(id)) return toast('Mapa o takim ID już istnieje', 'err');
    const files = [], deletes = [];
    const next = {
      id, name,
      order: Number(form.elements.order.value) || 0,
      areas: form.elements.areas.value.split(',').map(s => s.trim()).filter(Boolean),
      thumb: m?.thumb || '', radar: m?.radar || '',
    };
    for (const k of ['thumb', 'radar']) {
      const p = pics[k];
      if (p.blob) {
        const path = `images/${id}/_${k}-${rand(5)}.${p.ext}`;
        files.push({ path, blob: p.blob });
        if (isRepoImage(next[k])) deletes.push(next[k]);
        next[k] = path;
      } else if (p.removed) {
        if (isRepoImage(next[k])) deletes.push(next[k]);
        next[k] = '';
      }
    }
    if (!next.thumb) delete next.thumb;
    if (!next.radar) delete next.radar;
    const t = toast('Zapisywanie…', '', 0);
    form.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
      await commit({
        mutate: d => {
          const i = d.maps.findIndex(x => x.id === id);
          if (i >= 0) d.maps[i] = { ...d.maps[i], ...next, ...(next.thumb ? {} : { thumb: undefined }), ...(next.radar ? {} : { radar: undefined }) };
          else d.maps.push(next);
          d.maps = JSON.parse(JSON.stringify(d.maps)); // usuwa pola undefined
          return d;
        },
        files, deletes,
        message: `${m ? 'Edytuj' : 'Dodaj'} mapę: ${name}`,
        onProgress: msg => { t.textContent = msg; },
      });
      dirty = false; setLeaveGuard(null);
      toast('Zapisano mapę ✓', 'ok');
      history.replaceState(null, '', '#/admin/mapy');
      viewMaps(new URLSearchParams());
    } catch (err) {
      toast('Nie udało się zapisać: ' + errMsg(err), 'err', 8000);
      form.querySelectorAll('button').forEach(b => b.disabled = false);
    } finally { t.remove(); }
  };
  draw();
}

// ===== Ustawienia =====
function viewSettings() {
  crumbs([['Mapy', '#/'], ['Panel', '#/admin'], ['Ustawienia']]);
  const gh = store.auth.mode === 'github';
  app.innerHTML = `
    ${statusBar('s')}
    <div class="panel">
      <h2>Repozytorium</h2>
      <p>Repo: <b>${esc(store.config.repo || '—')}</b> · gałąź: <b>${esc(store.config.branch)}</b> · dane: <b>${esc(store.config.dataPath)}</b></p>
      <p class="muted small">Zmienisz to w pliku <code>config.json</code>. Lineupów: ${store.data.lineups.length}, map: ${store.data.maps.length}.</p>
      <button class="btn" id="dlJson">⬇ Pobierz kopię lineups.json</button>
    </div>
    <form class="panel" id="encForm">
      <h2>Hasło grupy</h2>
      <p class="muted small">Szyfruje token GitHuba wspólnym hasłem (AES-256, PBKDF2). Zaszyfrowany token trafia do publicznego
        <code>config.json</code>, a znajomi logują się samym hasłem. <b>Użyj długiego hasła</b> (np. 4–5 losowych słów),
        bo zaszyfrowany token jest publiczny. Tokenowi daj dostęp tylko do tego repozytorium.</p>
      <div class="form-grid cols-2">
        <label class="field span-all"><span>Token GitHub (fine-grained, Contents: Read and write)</span>
          <input type="password" id="encTok" ${gh ? 'placeholder="puste = użyj tokena, którym jesteś zalogowany"' : 'required placeholder="github_pat_…"'} autocomplete="off"></label>
        <label class="field"><span>Nowe hasło grupy</span><input type="password" id="encP1" required minlength="10" autocomplete="new-password"></label>
        <label class="field"><span>Powtórz hasło</span><input type="password" id="encP2" required minlength="10" autocomplete="new-password"></label>
      </div>
      <div class="btn-row" style="margin-top:.9rem">
        ${gh ? '<button class="btn primary" data-act="save">Zaszyfruj i zapisz w repo</button>' : ''}
        <button class="btn" data-act="show">Tylko pokaż JSON</button></div>
      <div id="encOut"></div>
    </form>`;
  bindStatus();
  app.querySelector('#dlJson').onclick = () =>
    download(new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' }), 'lineups.json');
  app.querySelector('#encForm').onsubmit = async e => {
    e.preventDefault();
    const act = e.submitter?.dataset.act || 'show';
    const p1 = app.querySelector('#encP1').value, p2 = app.querySelector('#encP2').value;
    if (p1 !== p2) return toast('Hasła się różnią', 'err');
    const token = app.querySelector('#encTok').value.trim() || (gh ? store.auth.token : '');
    if (!token) return toast('Podaj token', 'err');
    const enc = await encryptToken(token, p1);
    const out = app.querySelector('#encOut');
    if (act === 'save') {
      const t = toast('Zapisywanie config.json…', '', 0);
      try {
        await repo().commitChange({
          dataPath: 'config.json',
          mutate: c => { const n = { ...c, encryptedToken: enc }; return n; },
          message: `Ustaw hasło grupy (${store.auth.nick})`,
        });
        store.config.encryptedToken = enc;
        toast('Hasło grupy zapisane ✓ Po ok. minucie znajomi mogą się nim logować.', 'ok', 7000);
        e.target.reset();
      } catch (err) { toast('Błąd: ' + errMsg(err), 'err', 8000); }
      finally { t.remove(); }
    } else {
      out.innerHTML = `<p class="small muted" style="margin-top:1rem">Wklej to jako wartość <code>"encryptedToken"</code> w config.json:</p>
        <div class="code">${esc(JSON.stringify(enc, null, 2))}</div>`;
    }
  };
}

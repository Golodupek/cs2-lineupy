// Główna aplikacja: routing i widoki przeglądania

import {
  GRENADES, SIDES, grenadeOf, throwName, diffName, sideOf, roleName, icon, esc, h, toast,
  copyText, fmtDate, videoEmbed, openLightbox,
} from './ui.js';
import {
  store, init, maps, getMap, getLineup, lineupsFor, areasOf, imgUrl, rawUrl, search,
  isFav, toggleFav, favLineups, canEdit,
} from './store.js';

const app = document.getElementById('app');
const crumbsEl = document.getElementById('crumbs');
let leaveGuard = null;          // funkcja zwracająca false, gdy są niezapisane zmiany
let currentHash = location.hash;
let wakeLock = null;

export function setLeaveGuard(fn) { leaveGuard = fn; }
export const go = hash => {
  if (location.hash === hash || (hash === '#/' && !location.hash)) { leaveGuard = null; route(); }
  else location.hash = hash;
};
export function lineupLink(id) { return `${location.origin}${location.pathname}#/l/${encodeURIComponent(id)}`; }

// ===== Routing =====
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
}
function setQuery(q) {
  const { parts } = parseHash();
  const s = q.toString();
  const hash = '#/' + parts.map(encodeURIComponent).join('/') + (s ? '?' + s : '');
  history.replaceState(null, '', hash);
  currentHash = hash;
}

export function crumbs(list) {
  // list: [[label, href?], ...]
  crumbsEl.innerHTML = list.map(([label, href], i) => {
    const last = i === list.length - 1;
    const part = last || !href ? `<span class="${last ? 'cur' : ''}">${esc(label)}</span>` : `<a href="${href}">${esc(label)}</a>`;
    return (i ? '<span class="sep">›</span>' : '') + part;
  }).join('');
}

async function route() {
  if (leaveGuard && location.hash !== currentHash && !leaveGuard()) {
    history.replaceState(null, '', currentHash);
    return;
  }
  leaveGuard = null;
  currentHash = location.hash;
  releaseWake();
  const { parts, q } = parseHash();
  document.getElementById('adminLink').classList.toggle('logged', canEdit());
  const searchInput = document.getElementById('searchInput');
  if (parts[0] !== 'szukaj' && document.activeElement !== searchInput) searchInput.value = '';
  window.scrollTo(0, 0);
  try {
    if (!parts.length) return viewHome();
    switch (parts[0]) {
      case 'm':
        if (parts[2] === 'radar') return viewRadar(parts[1], q);
        if (parts[2]) return viewList(parts[1], parts[2], q);
        return viewMap(parts[1]);
      case 'l': return viewLineup(parts[1]);
      case 'szukaj': return viewSearch(q.get('q') || '');
      case 'ulubione': return viewFavs();
      case 'admin': {
        const admin = await import('./admin.js');
        return admin.render(parts.slice(1), q);
      }
      default: return notFound();
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="empty">Coś poszło nie tak: ${esc(e.message)}</div>`;
  }
}

function notFound(msg = 'Nie znaleziono tej strony.') {
  crumbs([['Mapy', '#/'], ['Brak']]);
  app.innerHTML = `<div class="empty">${esc(msg)}<br><a class="btn" href="#/">← Wróć do map</a></div>`;
}

// ===== Widoki =====
function mapTile(m) {
  const n = store.data.lineups.filter(l => l.map === m.id).length;
  const img = m.thumb
    ? `<img src="${esc(imgUrl(m.thumb))}" alt="" loading="lazy">`
    : `<div class="ph" style="background:${mapColor(m.id)}">${esc(m.name.slice(0, 2))}</div>`;
  return `<a class="map-tile" href="#/m/${encodeURIComponent(m.id)}">${img}
    <div class="name"><span>${esc(m.name)}</span><span class="count">${n}</span></div></a>`;
}
function mapColor(id) {
  let x = 0; for (const c of id) x = (x * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${x} 25% 22%), hsl(${(x + 40) % 360} 20% 12%))`;
}

function viewHome() {
  crumbs([]);
  const list = maps();
  const err = store.loadError ? `<div class="panel" style="border-color:var(--danger)">${esc(store.loadError)}</div>` : '';
  app.innerHTML = `${err}
    <div class="page-head"><h1>Wybierz mapę</h1>
      ${canEdit() ? '<a class="btn" href="#/admin/mapy">+ Mapa</a>' : ''}</div>
    ${list.length ? `<div class="map-grid">${list.map(mapTile).join('')}</div>`
      : `<div class="empty">Nie ma jeszcze żadnych map.<br><a class="btn primary" href="#/admin/mapy">Dodaj pierwszą mapę</a></div>`}`;
}

function viewMap(mapId) {
  const m = getMap(mapId);
  if (!m) return notFound('Nie ma takiej mapy.');
  crumbs([['Mapy', '#/'], [m.name]]);
  const all = lineupsFor(m.id);
  app.innerHTML = `
    <div class="page-head"><h1>${esc(m.name)}</h1><span class="muted">Wybierz granat</span></div>
    <div class="nade-grid">
      ${GRENADES.map(g => {
        const n = all.filter(l => l.grenade === g.id).length;
        return `<a class="nade-btn ${g.cls} ${n ? '' : 'empty-n'}" href="#/m/${encodeURIComponent(m.id)}/${g.id}">
          ${icon(g.id)}<span class="label">${esc(g.long || g.name)}</span>
          <span class="count">${n} ${plural(n, 'lineup', 'lineupy', 'lineupów')}</span></a>`;
      }).join('')}
    </div>
    <div class="map-actions">
      ${m.radar ? `<a class="btn" href="#/m/${encodeURIComponent(m.id)}/radar">◎ Widok radaru</a>` : ''}
      ${canEdit() ? `<a class="btn" href="#/admin/nowy?map=${encodeURIComponent(m.id)}">+ Dodaj lineup</a>` : ''}
    </div>`;
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

function sideMatch(l, side) { return !side || l.side === side || l.side === 'both'; }

function lineupItem(l, { showMap = false } = {}) {
  const g = grenadeOf(l.grenade);
  const s = sideOf(l.side);
  const m = getMap(l.map);
  const first = l.images[1] || l.images[0];
  return `<a class="li-item ${g.cls}" href="#/l/${encodeURIComponent(l.id)}">
    <div class="li-thumb">${first ? `<img src="${esc(imgUrl(first.src))}" alt="" loading="lazy">` : icon(g.id)}</div>
    <div class="li-body">
      <div class="li-title">${isFav(l.id) ? '<span class="star">★</span>' : ''}${esc(l.title)}</div>
      <div class="li-meta">
        ${showMap ? `<span class="badge">${esc(m?.name || l.map)}</span><span class="badge nade">${icon(g.id)}${esc(g.name)}</span>` : ''}
        <span class="badge ${s.cls}">${esc(s.name)}</span>
        ${l.area ? `<span class="badge">${esc(l.area)}</span>` : ''}
        <span class="badge">${esc(throwName(l.throw))}</span>
        <span class="badge ${esc(l.difficulty)}">${esc(diffName(l.difficulty))}</span>
      </div>
    </div></a>`;
}

function chips(name, options, current) {
  return `<div class="chip-group" data-filter="${name}">
    ${options.map(([v, label, cls = '']) => `<button class="chip ${cls} ${v === current ? 'on' : ''}" data-v="${esc(v)}">${esc(label)}</button>`).join('')}
  </div>`;
}

function viewList(mapId, grenadeId, q) {
  const m = getMap(mapId);
  const g = GRENADES.find(x => x.id === grenadeId);
  if (!m || !g) return notFound();
  crumbs([['Mapy', '#/'], [m.name, `#/m/${encodeURIComponent(m.id)}`], [g.name]]);
  const all = lineupsFor(m.id, g.id);
  const state = { side: q.get('side') || '', area: q.get('area') || '' };
  const areas = [...new Set([...areasOf(m), ...all.map(l => l.area).filter(Boolean)])];

  app.innerHTML = `
    <div class="page-head"><h1 style="display:flex;gap:.5rem;align-items:center"><span class="${g.cls}" style="color:var(--c);display:inline-flex;width:34px">${icon(g.id)}</span>${esc(g.long || g.name)} · ${esc(m.name)}</h1>
      ${canEdit() ? `<a class="btn" href="#/admin/nowy?map=${encodeURIComponent(m.id)}&g=${g.id}">+ Dodaj</a>` : ''}</div>
    <div class="filters">
      ${chips('side', [['', 'Wszystkie'], ['T', 'T', 't'], ['CT', 'CT', 'ct']], state.side)}
      ${chips('area', [['', 'Wszędzie'], ...areas.map(a => [a, a])], state.area)}
    </div>
    <div class="lineup-list" id="list"></div>`;

  const listEl = app.querySelector('#list');
  function draw() {
    const items = all.filter(l => sideMatch(l, state.side) && (!state.area || l.area === state.area));
    listEl.innerHTML = items.length ? items.map(l => lineupItem(l)).join('')
      : `<div class="empty" style="grid-column:1/-1">Brak lineupów${all.length ? ' dla tych filtrów' : ''}.
         ${canEdit() ? `<br><a class="btn" href="#/admin/nowy?map=${encodeURIComponent(m.id)}&g=${g.id}">+ Dodaj pierwszy</a>` : ''}</div>`;
  }
  app.querySelectorAll('[data-filter]').forEach(group => {
    group.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      state[group.dataset.filter] = b.dataset.v;
      group.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
      const qs = new URLSearchParams();
      if (state.side) qs.set('side', state.side);
      if (state.area) qs.set('area', state.area);
      setQuery(qs);
      draw();
    });
  });
  draw();
}

function viewLineup(id) {
  const l = getLineup(id);
  if (!l) return notFound('Nie ma takiego lineupu (może został usunięty).');
  const m = getMap(l.map);
  const g = grenadeOf(l.grenade);
  const s = sideOf(l.side);
  crumbs([['Mapy', '#/'], [m?.name || l.map, `#/m/${encodeURIComponent(l.map)}`], [g.name, `#/m/${encodeURIComponent(l.map)}/${g.id}`], [l.title]]);
  const imgs = l.images.map((im, i) => ({ src: imgUrl(im.src), caption: roleName(i, im.caption) }));
  const vid = videoEmbed(l.video);
  const siblings = lineupsFor(l.map, l.grenade);
  const idx = siblings.findIndex(x => x.id === l.id);
  const prev = siblings[idx - 1], next = siblings[idx + 1];
  const fav = isFav(l.id);

  app.innerHTML = `
    <article class="lineup-card ${g.cls}">
      <div class="lc-head">
        <div>
          <h1>${icon(g.id)}${esc(l.title)}</h1>
          <div class="li-meta">
            <span class="badge">${esc(m?.name || l.map)}</span>
            <span class="badge ${s.cls}">${s.id === 'both' ? 'T i CT' : esc(s.name)}</span>
            ${l.area ? `<span class="badge">${esc(l.area)}</span>` : ''}
            <span class="badge ${esc(l.difficulty)}">${esc(diffName(l.difficulty))}</span>
          </div>
        </div>
        <div class="lc-actions">
          <button class="icon-btn ${fav ? 'on' : ''}" id="favBtn" title="Ulubione" aria-pressed="${fav}">${fav ? '★' : '☆'}</button>
          <button class="btn" id="copyBtn">🔗 Kopiuj link</button>
          ${'wakeLock' in navigator ? '<button class="icon-btn" id="wakeBtn" title="Nie wygaszaj ekranu (telefon obok monitora)" aria-pressed="false">☀</button>' : ''}
          ${canEdit() ? `<a class="btn" href="#/admin/edytuj/${encodeURIComponent(l.id)}">✎ Edytuj</a>` : ''}
        </div>
      </div>

      <div class="throw-box">
        <div><div class="k">Rzut</div><div class="v">${esc(throwName(l.throw))}</div></div>
        <div class="div"></div>
        <div><div class="k">Granat</div><div class="v">${esc(g.long || g.name)}</div></div>
      </div>

      ${imgs.length ? `<div class="shots n${Math.min(imgs.length, 3)}">
        ${imgs.map((im, i) => `<figure class="shot" data-i="${i}">
          <img src="${esc(im.src)}" alt="${esc(im.caption)}" ${i > 1 ? 'loading="lazy"' : ''}>
          <figcaption><span class="num">${i + 1}</span>${esc(im.caption)}</figcaption></figure>`).join('')}
      </div>` : '<div class="empty">Brak zdjęć.</div>'}

      ${l.description ? `<div class="desc">${esc(l.description)}</div>` : ''}

      ${l.video ? `${vid ? `<div class="video-wrap"><iframe src="${esc(vid.src)}" title="Klip" loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : ''}
        <a href="${esc(l.video)}" target="_blank" rel="noopener" class="small">▶ Otwórz klip${vid ? ` w ${esc(vid.name)}` : ''} ↗</a>` : ''}

      ${l.tags?.length ? `<div class="li-meta" style="margin-top:1rem">${l.tags.map(t => `<a class="badge" href="#/szukaj?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}

      <div class="lc-foot">
        <span>Dodał(a): <b>${esc(l.author || '—')}</b> · ${esc(fmtDate(l.createdAt))}${l.updatedAt && l.updatedAt !== l.createdAt ? ` · edytowano ${esc(fmtDate(l.updatedAt))}` : ''}</span>
        ${siblings.length > 1 ? `<span>${idx + 1} / ${siblings.length}</span>` : ''}
      </div>
      ${siblings.length > 1 ? `<div class="pager">
        ${prev ? `<a class="btn" href="#/l/${encodeURIComponent(prev.id)}">‹ ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="btn" href="#/l/${encodeURIComponent(next.id)}">${esc(next.title)} ›</a>` : '<span></span>'}
      </div>` : ''}
    </article>`;

  app.querySelectorAll('.shot').forEach(f => f.addEventListener('click', () => openLightbox(imgs, +f.dataset.i)));
  app.querySelector('#favBtn').onclick = e => {
    const on = toggleFav(l.id);
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.textContent = on ? '★' : '☆';
    e.currentTarget.setAttribute('aria-pressed', on);
    toast(on ? 'Dodano do ulubionych' : 'Usunięto z ulubionych');
  };
  app.querySelector('#copyBtn').onclick = async () => {
    await copyText(lineupLink(l.id));
    toast('Link skopiowany – wklej na Discordzie', 'ok');
  };
  const wb = app.querySelector('#wakeBtn');
  if (wb) wb.onclick = async () => {
    if (wakeLock) { releaseWake(); wb.classList.remove('on'); return; }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wb.classList.add('on'); wb.setAttribute('aria-pressed', 'true');
      toast('Ekran nie zgaśnie, dopóki jesteś na tej stronie');
      wakeLock.addEventListener('release', () => { wakeLock = null; wb.classList.remove('on'); });
    } catch { toast('Przeglądarka nie pozwoliła zablokować wygaszania', 'err'); }
  };
  // strzałki ← → przełączają lineupy (poza lightboxem)
  const onKey = e => {
    if (document.querySelector('.lightbox') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft' && prev) go(`#/l/${encodeURIComponent(prev.id)}`);
    if (e.key === 'ArrowRight' && next) go(`#/l/${encodeURIComponent(next.id)}`);
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => document.removeEventListener('keydown', onKey), { once: true });
}

function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }

function viewSearch(qs) {
  crumbs([['Mapy', '#/'], [`Szukaj: ${qs}`]]);
  const res = search(qs);
  document.getElementById('searchInput').value = qs;
  app.innerHTML = `
    <div class="page-head"><h1>Wyniki: „${esc(qs)}”</h1><span class="muted">${res.length} ${plural(res.length, 'wynik', 'wyniki', 'wyników')}</span></div>
    ${res.length ? `<div class="lineup-list">${res.map(l => lineupItem(l, { showMap: true })).join('')}</div>`
      : '<div class="empty">Nic nie znaleziono. Spróbuj innego słowa (np. nazwy miejsca, mapy albo „jump”).</div>'}`;
}

function viewFavs() {
  crumbs([['Mapy', '#/'], ['Ulubione']]);
  const list = favLineups();
  app.innerHTML = `
    <div class="page-head"><h1>★ Ulubione</h1><span class="muted">zapisane w tej przeglądarce</span></div>
    ${list.length ? `<div class="lineup-list">${list.map(l => lineupItem(l, { showMap: true })).join('')}</div>`
      : '<div class="empty">Nie masz jeszcze ulubionych. Otwórz lineup i kliknij ☆.</div>'}`;
}

// ===== Radar =====
export function radarMarkup(m, items, { editable = false } = {}) {
  const lines = items.filter(l => l.radar?.target && l.radar?.from).map(l => {
    const g = grenadeOf(l.grenade);
    return `<line x1="${l.radar.from.x * 100}%" y1="${l.radar.from.y * 100}%" x2="${l.radar.target.x * 100}%" y2="${l.radar.target.y * 100}%"
      class="${g.cls}" style="stroke:var(--c)" stroke-width="2.5" stroke-dasharray="6 5" opacity=".85"/>`;
  }).join('');
  const pins = items.map(l => {
    const g = grenadeOf(l.grenade);
    const r = l.radar || {};
    return (r.from ? `<span class="pin from ${g.cls}" style="left:${r.from.x * 100}%;top:${r.from.y * 100}%"></span>` : '') +
      (r.target ? `<button class="pin ${g.cls}" data-id="${esc(l.id)}" style="left:${r.target.x * 100}%;top:${r.target.y * 100}%" aria-label="${esc(l.title)}" title="${esc(l.title)}"></button>` : '');
  }).join('');
  return `<div class="radar-wrap ${editable ? 'radar-edit' : ''}">
    <img src="${esc(imgUrl(m.radar))}" alt="Radar ${esc(m.name)}" draggable="false">
    <svg class="lines">${lines}</svg>${pins}</div>`;
}

function viewRadar(mapId, q) {
  const m = getMap(mapId);
  if (!m) return notFound('Nie ma takiej mapy.');
  crumbs([['Mapy', '#/'], [m.name, `#/m/${encodeURIComponent(m.id)}`], ['Radar']]);
  if (!m.radar) {
    app.innerHTML = `<div class="empty">Ta mapa nie ma jeszcze obrazu radaru.${canEdit() ? `<br><a class="btn" href="#/admin/mapy?edit=${encodeURIComponent(m.id)}">Dodaj radar</a>` : ''}</div>`;
    return;
  }
  const state = { g: q.get('g') || '', side: q.get('side') || '' };
  app.innerHTML = `
    <div class="page-head"><h1>Radar · ${esc(m.name)}</h1><span class="muted">Kliknij punkt, aby otworzyć lineup</span></div>
    <div class="filters">
      ${chips('g', [['', 'Wszystkie'], ...GRENADES.map(g => [g.id, g.name])], state.g)}
      ${chips('side', [['', 'Obie strony'], ['T', 'T', 't'], ['CT', 'CT', 'ct']], state.side)}
    </div>
    <div id="radar"></div>
    <div class="radar-legend">
      ${GRENADES.map(g => `<span class="${g.cls}"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--c)"></span> ${esc(g.name)}</span>`).join('')}
      <span>○ = miejsce rzutu, ● = cel</span>
    </div>
    <div id="noPins" class="empty hidden">Żaden lineup nie ma jeszcze punktu na radarze. Ustawisz go w edycji lineupu.</div>`;

  const box = app.querySelector('#radar');
  function draw() {
    const items = lineupsFor(m.id).filter(l => l.radar?.target && (!state.g || l.grenade === state.g) && sideMatch(l, state.side));
    box.innerHTML = radarMarkup(m, items);
    app.querySelector('#noPins').classList.toggle('hidden', items.length > 0);
    const wrap = box.querySelector('.radar-wrap');
    let tip = null;
    box.querySelectorAll('button.pin').forEach(p => {
      const l = getLineup(p.dataset.id);
      p.onclick = () => go(`#/l/${encodeURIComponent(l.id)}`);
      p.onmouseenter = () => { tip = h(`<div class="pin-tip" style="left:${p.style.left};top:${p.style.top}">${esc(l.title)}</div>`); wrap.appendChild(tip); };
      p.onmouseleave = () => { tip?.remove(); tip = null; };
    });
  }
  app.querySelectorAll('[data-filter]').forEach(group => group.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state[group.dataset.filter] = b.dataset.v;
    group.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
    const qs = new URLSearchParams();
    if (state.g) qs.set('g', state.g);
    if (state.side) qs.set('side', state.side);
    setQuery(qs);
    draw();
  }));
  draw();
}

// ===== Start =====
export function rerender() { route(); }

document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = document.getElementById('searchInput').value.trim();
  if (v) go(`#/szukaj?q=${encodeURIComponent(v)}`);
});
let searchTimer;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const v = e.target.value.trim();
  searchTimer = setTimeout(() => {
    if (v.length < 2) return;
    const hash = `#/szukaj?q=${encodeURIComponent(v)}`;
    if (location.hash.startsWith('#/szukaj')) { history.replaceState(null, '', hash); currentHash = hash; viewSearch(v); }
    else go(hash);
  }, 250);
});

// Zdjęcie jeszcze nie opublikowane na Pages? Spróbuj prosto z repozytorium.
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG' || img.dataset.fallback) return;
  const src = img.getAttribute('src');
  const raw = rawUrl(src);
  if (raw) { img.dataset.fallback = '1'; img.src = raw; }
}, true);

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', e => { if (leaveGuard && !leaveGuard(true)) { e.preventDefault(); e.returnValue = ''; } });

init().then(route);

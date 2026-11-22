// Stałe, ikony i drobne komponenty UI

export const GRENADES = [
  { id: 'smoke',   name: 'Smoke',   cls: 'c-smoke' },
  { id: 'flash',   name: 'Flash',   cls: 'c-flash' },
  { id: 'molotov', name: 'Mołotow', cls: 'c-molotov', long: 'Mołotow / Incendiary' },
  { id: 'he',      name: 'HE',      cls: 'c-he' },
];
export const THROWS = [
  { id: 'lmb',      name: 'LPM' },
  { id: 'jump',     name: 'Jump throw' },
  { id: 'runjump',  name: 'Run + jump' },
  { id: 'rmb',      name: 'PPM (krótki)' },
  { id: 'lmbrmb',   name: 'LPM + PPM' },
  { id: 'crouch',   name: 'Kucnięty' },
];
export const DIFFICULTY = [
  { id: 'easy',   name: 'Łatwy' },
  { id: 'medium', name: 'Średni' },
  { id: 'hard',   name: 'Trudny' },
];
export const SIDES = [
  { id: 'T',    name: 'T',    cls: 't' },
  { id: 'CT',   name: 'CT',   cls: 'ct' },
  { id: 'both', name: 'Obie', cls: 'both' },
];
export const DEFAULT_AREAS = ['A', 'Mid', 'B'];
export const IMAGE_ROLES = ['Gdzie stanąć', 'Gdzie celować', 'Efekt'];

export const byId = (list, id) => list.find(x => x.id === id);
export const grenadeOf = id => byId(GRENADES, id) || { id, name: id, cls: '' };
export const throwName = id => (byId(THROWS, id) || { name: id || '—' }).name;
export const diffName = id => (byId(DIFFICULTY, id) || { name: id || '—' }).name;
export const sideOf = id => byId(SIDES, id) || { id, name: id || '—', cls: '' };
export const roleName = (i, caption) => caption || IMAGE_ROLES[i] || `Zdjęcie ${i + 1}`;

// Proste, własne ikony SVG (stroke = currentColor)
const ICONS = {
  smoke: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 46h30a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0-3 23z" fill="currentColor" fill-opacity=".18"/><path d="M14 54h22M42 54h8"/></svg>',
  flash: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="32" r="9" fill="currentColor" fill-opacity=".35"/><path d="M32 6v10M32 48v10M6 32h10M48 32h10M13.6 13.6l7 7M43.4 43.4l7 7M13.6 50.4l7-7M43.4 20.6l7-7"/></svg>',
  molotov: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 58c-11 0-18-7-18-17 0-9 6-14 9-22 2 5 5 7 7 8 0-8 4-15 10-21 0 9 10 15 10 29 0 13-7 23-18 23z" fill="currentColor" fill-opacity=".2"/><path d="M32 58c-5 0-8-3-8-8 0-5 4-7 5-11 3 3 4 2 5 0 3 4 6 6 6 11 0 5-3 8-8 8z"/></svg>',
  he: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="30" cy="40" rx="15" ry="17" fill="currentColor" fill-opacity=".2"/><path d="M24 23v-6h12v6M36 17h8l6 6M24 33h12M24 41h12M30 23v34"/><circle cx="52" cy="26" r="3"/></svg>',
};
export const icon = name => ICONS[name] || '';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(msg, type = '', ms = 3500) {
  const box = document.getElementById('toasts');
  const el = h(`<div class="toast ${type}">${esc(msg)}</div>`);
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function slugify(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
}
export const rand = (n = 4) => Math.random().toString(36).slice(2, 2 + n);

// Zamiana linku do klipu na adres do osadzenia (iframe)
export function videoEmbed(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const toSec = t => {
    if (!t) return 0;
    if (/^\d+$/.test(t)) return +t;
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  };
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else { const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/); if (m) id = m[1]; }
    if (!id) return null;
    const start = toSec(u.searchParams.get('t') || u.searchParams.get('start'));
    return { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1${start ? `&start=${start}` : ''}`, name: 'YouTube' };
  }
  if (host === 'streamable.com') {
    const id = u.pathname.split('/').filter(Boolean).pop();
    return id ? { src: `https://streamable.com/e/${id}`, name: 'Streamable' } : null;
  }
  if (host === 'medal.tv') {
    // Oficjalny kod osadzania Medal używa po prostu adresu klipu w iframe
    return /clips?\//.test(u.pathname) ? { src: u.href, name: 'Medal' } : null;
  }
  return null;
}

// ===== Lightbox =====
export function openLightbox(items, start = 0) {
  // items: [{src, caption}]
  let i = start;
  const prevFocus = document.activeElement;
  const el = h(`
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="Podgląd zdjęcia">
      <div class="lb-top"><span class="cap"></span><span><span class="cnt"></span>
        <button class="icon-btn lb-close" aria-label="Zamknij" style="margin-left:.6rem">✕</button></span></div>
      <div class="lb-stage">
        <img alt="">
        <button class="lb-nav lb-prev" aria-label="Poprzednie">‹</button>
        <button class="lb-nav lb-next" aria-label="Następne">›</button>
      </div>
      <div class="lb-dots"></div>
    </div>`);
  const img = el.querySelector('img');
  const dots = el.querySelector('.lb-dots');
  items.forEach((_, k) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Zdjęcie ${k + 1}`);
    b.onclick = () => { i = k; show(); };
    dots.appendChild(b);
  });
  const multi = items.length > 1;
  el.querySelectorAll('.lb-nav').forEach(b => b.classList.toggle('hidden', !multi));
  dots.classList.toggle('hidden', !multi);

  function show() {
    const it = items[i];
    img.src = it.src;
    img.alt = it.caption || '';
    el.querySelector('.cap').textContent = it.caption || '';
    el.querySelector('.cnt').textContent = multi ? `${i + 1} / ${items.length}` : '';
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }
  const go = d => { i = (i + d + items.length) % items.length; show(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    el.remove();
    document.body.style.overflow = '';
    prevFocus?.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  }
  el.querySelector('.lb-prev').onclick = e => { e.stopPropagation(); go(-1); };
  el.querySelector('.lb-next').onclick = e => { e.stopPropagation(); go(1); };
  el.querySelector('.lb-close').onclick = close;
  el.querySelector('.lb-stage').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
  // gesty przesuwania na telefonie
  let sx = null, sy = null;
  el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
    sx = null;
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  el.querySelector('.lb-close').focus();
  show();
}

export function confirmBox(msg) {
  return window.confirm(msg);
}

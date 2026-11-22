// Dane, ustawienia, logowanie i zapisywanie zmian

import { GitHubRepo, decryptToken } from './github.js';
import { idb, makeZip } from './images.js';
import { GRENADES } from './ui.js';

const LS = { auth: 'cs2l.auth', favs: 'cs2l.favs', draft: 'cs2l.draft', deleted: 'cs2l.deleted', nick: 'cs2l.nick' };
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const store = {
  config: { branch: 'main', dataPath: 'lineups.json' },
  data: { version: 1, maps: [], lineups: [] },
  published: null,            // dane z serwera (do porównań w trybie lokalnym)
  auth: lsGet(LS.auth),       // { mode: 'github'|'local', token?, nick }
  urls: new Map(),            // ścieżka → objectURL (świeżo dodane zdjęcia)
  pending: new Map(),         // tryb lokalny: ścieżka → Blob
  deleted: new Set(lsGet(LS.deleted, [])),
  loadError: null,
};

export function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  d.version = d.version || 1;
  d.maps = Array.isArray(d.maps) ? d.maps : [];
  d.lineups = Array.isArray(d.lineups) ? d.lineups : [];
  d.lineups.forEach(l => { l.images = Array.isArray(l.images) ? l.images : []; l.tags = Array.isArray(l.tags) ? l.tags : []; });
  return d;
}

export function detectRepo(cfg) {
  if (cfg.repo) return cfg.repo;
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    return first && !first.includes('.') ? `${owner}/${first}` : `${owner}/${host}`;
  }
  return '';
}

export async function init() {
  try {
    const r = await fetch('config.json', { cache: 'no-store' });
    if (r.ok) Object.assign(store.config, await r.json());
  } catch {}
  store.config.repo = detectRepo(store.config);

  // dane opublikowane (z obejściem cache GitHub Pages)
  try {
    const r = await fetch(`${store.config.dataPath}?v=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    store.published = normalize(await r.json());
  } catch (e) {
    store.loadError = `Nie udało się wczytać ${store.config.dataPath} (${e.message}).`;
    store.published = normalize({});
  }
  store.data = store.published;

  const a = store.auth;
  if (a?.mode === 'local') {
    const draft = lsGet(LS.draft);
    if (draft) store.data = normalize(draft);
    try {
      const files = await idb.all();
      for (const [path, blob] of files) { store.pending.set(path, blob); store.urls.set(path, URL.createObjectURL(blob)); }
    } catch {}
  } else if (a?.mode === 'github' && store.config.repo) {
    // zalogowany: czytamy najświeższą wersję prosto z repo (Pages odświeża się z opóźnieniem)
    try {
      const gh = repo();
      store.data = normalize(JSON.parse(await gh.readFile(store.config.dataPath)));
    } catch (e) {
      if (e.status === 401) { logout(); }
    }
  }
}

// ===== Odczyt =====
export function imgUrl(src) {
  if (!src) return '';
  return store.urls.get(src) || src;
}
export function rawUrl(src) {
  const { repo, branch } = store.config;
  return repo && src && !/^(https?:|blob:|data:)/.test(src) ? `https://raw.githubusercontent.com/${repo}/${branch}/${src}` : '';
}
export const maps = () => [...store.data.maps].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'pl'));
export const getMap = id => store.data.maps.find(m => m.id === id);
export const getLineup = id => store.data.lineups.find(l => l.id === id);
export const areasOf = map => (map?.areas?.length ? map.areas : ['A', 'Mid', 'B']);

export function sortLineups(list) {
  const gOrder = Object.fromEntries(GRENADES.map((g, i) => [g.id, i]));
  return [...list].sort((a, b) =>
    (gOrder[a.grenade] ?? 9) - (gOrder[b.grenade] ?? 9) ||
    String(a.area).localeCompare(String(b.area), 'pl') ||
    a.title.localeCompare(b.title, 'pl'));
}
export const lineupsFor = (map, grenade) =>
  sortLineups(store.data.lineups.filter(l => l.map === map && (!grenade || l.grenade === grenade)));

const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
export function search(q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return sortLineups(store.data.lineups.filter(l => {
    const m = getMap(l.map);
    const hay = fold([l.title, l.description, l.area, l.side, l.grenade, m?.name, ...(l.tags || [])].join(' '));
    return words.every(w => hay.includes(w));
  }));
}

// ===== Ulubione (per przeglądarka) =====
let favs = new Set(lsGet(LS.favs, []));
export const isFav = id => favs.has(id);
export function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  lsSet(LS.favs, [...favs]);
  return favs.has(id);
}
export const favLineups = () => sortLineups(store.data.lineups.filter(l => favs.has(l.id)));

// ===== Logowanie =====
export const lastNick = () => lsGet(LS.nick, '');
function setAuth(a) {
  store.auth = a;
  lsSet(LS.auth, a);
  if (a?.nick) lsSet(LS.nick, a.nick);
}
export function repo() {
  return new GitHubRepo({ token: store.auth.token, repo: store.config.repo, branch: store.config.branch });
}
export async function loginGroup(password, nick) {
  if (!store.config.encryptedToken) throw new Error('Hasło grupy nie jest jeszcze skonfigurowane (brak encryptedToken w config.json).');
  const token = await decryptToken(store.config.encryptedToken, password);
  return loginToken(token, nick);
}
export async function loginToken(token, nick) {
  if (!store.config.repo) throw new Error('Nie znam repozytorium – uzupełnij "repo" w config.json (np. "jan/cs2-lineupy").');
  const gh = new GitHubRepo({ token, repo: store.config.repo, branch: store.config.branch });
  await gh.check();
  setAuth({ mode: 'github', token, nick });
  try { store.data = normalize(JSON.parse(await gh.readFile(store.config.dataPath))); } catch {}
}
export function loginLocal(nick) {
  setAuth({ mode: 'local', nick });
  const draft = lsGet(LS.draft);
  if (draft) store.data = normalize(draft);
}
export function logout() {
  setAuth(null);
  store.data = store.published;
}
export const canEdit = () => !!store.auth;

// ===== Zapisywanie =====
/**
 * mutate: (data) => data – funkcja nakładana na NAJŚWIEŻSZE dane (ważne przy kilku edytujących)
 * files: [{ path, blob }] nowe zdjęcia; deletes: [ścieżki] do usunięcia
 */
export async function commit({ mutate, files = [], deletes = [], message, onProgress }) {
  const nick = store.auth?.nick || 'anon';
  const msg = `${message} (${nick})`;
  if (store.auth?.mode === 'github') {
    const res = await repo().commitChange({ dataPath: store.config.dataPath, mutate, files, deletes, message: msg, onProgress });
    for (const f of files) store.urls.set(f.path, URL.createObjectURL(f.blob));
    store.data = normalize(res.data);
    return { mode: 'github' };
  }
  if (store.auth?.mode === 'local') {
    store.data = normalize(mutate(structuredClone(store.data)));
    store.data.updatedAt = new Date().toISOString();
    for (const f of files) {
      store.pending.set(f.path, f.blob);
      store.urls.set(f.path, URL.createObjectURL(f.blob));
      store.deleted.delete(f.path);
      await idb.put(f.path, f.blob);
    }
    for (const p of deletes) {
      if (store.pending.has(p)) { store.pending.delete(p); await idb.del(p); }
      else store.deleted.add(p);
    }
    lsSet(LS.draft, store.data);
    lsSet(LS.deleted, [...store.deleted]);
    return { mode: 'local' };
  }
  throw new Error('Nie jesteś zalogowany.');
}

// Tryb lokalny: paczka do ręcznego wgrania do repo
export async function exportLocalZip() {
  const entries = [{ path: store.config.dataPath, data: JSON.stringify(store.data, null, 2) + '\n' }];
  for (const [path, blob] of store.pending) entries.push({ path, data: blob });
  if (store.deleted.size) entries.push({ path: 'DO_USUNIECIA.txt', data: 'Usuń te pliki z repozytorium:\n' + [...store.deleted].join('\n') + '\n' });
  return makeZip(entries);
}
export async function discardLocalDraft() {
  lsSet(LS.draft, null);
  lsSet(LS.deleted, null);
  store.pending.clear();
  store.deleted.clear();
  await idb.clear();
  store.data = store.published;
}
export const localChangesCount = () =>
  store.pending.size + store.deleted.size + (JSON.stringify(store.data.lineups) !== JSON.stringify(store.published.lineups) ||
  JSON.stringify(store.data.maps) !== JSON.stringify(store.published.maps) ? 1 : 0);

// Zapis do repozytorium przez GitHub REST API + szyfrowanie tokena hasłem grupy

const API = 'https://api.github.com';

function b64FromBytes(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
const bytesFromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export class GitHubError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

export class GitHubRepo {
  constructor({ token, repo, branch = 'main' }) {
    this.token = token; this.repo = repo; this.branch = branch;
  }

  async req(path, { method = 'GET', body, raw = false } = {}) {
    const res = await fetch(`${API}/repos/${this.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch {}
      throw new GitHubError(res.status, msg);
    }
    return raw ? res.text() : res.json();
  }

  // Sprawdza, czy token ma prawo zapisu do repo
  async check() {
    const r = await this.req('');
    if (!r.permissions?.push) throw new GitHubError(403, 'Token nie ma uprawnień do zapisu w tym repozytorium.');
    return r;
  }

  async readFile(path, ref) {
    return this.req(`/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref || this.branch)}`, { raw: true });
  }

  async headSha() {
    const ref = await this.req(`/git/ref/heads/${encodeURIComponent(this.branch)}`);
    return ref.object.sha;
  }

  async blobFrom(blobOrString) {
    let content;
    if (typeof blobOrString === 'string') content = b64FromBytes(new TextEncoder().encode(blobOrString));
    else content = b64FromBytes(new Uint8Array(await blobOrString.arrayBuffer()));
    const r = await this.req('/git/blobs', { method: 'POST', body: { content, encoding: 'base64' } });
    return r.sha;
  }

  /**
   * Jeden atomowy commit: pobiera świeży plik danych, nakłada zmianę (mutate),
   * dodaje pliki i usuwa niepotrzebne. Przy konflikcie (ktoś zapisał w międzyczasie) ponawia.
   */
  async commitChange({ dataPath, mutate, files = [], deletes = [], message, onProgress = () => {} }) {
    // Najpierw wysyłamy obrazki (nie zależą od stanu gałęzi)
    const fileEntries = [];
    for (let k = 0; k < files.length; k++) {
      onProgress(`Wysyłanie zdjęć ${k + 1}/${files.length}…`);
      fileEntries.push({ path: files[k].path, mode: '100644', type: 'blob', sha: await this.blobFrom(files[k].blob) });
    }
    for (let attempt = 1; attempt <= 4; attempt++) {
      onProgress('Zapisywanie zmian…');
      const head = await this.headSha();
      const commit = await this.req(`/git/commits/${head}`);
      let current;
      try { current = JSON.parse(await this.readFile(dataPath, head)); }
      catch (e) { if (e.status === 404) current = { version: 1, maps: [], lineups: [] }; else throw e; }
      const next = mutate(current);
      if (Array.isArray(next.lineups)) next.updatedAt = new Date().toISOString();
      const json = JSON.stringify(next, null, 2) + '\n';
      const dataSha = await this.blobFrom(json);
      const tree = [
        ...fileEntries,
        { path: dataPath, mode: '100644', type: 'blob', sha: dataSha },
        ...deletes.map(p => ({ path: p, mode: '100644', type: 'blob', sha: null })),
      ];
      let newTree;
      try {
        newTree = await this.req('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
      } catch (e) {
        // np. usuwany plik już nie istnieje – spróbuj bez usuwania
        if (deletes.length && e.status === 422) {
          newTree = await this.req('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: tree.filter(t => t.sha !== null) } });
        } else throw e;
      }
      const newCommit = await this.req('/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [head] } });
      try {
        await this.req(`/git/refs/heads/${encodeURIComponent(this.branch)}`, { method: 'PATCH', body: { sha: newCommit.sha } });
        return { data: next, sha: newCommit.sha };
      } catch (e) {
        if (e.status === 422 && attempt < 4) continue; // ktoś zapisał w międzyczasie – ponów na świeżych danych
        throw e;
      }
    }
  }
}

// ===== Szyfrowanie tokena wspólnym hasłem (PBKDF2 + AES-GCM) =====
const ITER = 310000;

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(token, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  return { v: 1, iter: ITER, salt: b64FromBytes(salt), iv: b64FromBytes(iv), data: b64FromBytes(data) };
}

export async function decryptToken(enc, password) {
  try {
    const key = await deriveKey(password, bytesFromB64(enc.salt));
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesFromB64(enc.iv) }, key, bytesFromB64(enc.data));
    return new TextDecoder().decode(out);
  } catch {
    throw new Error('Złe hasło grupy.');
  }
}

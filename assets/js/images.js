// Kompresja zdjęć w przeglądarce, prosty ZIP i magazyn IndexedDB (tryb lokalny)

export async function compressImage(file, { maxW = 1600, maxH = 1600, quality = 0.82 } = {}) {
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    // starsze Safari – fallback przez <img>
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Nie udało się odczytać obrazu.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = bmp.width, h0 = bmp.height;
  const scale = Math.min(1, maxW / w0, maxH / h0);
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = (type, q) => new Promise(r => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/webp', quality);
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { // np. Safari nie koduje WebP
    blob = await toBlob('image/jpeg', 0.85);
    ext = 'jpg';
  }
  return { blob, ext, width: w, height: h };
}

export const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB';

export function imageFilesFrom(dataTransferOrList) {
  const items = dataTransferOrList?.items ? [...dataTransferOrList.items] : null;
  if (items) return items.filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  return [...(dataTransferOrList || [])].filter(f => f.type.startsWith('image/'));
}

// ===== Minimalny ZIP (bez kompresji – zdjęcia i tak są skompresowane) =====
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export async function makeZip(entries) {
  // entries: [{ path, data: Blob|string }]
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : new Uint8Array(await e.data.arrayBuffer());
    const name = enc.encode(e.path);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ===== IndexedDB: zdjęcia w trybie lokalnym =====
const DB = 'cs2-lineupy', STORE = 'files';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
export const idb = {
  put: (k, v) => tx('readwrite', s => s.put(v, k)),
  del: k => tx('readwrite', s => s.delete(k)),
  clear: () => tx('readwrite', s => s.clear()),
  async all() {
    const d = await db();
    return new Promise((res, rej) => {
      const out = new Map();
      const r = d.transaction(STORE).objectStore(STORE).openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { out.set(c.key, c.value); c.continue(); } else res(out); };
      r.onerror = () => rej(r.error);
    });
  },
};

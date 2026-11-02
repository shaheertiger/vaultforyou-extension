// Vault storage and encryption.
//
// Everything the user saves (bookmarks AND folder names) is encrypted with
// AES-256-GCM. The key is derived from the vault password with PBKDF2-SHA-256.
// The encrypted vault lives in chrome.storage.local (this computer only).
// While unlocked, the derived key is kept in chrome.storage.session, which is
// held in memory, never written to disk, and cleared when Chrome closes.

const ITERATIONS = 600000;
const VAULT = 'vault';
const KEY = 'vaultKey';
const SETTINGS = 'settings';
const BACKUP_FORMAT = 'vaultforyou.private-bookmarks.backup';

const te = new TextEncoder();
const td = new TextDecoder();

const toB64 = buf => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function encryptWith(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decryptWith(key, rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct));
  return JSON.parse(td.decode(pt));
}

const newKdf = () => ({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(crypto.getRandomValues(new Uint8Array(16))) });
const keyFromKdf = (password, kdf) => deriveKey(password, fromB64(kdf.salt), kdf.iterations);

async function storeSessionKey(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await chrome.storage.session.set({ [KEY]: jwk });
}

async function sessionKey() {
  const { [KEY]: jwk } = await chrome.storage.session.get(KEY);
  if (!jwk) return null;
  return crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

async function readVault() {
  const { [VAULT]: v } = await chrome.storage.local.get(VAULT);
  return v || null;
}

const emptyData = () => ({ folders: [], bms: [] });

function normalize(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    folders: Array.isArray(d.folders) ? d.folders.filter(f => f && f.id && typeof f.name === 'string') : [],
    bms: Array.isArray(d.bms) ? d.bms.filter(b => b && b.id && typeof b.url === 'string') : []
  };
}

export const uid = () => {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
};

/** 'none' | 'locked' | 'unlocked' */
export async function status() {
  if (!(await readVault())) return 'none';
  return (await sessionKey()) ? 'unlocked' : 'locked';
}

export async function createVault(password) {
  const kdf = newKdf();
  const key = await keyFromKdf(password, kdf);
  const rec = await encryptWith(key, emptyData());
  await chrome.storage.local.set({ [VAULT]: { v: 1, kdf, ...rec, created: Date.now() } });
  await storeSessionKey(key);
}

/** Returns true when the password opens the vault. */
export async function unlock(password) {
  const v = await readVault();
  if (!v) return false;
  try {
    const key = await keyFromKdf(password, v.kdf);
    await decryptWith(key, v);
    await storeSessionKey(key);
    return true;
  } catch (e) {
    return false;
  }
}

export async function lock() {
  await chrome.storage.session.remove(KEY);
}

export async function erase() {
  await chrome.storage.session.remove(KEY);
  await chrome.storage.local.remove(VAULT);
}

export async function load() {
  const v = await readVault();
  const key = await sessionKey();
  if (!v || !key) return null;
  try {
    return normalize(await decryptWith(key, v));
  } catch (e) {
    // Key no longer matches (for example the password changed elsewhere). Lock.
    await lock();
    return null;
  }
}

// Serialise writes made from this page so two quick edits can't clobber each other.
let queue = Promise.resolve();

/** Apply fn(data) to the latest decrypted data, re-encrypt and save. Returns the new data. */
export function mutate(fn) {
  const run = async () => {
    const v = await readVault();
    const key = await sessionKey();
    if (!v || !key) throw new Error('locked');
    const data = normalize(await decryptWith(key, v));
    const next = normalize((await fn(data)) || data);
    const rec = await encryptWith(key, next);
    await chrome.storage.local.set({ [VAULT]: { ...v, ...rec } });
    return next;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

export async function verifyPassword(password) {
  const v = await readVault();
  if (!v) return false;
  try {
    await decryptWith(await keyFromKdf(password, v.kdf), v);
    return true;
  } catch (e) {
    return false;
  }
}

/** Returns false if the current password is wrong. */
export async function changePassword(current, next) {
  if (!(await verifyPassword(current))) return false;
  const data = await load();
  if (!data) return false;
  const kdf = newKdf();
  const key = await keyFromKdf(next, kdf);
  const rec = await encryptWith(key, data);
  const v = await readVault();
  await chrome.storage.local.set({ [VAULT]: { ...v, kdf, ...rec } });
  await storeSessionKey(key);
  return true;
}

// ---- Backups ----

/** Builds an encrypted backup that opens with the vault password at the time of export. */
export async function exportBackup() {
  const v = await readVault();
  const key = await sessionKey();
  if (!v || !key) throw new Error('locked');
  const data = normalize(await decryptWith(key, v));
  const rec = await encryptWith(key, data);
  const file = { format: BACKUP_FORMAT, v: 1, exported: new Date().toISOString(), kdf: v.kdf, ...rec };
  return { text: JSON.stringify(file), count: data.bms.length };
}

export class BackupError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Throws BackupError('invalid') or BackupError('badpw'). Returns { added, skipped }. */
export async function importBackup(text, password) {
  let file;
  try { file = JSON.parse(text); } catch (e) { throw new BackupError('invalid'); }
  if (!file || file.format !== BACKUP_FORMAT || !file.kdf || !file.iv || !file.ct) throw new BackupError('invalid');
  let incoming;
  try {
    incoming = normalize(await decryptWith(await keyFromKdf(password, file.kdf), file));
  } catch (e) {
    throw new BackupError('badpw');
  }
  let added = 0, skipped = 0;
  await mutate(data => {
    const byName = new Map(data.folders.map(f => [f.name.toLowerCase(), f.id]));
    const map = new Map();
    for (const f of incoming.folders) {
      const k = f.name.trim().toLowerCase();
      if (!byName.has(k)) {
        const nf = { id: uid(), name: f.name.trim() };
        data.folders.push(nf);
        byName.set(k, nf.id);
      }
      map.set(f.id, byName.get(k));
    }
    const urls = new Set(data.bms.map(b => b.url));
    for (const b of incoming.bms) {
      if (urls.has(b.url)) { skipped++; continue; }
      urls.add(b.url);
      data.bms.push({ id: uid(), title: b.title || b.url, url: b.url, folder: b.folder ? map.get(b.folder) || null : null, fav: !!b.fav, added: b.added || Date.now() });
      added++;
    }
    return data;
  });
  return { added, skipped };
}

// ---- Settings (not secret, stored unencrypted) ----

const DEFAULT_SETTINGS = { autolock: '5', inviteDismissed: false, lastFolder: '' };

export async function getSettings() {
  const { [SETTINGS]: s } = await chrome.storage.local.get(SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export async function setSettings(patch) {
  const s = await getSettings();
  await chrome.storage.local.set({ [SETTINGS]: { ...s, ...patch } });
}

/** Calls cb whenever lock state or vault contents change (in any extension page). */
export function onChange(cb) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'local' && (VAULT in changes || SETTINGS in changes)) || (area === 'session' && KEY in changes)) cb(changes, area);
  });
}

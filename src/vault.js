// Vault storage and encryption.
//
// Everything the user saves (bookmarks AND folder names) is encrypted with
// AES-256-GCM. The key is derived from the vault password with PBKDF2-SHA-256.
// The encrypted vault lives in chrome.storage.local (this computer only).
// While unlocked, the derived key is kept in chrome.storage.session, which is
// held in memory, never written to disk, and cleared when Chrome closes.
//
// Two slots: A is the real vault. B holds either the decoy vault or random
// filler of the same shape, so storage never shows whether a decoy exists.
// Unlocking always tries both slots.

const ITERATIONS = 600000;
const SLOTS = { A: 'vault', B: 'vaultAlt' };
const KEY = 'vaultKey';
const SLOT = 'vaultSlot';
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
const rand = n => crypto.getRandomValues(new Uint8Array(n));

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
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decryptWith(key, rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct));
  return JSON.parse(td.decode(pt));
}

const newKdf = () => ({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(rand(16)) });
const keyFromKdf = (password, kdf) => deriveKey(password, fromB64(kdf.salt), kdf.iterations);
// Random bytes shaped like an empty encrypted vault. Nobody can open it.
const filler = () => ({ v: 1, kdf: newKdf(), iv: toB64(rand(12)), ct: toB64(rand(64 + Math.floor(Math.random() * 32))), created: Date.now() });

async function storeSession(key, slot) {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await chrome.storage.session.set({ [KEY]: jwk, [SLOT]: slot });
}

async function session() {
  const { [KEY]: jwk, [SLOT]: slot } = await chrome.storage.session.get([KEY, SLOT]);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  return { key, slot: slot === 'B' ? 'B' : 'A' };
}

async function readSlot(slot) {
  const k = SLOTS[slot];
  const { [k]: v } = await chrome.storage.local.get(k);
  return v || null;
}
const writeSlot = (slot, rec) => chrome.storage.local.set({ [SLOTS[slot]]: rec });

const emptyData = () => ({ folders: [], bms: [], meta: {} });

function normalize(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    folders: Array.isArray(d.folders) ? d.folders.filter(f => f && f.id && typeof f.name === 'string') : [],
    bms: Array.isArray(d.bms) ? d.bms.filter(b => b && b.id && typeof b.url === 'string') : [],
    meta: d.meta && typeof d.meta === 'object' ? d.meta : {}
  };
}

/** Returns the key if password opens the record, else null. */
async function tryOpen(rec, password) {
  if (!rec) return null;
  try {
    const key = await keyFromKdf(password, rec.kdf);
    await decryptWith(key, rec);
    return key;
  } catch (e) {
    return null;
  }
}

export const uid = () => Array.from(rand(9), x => x.toString(16).padStart(2, '0')).join('');

/** 'none' | 'locked' | 'unlocked' */
export async function status() {
  if (!(await readSlot('A'))) return 'none';
  return (await session()) ? 'unlocked' : 'locked';
}

export async function createVault(password) {
  const kdf = newKdf();
  const key = await keyFromKdf(password, kdf);
  const rec = await encryptWith(key, emptyData());
  await chrome.storage.local.set({ [SLOTS.A]: { v: 1, kdf, ...rec, created: Date.now() }, [SLOTS.B]: filler() });
  await storeSession(key, 'A');
}

/** Returns true when the password opens the vault (real or decoy). */
export async function unlock(password) {
  const [a, b] = await Promise.all([readSlot('A'), readSlot('B')]);
  if (!a) return false;
  // Always derive for both slots so timing doesn't reveal whether a decoy exists.
  const [ka, kb] = await Promise.all([tryOpen(a, password), tryOpen(b || filler(), password)]);
  if (!b) await writeSlot('B', filler());
  if (ka) { await storeSession(ka, 'A'); return true; }
  if (kb) { await storeSession(kb, 'B'); return true; }
  return false;
}

export async function lock() {
  await chrome.storage.session.remove([KEY, SLOT]);
}

/** Erases the real vault, any decoy, and the session. */
export async function erase() {
  await lock();
  await chrome.storage.local.remove([SLOTS.A, SLOTS.B]);
}

/**
 * "Delete vault" from Settings. In the real vault this erases everything.
 * Opened with the decoy password, it only empties the decoy.
 */
export async function deleteVault() {
  const s = await session();
  if (s && s.slot === 'B') {
    const rec = await readSlot('B');
    await writeSlot('B', { ...rec, ...(await encryptWith(s.key, emptyData())) });
    return 'emptied';
  }
  await erase();
  return 'erased';
}

export async function load() {
  const s = await session();
  if (!s) return null;
  const v = await readSlot(s.slot);
  if (!v) { await lock(); return null; }
  try {
    return normalize(await decryptWith(s.key, v));
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
    const s = await session();
    const v = s && (await readSlot(s.slot));
    if (!s || !v) throw new Error('locked');
    const data = normalize(await decryptWith(s.key, v));
    const next = normalize((await fn(data)) || data);
    await writeSlot(s.slot, { ...v, ...(await encryptWith(s.key, next)) });
    return next;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/** Checks the password of the vault that is open now. */
export async function verifyPassword(password) {
  const s = await session();
  return !!(s && (await tryOpen(await readSlot(s.slot), password)));
}

/** Returns 'ok', 'wrong' (current password) or 'taken' (new one is the other slot's password). */
export async function changePassword(current, next) {
  const s = await session();
  if (!s || !(await verifyPassword(current))) return 'wrong';
  const other = s.slot === 'A' ? 'B' : 'A';
  if (await tryOpen(await readSlot(other), next)) return 'taken';
  const data = await load();
  if (!data) return 'wrong';
  const kdf = newKdf();
  const key = await keyFromKdf(next, kdf);
  const v = await readSlot(s.slot);
  await writeSlot(s.slot, { ...v, kdf, ...(await encryptWith(key, data)) });
  await storeSession(key, s.slot);
  return 'ok';
}

// ---- Decoy vault (managed from the real vault only) ----

/** True when the decoy password opened the vault that's open now. */
export async function isDecoy() {
  const s = await session();
  return !!(s && s.slot === 'B');
}

/** Sets or replaces the decoy password. Returns 'ok' or 'same' (matches the real password). */
export async function setDecoy(password) {
  const s = await session();
  if (!s || s.slot !== 'A') throw new Error('locked');
  if (await tryOpen(await readSlot('A'), password)) return 'same';
  // Keep the decoy's contents if one exists already. We can't open the old one
  // without its password, so a new password starts a fresh, empty decoy.
  const kdf = newKdf();
  const key = await keyFromKdf(password, kdf);
  await writeSlot('B', { v: 1, kdf, ...(await encryptWith(key, emptyData())), created: Date.now() });
  await mutate(d => { d.meta.hasDecoy = true; });
  return 'ok';
}

export async function removeDecoy() {
  const s = await session();
  if (!s || s.slot !== 'A') throw new Error('locked');
  await writeSlot('B', filler());
  await mutate(d => { d.meta.hasDecoy = false; });
}

// ---- Backups ----

/** Builds an encrypted backup that opens with the vault password at the time of export. */
export async function exportBackup() {
  const s = await session();
  const v = s && (await readSlot(s.slot));
  if (!s || !v) throw new Error('locked');
  const data = normalize(await decryptWith(s.key, v));
  // Backups carry bookmarks and folders only, never decoy or reminder state.
  const rec = await encryptWith(s.key, { folders: data.folders, bms: data.bms });
  const file = { format: BACKUP_FORMAT, v: 1, exported: new Date().toISOString(), kdf: v.kdf, ...rec };
  await mutate(d => { d.meta.lastBackup = Date.now(); d.meta.backupCount = d.bms.length; });
  return { text: JSON.stringify(file), count: data.bms.length };
}

export class BackupError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/**
 * Adds bookmarks to the open vault. Folders merge by name; addresses already in
 * the vault are skipped. items: [{ title, url, folderName?, fav?, added? }]
 */
export async function addMany(items) {
  let added = 0, skipped = 0;
  await mutate(data => {
    const byName = new Map(data.folders.map(f => [f.name.toLowerCase(), f.id]));
    const folderFor = name => {
      const n = (name || '').trim();
      if (!n) return null;
      const k = n.toLowerCase();
      if (!byName.has(k)) {
        const nf = { id: uid(), name: n.slice(0, 60) };
        data.folders.push(nf);
        byName.set(k, nf.id);
      }
      return byName.get(k);
    };
    const urls = new Set(data.bms.map(b => b.url));
    for (const b of items) {
      if (!b.url || urls.has(b.url)) { skipped++; continue; }
      urls.add(b.url);
      data.bms.push({ id: uid(), title: (b.title || b.url).slice(0, 300), url: b.url, folder: folderFor(b.folderName), fav: !!b.fav, added: b.added || Date.now() });
      added++;
    }
    return data;
  });
  return { added, skipped };
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
  const names = new Map(incoming.folders.map(f => [f.id, f.name]));
  return addMany(incoming.bms.map(b => ({ ...b, folderName: b.folder ? names.get(b.folder) : null })));
}

// ---- Settings (not secret, stored unencrypted) ----

const DEFAULT_SETTINGS = { autolock: '5', inviteDismissed: false, lastFolder: '', openIncognito: false };

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
    if ((area === 'local' && (SLOTS.A in changes || SLOTS.B in changes || SETTINGS in changes)) || (area === 'session' && KEY in changes)) cb(changes, area);
  });
}

/** True if this change removed the vault entirely. */
export const vaultRemoved = changes => !!(changes[SLOTS.A] && !changes[SLOTS.A].newValue);

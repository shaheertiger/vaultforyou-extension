import { h, icon, tile, toast, setError, setBusy, isWebUrl, domainOf, fmtDate, plural } from './dom.js';
import * as vault from './vault.js';
import { welcomeView, setupView, unlockView, focusFirst } from './auth-views.js';
import { folderSelect } from './folder-select.js';
import { siteUrl } from './config.js';

const app = document.getElementById('app');
const S = {
  status: 'none', data: null, settings: null,
  view: 'library', filter: 'all', q: '', menu: null, menuMove: false, dlg: null,
  editId: null, renameId: null, auth: null, // auth: null | 'welcome' | 'setup' | 'unlock'
  exp: 'idle', imp: null
};

const fname = id => (S.data?.folders.find(f => f.id === id) || {}).name || 'No folder';
const sortedFolders = () => S.data.folders.slice().sort((a, b) => a.name.localeCompare(b.name));

async function refresh() {
  S.status = await vault.status();
  S.settings = await vault.getSettings();
  S.data = S.status === 'unlocked' ? await vault.load() : null;
  if (S.status === 'unlocked' && !S.data) S.status = 'locked';
  if (S.status !== 'unlocked') { S.menu = null; S.dlg = null; S.q = ''; S.view = 'library'; }
  else S.auth = null;
  if (S.data && S.filter !== 'all' && S.filter !== 'fav' && S.filter !== 'none' && !S.data.folders.some(f => f.id === S.filter)) S.filter = 'all';
  render();
}

async function save(fn, msg) {
  try {
    S.data = await vault.mutate(fn);
    if (msg) toast(msg);
  } catch (e) {
    toast('The vault is locked. Unlock it to make changes.');
    await refresh();
    return false;
  }
  return true;
}

function go(view, extra = {}) {
  Object.assign(S, { view, menu: null, menuMove: false }, extra);
  render(true);
}

// ---------- Rendering ----------

function render(focus = false) {
  const prev = document.activeElement?.id;
  let view;
  document.body.classList.toggle('is-dark', S.status === 'locked' || !!S.auth);
  if (S.status !== 'unlocked') view = lockedOrNone();
  else view = ({ library: libraryView, edit: editView, folders: foldersView, settings: settingsView, backup: backupView }[S.view] || libraryView)();
  const root = h('div', { class: 'panel' }, view, S.menu && h('div', { class: 'backdrop', onClick: closeMenu }), S.dlg && dialogView());
  app.replaceChildren(root);
  if (S.dlg) focusFirst(root.querySelector('.dialog'));
  else if (focus || S.auth) focusFirst(root);
  else if (prev && document.getElementById(prev)) document.getElementById(prev).focus();
}

function lockedOrNone() {
  if (S.auth === 'welcome') return h('div', { class: 'center dark' }, h('div', { class: 'auth-box' }, welcomeView({ onStart: () => { S.auth = 'setup'; render(); } })));
  if (S.auth === 'setup') return h('div', { class: 'center dark' }, h('div', { class: 'auth-box' }, setupView({ onBack: () => { S.auth = 'welcome'; render(); }, onCreated: refresh })));
  if (S.auth === 'unlock') return h('div', { class: 'center dark' }, h('div', { class: 'auth-box' }, unlockView({ onUnlocked: refresh, onErased: () => { S.auth = null; refresh(); } })));
  if (S.status === 'locked') {
    return h('div', { class: 'center dark' },
      h('span', { class: 'lock-badge', style: 'width:56px;height:56px' }, icon('lock', 24)),
      h('h1', { class: 'h-lg' }, 'Vault locked'),
      h('p', { class: 'center-sub', style: 'color:var(--night-muted)' }, 'Bookmarks stay hidden until you unlock the vault.'),
      h('button', { class: 'btn btn-primary', autofocus: true, onClick: () => { S.auth = 'unlock'; render(); } }, 'Unlock'));
  }
  return h('div', { class: 'center' },
    icon('logo', 44, 'logo'),
    h('h1', { class: 'h-md', style: 'font-size:26px' }, 'No vault yet'),
    h('p', { class: 'center-sub muted' }, 'Create a vault to start saving private bookmarks. It takes less than a minute.'),
    h('button', { class: 'btn btn-primary', autofocus: true, onClick: () => { S.auth = 'welcome'; render(); } }, 'Set up your vault'));
}

function subHeader(title, back = () => go('library'), backLabel = 'Back to library') {
  return h('div', { class: 'subhead' }, h('button', { type: 'button', class: 'icon-btn', style: 'color:var(--ink)', 'aria-label': backLabel, onClick: back }, icon('back')), h('h1', { class: 'h-md' }, title));
}

// ----- Library -----

function filtered() {
  let list = S.data.bms.slice().sort((a, b) => (b.added || 0) - (a.added || 0));
  if (S.filter === 'fav') list = list.filter(b => b.fav);
  else if (S.filter === 'none') list = list.filter(b => !b.folder);
  else if (S.filter !== 'all') list = list.filter(b => b.folder === S.filter);
  const q = S.q.trim().toLowerCase();
  if (q) list = list.filter(b => (b.title + ' ' + b.url).toLowerCase().includes(q));
  return list;
}

const filterName = () => S.filter === 'all' ? 'All bookmarks' : S.filter === 'fav' ? 'Favorites' : S.filter === 'none' ? 'No folder' : fname(S.filter);

function libraryView() {
  const d = S.data;
  const chip = (id, label, count) => h('button', { class: 'chip' + (S.filter === id ? ' active' : ''), 'aria-pressed': String(S.filter === id), onClick: () => { S.filter = id; S.menu = null; render(); } }, label, h('span', { class: 'chip-n' }, count));
  const unf = d.bms.filter(b => !b.folder).length;
  const search = h('input', { id: 'bm-search', type: 'search', class: 'input', style: 'padding:0 36px', 'aria-label': 'Search bookmarks', placeholder: 'Search titles and addresses', value: S.q, autocomplete: 'off' });
  const clear = h('button', { class: 'icon-btn clear-q', 'aria-label': 'Clear search', hidden: !S.q, onClick: () => { S.q = ''; search.value = ''; clear.hidden = true; updateList(); search.focus(); } }, icon('x', 14));
  search.addEventListener('input', () => { S.q = search.value; clear.hidden = !S.q; S.menu = null; updateList(); });
  const listTitle = h('span'), listCount = h('span');
  const listHost = h('div', { class: 'list-scroll', onKeydown: onListKey });

  function updateList() {
    const list = filtered();
    listTitle.textContent = filterName();
    listCount.textContent = plural(list.length, 'bookmark', 'bookmarks');
    listHost.replaceChildren(...emptyStates(list), h('div', { role: 'list', 'aria-label': 'Bookmarks', class: 'col', style: 'gap:6px' }, list.map(rowView)));
  }
  updateList();

  return h('div', { class: 'col grow', style: 'min-height:0' },
    h('div', { class: 'row', style: 'padding:14px 16px 10px;gap:10px' },
      icon('logo', 26, 'logo'),
      h('h1', { class: 'h-sm grow' }, 'Private Bookmarks'),
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', title: 'Settings', onClick: () => go('settings') }, icon('settings')),
      h('button', { class: 'btn btn-secondary', style: 'height:32px;padding:0 12px;border-radius:8px;font-size:13px;gap:6px', onClick: () => vault.lock() }, icon('lock', 14), 'Lock')),
    h('div', { class: 'col', style: 'padding:0 16px;gap:10px' },
      h('div', { class: 'rel' }, h('span', { class: 'search-ic' }, icon('search', 16)), search, clear),
      h('div', { role: 'group', 'aria-label': 'Filter bookmarks', class: 'chips' },
        chip('all', 'All', d.bms.length), chip('fav', 'Favorites', d.bms.filter(b => b.fav).length),
        sortedFolders().map(f => chip(f.id, f.name, d.bms.filter(b => b.folder === f.id).length)),
        unf ? chip('none', 'No folder', unf) : null,
        h('button', { class: 'chip chip-add', onClick: () => go('folders') }, icon('plus', 13), 'Manage folders')),
      h('button', { class: 'btn btn-primary', onClick: saveCurrent }, icon('plus', 16), 'Save current page')),
    h('div', { class: 'list-head' }, listTitle, listCount),
    listHost,
    h('div', { class: 'foot' }, icon('monitor', 13), `Encrypted · stored on this computer only · ${plural(d.bms.length, 'bookmark', 'bookmarks')}`));
}

function emptyStates(list) {
  if (list.length) return [];
  const box = (title, text, extra) => h('div', { class: 'empty' }, title, h('p', null, text), extra);
  if (S.q.trim()) return [h('div', { class: 'empty solid', role: 'status' }, h('h2', { class: 'h-md' }, `No results for “${S.q.trim()}”`), h('p', null, 'Check the spelling or try part of the web address.'),
    h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { S.q = ''; render(); document.getElementById('bm-search')?.focus(); } }, 'Clear search'))];
  if (S.filter === 'all') return [box(h('div', { class: 'col', style: 'align-items:center;gap:10px' }, h('span', { class: 'empty-ic' }, icon('bookmark', 22)), h('h2', { class: 'h-md' }, 'Your vault is empty')), 'Open any page, then use the toolbar button or “Save current page” to add it here.')];
  if (S.filter === 'fav') return [box(h('h2', { class: 'h-md' }, 'No favorites yet'), 'Select the star on a bookmark to keep it here for quick access.')];
  return [box(h('h2', { class: 'h-md' }, `Nothing in ${filterName()} yet`), 'Save a page into this folder, or use ⋯ then “Move to folder” on any bookmark.')];
}

function rowView(b) {
  const dom = domainOf(b.url);
  const open = () => { closeMenu(); chrome.tabs.create({ url: b.url }); };
  const menuItem = (label, fn, cls = '') => h('button', { role: 'menuitem', class: 'menu-item ' + cls, onClick: fn }, label);
  let menu = null;
  if (S.menu === b.id && !S.menuMove) {
    menu = h('div', { role: 'menu', 'aria-label': 'Bookmark actions', class: 'menu' },
      menuItem('Open in new tab', open),
      menuItem('Edit', () => go('edit', { editId: b.id })),
      h('button', { role: 'menuitem', class: 'menu-item spread', onClick: () => { S.menuMove = true; render(); focusFirst(document.querySelector('.menu')); } }, 'Move to folder', h('span', { 'aria-hidden': 'true' }, '›')),
      menuItem(b.fav ? 'Remove from favorites' : 'Add to favorites', () => toggleFav(b)),
      h('div', { class: 'menu-sep' }),
      menuItem('Delete…', () => { S.menu = null; S.dlg = { type: 'bm', id: b.id }; render(); }, 'danger'));
  } else if (S.menu === b.id && S.menuMove) {
    menu = h('div', { role: 'menu', 'aria-label': 'Move to folder', class: 'menu', style: 'width:230px' },
      h('div', { class: 'menu-label' }, 'Move to'),
      [{ id: '', name: 'No folder' }].concat(sortedFolders()).map(t => {
        const cur = (b.folder || '') === t.id;
        return h('button', { role: 'menuitemradio', 'aria-checked': String(cur), class: 'menu-item spread', onClick: async () => {
          S.menu = null; S.menuMove = false;
          if (!cur) await save(d => { const x = d.bms.find(y => y.id === b.id); if (x) x.folder = t.id || null; }, 'Moved to ' + t.name);
          render();
        } }, t.name, h('span', { style: 'color:var(--blue);font-weight:600' }, cur ? '✓' : ''));
      }));
  }
  return h('div', { role: 'listitem', class: 'bm' + (S.menu === b.id ? ' raised' : '') },
    h('button', { 'data-row': '1', id: 'row-' + b.id, class: 'bm-open', 'aria-label': `${b.title}, ${dom}. Open in new tab`, title: b.url, onClick: open },
      tile(b.url, 32),
      h('span', { class: 'col', style: 'min-width:0;gap:2px' }, h('span', { class: 'bm-title ellipsis' }, b.title), h('span', { class: 'bm-sub ellipsis' }, `${dom} · ${fname(b.folder)}`))),
    h('button', { class: 'icon-btn star' + (b.fav ? ' on' : ''), id: 'fav-' + b.id, 'aria-pressed': String(!!b.fav), 'aria-label': (b.fav ? 'Remove ' : 'Add ') + b.title + (b.fav ? ' from favorites' : ' to favorites'), onClick: () => toggleFav(b) }, icon('star', 17)),
    h('button', { class: 'icon-btn', id: 'more-' + b.id, 'aria-haspopup': 'menu', 'aria-expanded': String(S.menu === b.id), 'aria-label': 'More actions for ' + b.title,
      onClick: () => { S.menu = S.menu === b.id ? null : b.id; S.menuMove = false; render(); if (S.menu) focusFirst(document.querySelector('.menu')); } }, icon('more')),
    menu);
}

async function toggleFav(b) {
  S.menu = null;
  await save(d => { const x = d.bms.find(y => y.id === b.id); if (x) x.fav = !x.fav; });
  render();
}

function closeMenu() {
  if (!S.menu) return;
  const id = S.menu;
  S.menu = null; S.menuMove = false;
  render();
  document.getElementById('more-' + id)?.focus();
}

function onListKey(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = Array.from(document.querySelectorAll('[data-row]'));
  const i = rows.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)].focus();
}

function saveCurrent() {
  // Saving needs the page's address, which the toolbar popup can read. Open it (Chrome 127+).
  if (chrome.action.openPopup) {
    chrome.action.openPopup().catch(() => toast('Click the Private Bookmarks button in the toolbar to save this page.'));
  } else {
    toast('Click the Private Bookmarks button in the toolbar to save this page.');
  }
}

// ----- Edit -----

function editView() {
  const b = S.data.bms.find(x => x.id === S.editId);
  if (!b) { S.view = 'library'; return libraryView(); }
  const title = h('input', { id: 'e-title', class: 'input', value: b.title, autofocus: true, maxlength: 300 });
  const url = h('input', { id: 'e-url', class: 'input', value: b.url, inputmode: 'url', spellcheck: 'false' });
  title.addEventListener('input', () => setError(title, ''));
  url.addEventListener('input', () => setError(url, ''));
  const folders = folderSelect({ id: 'e-folder', folders: sortedFolders(), selected: b.folder || '' });
  const cancel = () => go('library');
  const form = h('form', { class: 'col grow', style: 'min-height:0', novalidate: true },
    subHeader('Edit bookmark', cancel),
    h('div', { class: 'scroll col gap-16' },
      h('div', { class: 'field' }, h('label', { for: 'e-title', class: 'label' }, 'Title'), title),
      h('div', { class: 'field' }, h('label', { for: 'e-url', class: 'label' }, 'Web address'), url),
      folders.wrap,
      h('div', { class: 'small muted' }, `Added ${fmtDate(b.added)}`)),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', onClick: cancel }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save changes')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = title.value.trim(), u = url.value.trim();
    let bad = null;
    if (!t) { setError(title, 'Add a title so you can find this bookmark later.'); bad = bad || title; }
    if (!isWebUrl(u)) { setError(url, 'Enter a full address that starts with http:// or https://'); bad = bad || url; }
    if (bad) return bad.focus();
    const f = folders.resolve(S.data.folders);
    if (!f) return;
    const ok = await save(d => {
      if (f.newFolder) d.folders.push(f.newFolder);
      const x = d.bms.find(y => y.id === b.id);
      if (x) Object.assign(x, { title: t, url: u, folder: f.folderId });
    }, 'Changes saved');
    if (ok) go('library');
  });
  return form;
}

// ----- Folders -----

function foldersView() {
  const input = h('input', { id: 'f-new', class: 'input grow', placeholder: 'e.g. Recipes', maxlength: 60, autofocus: !S.renameId });
  input.addEventListener('input', () => setError(input, ''));
  const form = h('form', { novalidate: true },
    h('div', { class: 'field' },
      h('label', { for: 'f-new', class: 'label' }, 'New folder'),
      h('div', { class: 'row' }, input, h('button', { type: 'submit', class: 'btn btn-primary', style: 'padding:0 16px' }, 'Create'))));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) { setError(input, 'Enter a folder name.'); return input.focus(); }
    if (S.data.folders.some(f => f.name.toLowerCase() === v.toLowerCase())) { setError(input, 'A folder with this name already exists.'); return input.focus(); }
    if (await save(d => { d.folders.push({ id: vault.uid(), name: v }); }, `Folder “${v}” created`)) { render(); document.getElementById('f-new')?.focus(); }
  });

  const rows = sortedFolders().map(f => {
    const count = S.data.bms.filter(b => b.folder === f.id).length;
    if (S.renameId === f.id) {
      const ri = h('input', { class: 'input', style: 'height:34px;border-radius:8px', 'aria-label': 'Folder name', value: f.name, autofocus: true, maxlength: 60 });
      ri.addEventListener('input', () => setError(ri, ''));
      const rf = h('form', { class: 'grow field', novalidate: true },
        h('div', { class: 'row', style: 'gap:6px' }, ri,
          h('button', { type: 'submit', class: 'btn btn-primary', style: 'height:34px;padding:0 12px;border-radius:8px;font-size:13px' }, 'Save'),
          h('button', { type: 'button', class: 'btn btn-secondary', style: 'height:34px;padding:0 10px;border-radius:8px;font-size:13px', onClick: () => { S.renameId = null; render(); } }, 'Cancel')));
      rf.addEventListener('submit', async e => {
        e.preventDefault();
        const v = ri.value.trim();
        if (!v) { setError(ri, 'Folder name can’t be empty.'); return ri.focus(); }
        if (S.data.folders.some(x => x.id !== f.id && x.name.toLowerCase() === v.toLowerCase())) { setError(ri, 'A folder with this name already exists.'); return ri.focus(); }
        S.renameId = null;
        await save(d => { const x = d.folders.find(y => y.id === f.id); if (x) x.name = v; }, 'Folder renamed');
        render();
      });
      return h('div', { role: 'listitem', class: 'folder-row' }, icon('folder', 18, 'folder-ic'), rf);
    }
    return h('div', { role: 'listitem', class: 'folder-row' }, icon('folder', 18, 'folder-ic'),
      h('button', { class: 'folder-name ellipsis', onClick: () => go('library', { filter: f.id, q: '' }) }, f.name, h('span', { class: 'folder-n' }, count)),
      h('button', { class: 'btn btn-xs', style: 'background:transparent;color:var(--ink-2);font-weight:500', 'aria-label': 'Rename ' + f.name, onClick: () => { S.renameId = f.id; render(true); } }, 'Rename'),
      h('button', { class: 'btn btn-xs', style: 'background:transparent;color:var(--red);font-weight:500', 'aria-label': 'Delete ' + f.name, onClick: () => { S.dlg = { type: 'folder', id: f.id, mode: 'keep' }; render(); } }, 'Delete'));
  });

  return h('div', { class: 'col grow', style: 'min-height:0' },
    subHeader('Folders', () => go('library', { renameId: null })),
    h('div', { class: 'scroll col gap-14' }, form,
      rows.length ? h('div', { role: 'list', 'aria-label': 'Folders', class: 'col', style: 'gap:6px' }, rows) : h('p', { class: 'muted', style: 'margin:0;font-size:13.5px' }, 'No folders yet. Folders help you group bookmarks, like Travel or Money.'),
      h('div', { class: 'info' }, h('b', null, 'Deleting a folder'), ' asks what to do with its bookmarks. By default they are kept and moved to “No folder”. To move single bookmarks between folders, use ⋯ then “Move to folder”.')));
}

// ----- Settings -----

function settingsView() {
  const opts = [['1', '1 minute'], ['5', '5 minutes'], ['15', '15 minutes'], ['60', '1 hour'], ['0', 'When Chrome closes']];
  const lock = h('fieldset', { class: 'card', style: 'margin:0' },
    h('legend', { class: 'eyebrow', style: 'padding:0 6px' }, 'Auto-lock'),
    h('div', { class: 'card-sub', style: 'margin:0 0 8px' }, 'Lock the vault after this computer has been inactive for:'),
    h('div', { class: 'col' }, opts.map(([v, label]) => h('label', { class: 'radio' },
      h('input', { type: 'radio', name: 'autolock', value: v, checked: S.settings.autolock === v, onChange: async () => { await vault.setSettings({ autolock: v }); S.settings.autolock = v; toast('Auto-lock set to ' + label.toLowerCase()); } }), label))),
    h('div', { class: 'small muted', style: 'margin-top:6px' }, 'The vault also locks whenever Chrome closes or this computer’s screen locks.'));

  // Change password
  const pwBody = h('div', { hidden: true });
  const pwBtn = h('button', { class: 'btn btn-secondary btn-sm', 'aria-expanded': 'false' }, 'Change…');
  pwBtn.addEventListener('click', () => {
    pwBody.hidden = !pwBody.hidden;
    pwBtn.textContent = pwBody.hidden ? 'Change…' : 'Cancel';
    pwBtn.setAttribute('aria-expanded', String(!pwBody.hidden));
    pwBody.replaceChildren(pwBody.hidden ? '' : passwordForm(() => pwBtn.click()));
    if (!pwBody.hidden) document.getElementById('pw-cur')?.focus();
  });

  return h('div', { class: 'col grow', style: 'min-height:0' },
    subHeader('Settings'),
    h('div', { class: 'scroll col gap-14' },
      lock,
      h('div', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between;gap:10px' },
          h('div', null, h('div', { class: 'card-title' }, 'Password'), h('div', { class: 'card-sub' }, 'Change the password that opens your vault.')), pwBtn),
        pwBody),
      h('button', { class: 'card card-link', onClick: () => go('backup', { exp: 'idle', imp: null }) },
        h('span', null, h('span', { class: 'card-title', style: 'display:block' }, 'Backup and restore'), h('span', { class: 'card-sub', style: 'display:block' }, 'Export an encrypted file or import one.')),
        h('span', { 'aria-hidden': 'true', style: 'font-size:18px;color:var(--muted)' }, '›')),
      appCard('settings_card'),
      h('div', { class: 'card', style: 'border-color:#F0C9CC;background:#FFF8F8' },
        h('div', { class: 'card-title', style: 'color:var(--red-ink)' }, 'Delete vault'),
        h('div', { class: 'card-sub' }, 'Permanently erases every bookmark and folder from this browser. This can’t be undone unless you have a backup.'),
        h('button', { class: 'btn btn-danger-outline btn-sm', style: 'margin-top:10px;height:36px', onClick: () => { S.dlg = { type: 'vault' }; render(); } }, 'Delete vault…')),
      h('div', { class: 'small muted', style: 'text-align:center' }, `Private Bookmarks ${chrome.runtime.getManifest().version} · `, h('a', { href: siteUrl('settings_footer'), target: '_blank', rel: 'noopener' }, 'vaultforyou.app'))));
}

// Funnel: the VaultForYou iPhone app.
function appCard(content) {
  return h('div', { class: 'card app-card' },
    icon('logo', 30, 'logo'),
    h('div', null,
      h('div', { class: 'card-title' }, 'VaultForYou for iPhone'),
      h('div', { class: 'card-sub' }, 'Keep private photos, videos and documents in a vault that opens only with a pattern you draw. No account needed. Bookmarks in this extension stay on this computer and don’t sync to it.'),
      h('a', { href: siteUrl(content), target: '_blank', rel: 'noopener', style: 'display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:13px' }, icon('phone', 14), 'Get the app')));
}

function passwordForm(done) {
  const cur = h('input', { id: 'pw-cur', type: 'password', class: 'input', autocomplete: 'current-password' });
  const n1 = h('input', { id: 'pw-n1', type: 'password', class: 'input', autocomplete: 'new-password' });
  const n2 = h('input', { id: 'pw-n2', type: 'password', class: 'input', autocomplete: 'new-password' });
  [cur, n1, n2].forEach(i => i.addEventListener('input', () => setError(i, '')));
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Update password');
  const f = (id, label, input) => h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), input);
  const form = h('form', { class: 'col gap-12', style: 'margin-top:14px', novalidate: true },
    f('pw-cur', 'Current password', cur), f('pw-n1', 'New password', n1), f('pw-n2', 'Confirm new password', n2), submit);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit.disabled) return;
    let bad = null;
    if (n1.value.length < 8) { setError(n1, 'Use at least 8 characters.'); bad = n1; }
    else if (n1.value === cur.value) { setError(n1, 'Choose a password different from the current one.'); bad = n1; }
    if (n2.value !== n1.value) { setError(n2, 'Passwords don’t match.'); bad = bad || n2; }
    if (bad) return bad.focus();
    setBusy(submit, true, 'Updating…');
    const ok = await vault.changePassword(cur.value, n1.value);
    setBusy(submit, false, 'Update password');
    if (!ok) { setError(cur, 'That isn’t your current password.'); return cur.focus(); }
    toast('Password changed');
    done();
  });
  return form;
}

// ----- Backup -----

function backupView() {
  const total = S.data.bms.length;
  const expBtn = h('button', { class: 'btn btn-primary', style: 'margin-top:12px;padding:0 16px' }, icon('download', 16), S.exp === 'done' ? 'Export again' : 'Export encrypted backup');
  const expMsg = h('div');
  if (S.exp === 'done' && S.expName) expMsg.append(h('div', { class: 'ok', role: 'status', style: 'margin-top:12px' }, h('b', null, 'Backup saved. '), `${S.expName} · ${plural(S.expCount, 'bookmark', 'bookmarks')}. Keep it somewhere safe. Anyone with the file and password can open it.`));
  expBtn.addEventListener('click', async () => {
    setBusy(expBtn, true, 'Encrypting…');
    try {
      const { text, count } = await vault.exportBackup();
      const name = `private-bookmarks-${new Date().toISOString().slice(0, 10)}.pvb`;
      const href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
      const a = h('a', { href, download: name, hidden: true });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
      Object.assign(S, { exp: 'done', expName: name, expCount: count });
    } catch (e) {
      toast('Couldn’t export. Unlock the vault and try again.');
    }
    render();
  });

  // Import
  const imp = S.imp;
  const fileInput = h('input', { type: 'file', accept: '.pvb,application/json,application/octet-stream', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const text = file.size < 50 * 1024 * 1024 ? await file.text() : '';
    let valid = false;
    try { const j = JSON.parse(text); valid = j && j.format === 'vaultforyou.private-bookmarks.backup'; } catch (e) { valid = false; }
    S.imp = { name: file.name, text, valid, state: valid ? 'idle' : 'invalid' };
    render();
    document.getElementById('imp-pw')?.focus();
  });
  const impParts = [];
  if (imp && !imp.valid) impParts.push(h('div', { class: 'bad', role: 'alert', style: 'margin-top:10px' }, h('b', null, 'This isn’t a Private Bookmarks backup. '), 'Choose a .pvb file that was exported from this extension.'));
  if (imp && imp.valid && imp.state !== 'ok') {
    const pw = h('input', { id: 'imp-pw', type: 'password', class: 'input', autocomplete: 'off' });
    pw.addEventListener('input', () => setError(pw, ''));
    const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block', style: 'margin-top:12px' }, 'Import backup');
    const form = h('form', { style: 'margin-top:12px', novalidate: true }, h('div', { class: 'field' }, h('label', { for: 'imp-pw', class: 'label' }, 'Backup password'), pw), btn);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (btn.disabled) return;
      if (!pw.value) { setError(pw, 'Enter the password for this backup.'); return pw.focus(); }
      setBusy(btn, true, 'Decrypting…');
      try {
        const r = await vault.importBackup(imp.text, pw.value);
        S.imp = { ...imp, text: '', state: 'ok', result: r };
        S.data = await vault.load();
        toast(plural(r.added, 'bookmark', 'bookmarks') + ' imported');
        render();
      } catch (err) {
        setBusy(btn, false, 'Import backup');
        if (err.code === 'badpw') { setError(pw, 'That password doesn’t open this backup. It’s the password the vault had when the file was exported.'); pw.select(); pw.focus(); }
        else if (err.code === 'invalid') { S.imp = { ...imp, valid: false, state: 'invalid' }; render(); }
        else toast('Couldn’t import. Unlock the vault and try again.');
      }
    });
    impParts.push(form);
  }
  if (imp && imp.state === 'ok') {
    const r = imp.result;
    impParts.push(h('div', { class: 'ok', role: 'status', style: 'margin-top:12px' }, h('b', null, 'Backup imported. '),
      r.added ? `${plural(r.added, 'bookmark was', 'bookmarks were')} added.` : 'No new bookmarks were added.',
      r.skipped ? ` ${plural(r.skipped, 'bookmark was', 'bookmarks were')} already in your vault.` : ''));
  }

  return h('div', { class: 'col grow', style: 'min-height:0' },
    subHeader('Backup and restore', () => go('settings'), 'Back to settings'),
    h('div', { class: 'scroll col gap-14' },
      h('section', { class: 'card', 'aria-labelledby': 'exp-h' },
        h('h2', { id: 'exp-h', class: 'card-title', style: 'margin:0' }, 'Export encrypted backup'),
        h('div', { class: 'card-sub' }, `Saves all ${plural(total, 'bookmark', 'bookmarks')} and folders to one file. It opens with your vault password from the time you export.`),
        expBtn, expMsg),
      h('section', { class: 'card', 'aria-labelledby': 'imp-h' },
        h('h2', { id: 'imp-h', class: 'card-title', style: 'margin:0' }, 'Import backup'),
        h('div', { class: 'card-sub' }, 'Adds the bookmarks from a backup file to this vault. Existing bookmarks are kept.'),
        h('div', { class: 'file-pick' }, icon('file', 18),
          h('span', { class: 'grow ellipsis', style: `font-size:13.5px;color:${imp ? 'var(--ink)' : 'var(--muted)'}` }, imp ? imp.name : 'No file chosen'),
          h('button', { class: 'btn btn-secondary btn-xs', style: 'padding:0 12px', onClick: () => fileInput.click() }, 'Choose file…'), fileInput),
        impParts),
      h('section', { class: 'info', 'aria-labelledby': 'mv-h' },
        h('h2', { id: 'mv-h', class: 'card-title', style: 'margin:0' }, 'Move to another computer'),
        h('ol', { style: 'margin:8px 0 0;padding-left:20px;line-height:1.6' },
          h('li', null, 'Export an encrypted backup on this computer.'),
          h('li', null, 'Copy the file to the other computer with a USB drive, a file transfer, or by emailing it to yourself.'),
          h('li', null, 'Install Private Bookmarks there and create a vault.'),
          h('li', null, 'Open Settings, then Backup and restore, choose the file and enter its password.')),
        h('div', { style: 'margin-top:8px;font-size:12.5px;color:var(--ink-2)' }, 'Nothing is synced. The two computers stay separate after the import.'))));
}

// ----- Dialogs -----

function dialogView() {
  const dl = S.dlg;
  const close = () => { S.dlg = null; render(); };
  let box;
  if (dl.type === 'bm') {
    const b = S.data.bms.find(x => x.id === dl.id);
    if (!b) { S.dlg = null; return null; }
    box = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-t' },
      h('h2', { id: 'dlg-t', class: 'h-md' }, 'Delete this bookmark?'),
      h('p', null, `“${b.title}” will be removed from your vault.`),
      h('div', { class: 'dlg-actions' },
        h('button', { class: 'btn btn-secondary', autofocus: true, onClick: close }, 'Cancel'),
        h('button', { class: 'btn btn-danger', onClick: async () => { S.dlg = null; await save(d => { d.bms = d.bms.filter(x => x.id !== b.id); }, 'Bookmark deleted'); render(); } }, 'Delete')));
  } else if (dl.type === 'folder') {
    const f = S.data.folders.find(x => x.id === dl.id);
    if (!f) { S.dlg = null; return null; }
    const n = S.data.bms.filter(b => b.folder === f.id).length;
    const opt = (mode, title, sub, accent) => h('label', { class: 'opt' + (dl.mode === mode ? ' on' : ''), style: dl.mode === mode ? `border-color:${accent}` : '' },
      h('input', { type: 'radio', name: 'dmode', checked: dl.mode === mode, style: `accent-color:${accent}`, onChange: () => { dl.mode = mode; render(); } }),
      h('span', null, h('b', null, title), h('br'), h('span', { class: 'muted' }, sub)));
    box = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-f' },
      h('h2', { id: 'dlg-f', class: 'h-md' }, `Delete “${f.name}”?`),
      h('p', null, n ? `This folder has ${plural(n, 'bookmark', 'bookmarks')}. Choose what happens to them.` : 'This folder is empty.'),
      n ? h('fieldset', { class: 'col', style: 'margin:12px 0 0;padding:0;border:none;gap:8px' },
        h('legend', { class: 'sr-only' }, 'What happens to the bookmarks'),
        opt('keep', 'Keep the bookmarks', 'Move them to “No folder”.', 'var(--blue)'),
        opt('delete', 'Delete them too', 'The folder and its bookmarks are removed for good.', 'var(--red)')) : null,
      h('div', { class: 'dlg-actions' },
        h('button', { class: 'btn btn-secondary', autofocus: true, onClick: close }, 'Cancel'),
        h('button', { class: 'btn btn-danger', onClick: async () => {
          const del = dl.mode === 'delete' && n > 0;
          S.dlg = null;
          if (S.filter === f.id) S.filter = 'all';
          await save(d => {
            d.bms = del ? d.bms.filter(b => b.folder !== f.id) : d.bms.map(b => b.folder === f.id ? { ...b, folder: null } : b);
            d.folders = d.folders.filter(x => x.id !== f.id);
          }, del ? 'Folder and bookmarks deleted' : n ? 'Folder deleted. Bookmarks kept in No folder' : 'Folder deleted');
          render();
        } }, del0(dl, n))));
  } else if (dl.type === 'vault') {
    const input = h('input', { id: 'dv-t', class: 'input', autocomplete: 'off', autofocus: true, spellcheck: 'false' });
    const btn = h('button', { type: 'submit', class: 'btn btn-danger', disabled: true }, 'Delete vault');
    input.addEventListener('input', () => { btn.disabled = input.value !== 'DELETE'; });
    box = h('form', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-v', novalidate: true },
      h('h2', { id: 'dlg-v', class: 'h-md' }, 'Delete your vault?'),
      h('p', null, `This erases all ${plural(S.data.bms.length, 'bookmark', 'bookmarks')} and every folder from this browser. There is no way to get them back without a backup file.`),
      h('label', { for: 'dv-t', class: 'label', style: 'margin-top:14px' }, 'Type DELETE to confirm'), input,
      h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn btn-secondary', onClick: close }, 'Cancel'), btn));
    box.addEventListener('submit', async e => {
      e.preventDefault();
      if (input.value !== 'DELETE' || btn.disabled) return;
      setBusy(btn, true, 'Deleting…');
      await vault.erase();
      S.dlg = null;
      toast('Vault deleted');
      refresh();
    });
  }
  return h('div', { class: 'scrim', onClick: e => { if (e.target === e.currentTarget) close(); } }, box);
}
const del0 = (dl, n) => (dl.mode === 'delete' && n ? 'Delete folder and bookmarks' : 'Delete folder');

// ---------- Keyboard ----------

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (S.dlg) { S.dlg = null; render(); return; }
    if (S.menu) { closeMenu(); return; }
    if (S.status === 'unlocked' && S.view !== 'library') { go(S.view === 'backup' ? 'settings' : 'library'); return; }
  }
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName || '') && S.status === 'unlocked' && S.view === 'library' && !S.dlg) {
    const el = document.getElementById('bm-search');
    if (el) { e.preventDefault(); el.focus(); }
  }
  // Keep keyboard focus inside an open dialog.
  if (e.key === 'Tab' && S.dlg) {
    const els = Array.from(document.querySelectorAll('.dialog button:not(:disabled), .dialog input'));
    if (!els.length) return;
    const i = els.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); els[els.length - 1].focus(); }
    else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
  }
});

// ---------- Sync with the popup, other windows and auto-lock ----------

async function applyIntent(intent) {
  if (!intent || Date.now() - intent.t > 15000) return;
  await chrome.storage.session.remove('panelIntent');
  if (S.status !== 'unlocked') return;
  if (intent.view === 'edit' && intent.id && S.data.bms.some(b => b.id === intent.id)) go('edit', { editId: intent.id, dlg: null });
  else go('library', { dlg: null });
}

vault.onChange(async () => {
  const editing = S.view === 'edit' || S.renameId || S.dlg?.type === 'vault';
  const before = S.status;
  if (editing && before === 'unlocked' && (await vault.status()) === 'unlocked') {
    // Don't wipe a form the person is typing into; just pick up the new data quietly.
    S.data = await vault.load() || S.data;
    S.settings = await vault.getSettings();
    return;
  }
  await refresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.panelIntent?.newValue) applyIntent(changes.panelIntent.newValue);
});

(async () => {
  await refresh();
  const { panelIntent } = await chrome.storage.session.get('panelIntent');
  applyIntent(panelIntent);
})();

import { h, icon, tile, toast, setError, setBusy, isWebUrl, sameUrl, domainOf, fmtDate } from './dom.js';
import * as vault from './vault.js';
import { welcomeView, setupView, unlockView, focusFirst } from './auth-views.js';
import { folderSelect } from './folder-select.js';
import { siteUrl } from './config.js';

const app = document.getElementById('app');
const S = { status: 'none', view: 'save', data: null, tab: null, savedId: null, settings: null, setup: false };

const fname = id => (S.data?.folders.find(f => f.id === id) || {}).name || 'No folder';

/** Open the side panel (needs the click's user gesture, so call synchronously), then tell it where to go. */
function openPanel(view = 'library', id = null) {
  const p = S.tab?.windowId != null ? chrome.sidePanel.open({ windowId: S.tab.windowId }) : Promise.reject(new Error('no window'));
  chrome.storage.session.set({ panelIntent: { view, id, t: Date.now() } });
  p.then(() => window.close(), () => toast('Open the side panel from Chrome’s side panel menu.'));
}

function openApp(content) {
  chrome.tabs.create({ url: siteUrl(content) });
  window.close();
}

async function refresh() {
  S.status = await vault.status();
  S.settings = await vault.getSettings();
  S.data = S.status === 'unlocked' ? await vault.load() : null;
  if (S.status === 'unlocked' && !S.data) S.status = 'locked';
  render();
}

function render() {
  let view;
  document.body.classList.toggle('is-dark', S.status !== 'unlocked');
  if (S.status === 'none') {
    view = S.setup
      ? setupView({ onBack: () => { S.setup = false; render(); }, onCreated: () => { S.setup = false; S.view = 'save'; refresh(); } })
      : welcomeView({ onStart: () => { S.setup = true; render(); } });
  } else if (S.status === 'locked') {
    view = unlockView({ onUnlocked: () => { S.view = 'save'; refresh(); }, onErased: () => refresh() });
  } else {
    view = S.view === 'saved' ? savedView() : saveView();
  }
  app.replaceChildren(view);
  focusFirst(view);
}

function header(title) {
  return h('div', { class: 'row' },
    icon('logo', 22, 'logo'),
    h('h1', { class: 'h-sm grow' }, title),
    h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onClick: () => openPanel('library') }, 'Library'),
    h('button', { type: 'button', class: 'icon-btn', style: 'width:30px;height:30px', 'aria-label': 'Lock vault', title: 'Lock vault', onClick: async () => { await vault.lock(); } }, icon('lock', 16)));
}

function pageCard(title, url) {
  return h('div', { class: 'page-card' }, tile(url, 36),
    h('div', { style: 'min-width:0' }, h('div', { class: 'page-title' }, title), h('div', { class: 'ellipsis', style: 'font-size:12px;color:var(--muted);margin-top:2px' }, url)));
}

function saveView() {
  const tab = S.tab || {};
  const url = tab.url || '';
  const existing = url && S.data.bms.find(b => sameUrl(b.url, url));
  if (!isWebUrl(url)) {
    return h('div', { class: 'pop' }, header('Private Bookmarks'),
      h('div', { class: 'status-note' }, icon('alert', 18), h('div', null, h('b', null, 'This page can’t be saved'), h('br'), 'Private Bookmarks saves web pages whose address starts with http:// or https://.')),
      h('button', { class: 'btn btn-primary', autofocus: true, onClick: () => openPanel('library') }, 'Open library'));
  }
  if (existing) {
    return h('div', { class: 'pop' }, header('This page'), pageCard(existing.title, url),
      h('div', { class: 'status-note', role: 'status' }, icon('check', 18),
        h('div', null, h('b', null, 'Already saved'), h('br'), `In ${fname(existing.folder)} · added ${fmtDate(existing.added)}. Saving again isn’t needed.`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary grow', autofocus: true, onClick: () => openPanel('edit', existing.id) }, 'Edit bookmark'),
        h('button', { class: 'btn btn-secondary grow', onClick: () => openPanel('library') }, 'Open library')));
  }
  const title = h('input', { id: 'sv-title', class: 'input', value: (tab.title || domainOf(url)).trim(), autofocus: true, maxlength: 300 });
  title.addEventListener('input', () => setError(title, ''));
  const folders = folderSelect({ id: 'sv-folder', folders: S.data.folders, selected: S.settings.lastFolder });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Save bookmark');
  const form = h('form', { class: 'pop', novalidate: true }, header('Save this page'), pageCard(tab.title || url, url),
    h('div', { class: 'field' }, h('label', { for: 'sv-title', class: 'label' }, 'Title'), title),
    folders.wrap, submit);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit.disabled) return;
    const t = title.value.trim();
    if (!t) { setError(title, 'Add a title so you can find this later.'); return title.focus(); }
    const f = folders.resolve(S.data.folders);
    if (!f) return;
    setBusy(submit, true, 'Saving…');
    try {
      const id = vault.uid();
      S.data = await vault.mutate(d => {
        if (f.newFolder) d.folders.push(f.newFolder);
        d.bms.unshift({ id, title: t, url, folder: f.folderId, fav: false, added: Date.now() });
      });
      await vault.setSettings({ lastFolder: f.folderId || '' });
      S.savedId = id;
      S.view = 'saved';
      render();
    } catch (err) {
      setBusy(submit, false, 'Save bookmark');
      toast('Couldn’t save. Unlock the vault and try again.');
      refresh();
    }
  });
  return form;
}

function savedView() {
  const b = S.data.bms.find(x => x.id === S.savedId) || {};
  return h('div', { class: 'pop', style: 'padding-top:20px' },
    h('div', { class: 'row', role: 'status', style: 'gap:14px' },
      h('span', { class: 'saved-badge' }, icon('check', 22)),
      h('div', { style: 'min-width:0' }, h('div', { class: 'h-lg', style: 'font-size:26px' }, `Saved to ${fname(b.folder)}`), h('div', { class: 'ellipsis', style: 'font-size:13px;color:var(--muted);margin-top:3px' }, b.title))),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-secondary grow', autofocus: true, onClick: () => openPanel('edit', b.id) }, 'Edit'),
      h('button', { class: 'btn btn-primary grow', onClick: () => openPanel('library') }, 'View library')),
    !S.settings.inviteDismissed && inviteCard());
}

// Funnel: invite people who care about privacy to the VaultForYou iPhone app.
function inviteCard() {
  const card = h('aside', { class: 'invite', 'aria-label': 'VaultForYou app' },
    h('b', null, 'VaultForYou for iPhone'), h('br'),
    'A private vault for the photos, videos and documents you choose. It opens only with a pattern you draw. Your bookmarks stay on this computer and don’t sync to it.',
    h('div', { style: 'margin-top:6px' }, h('a', { href: siteUrl('popup_saved_invite'), onClick: e => { e.preventDefault(); openApp('popup_saved_invite'); } }, 'Learn about the app')),
    h('button', { class: 'icon-btn', 'aria-label': 'Dismiss invitation', onClick: async () => { card.remove(); await vault.setSettings({ inviteDismissed: true }); } }, icon('x', 14)));
  return card;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') window.close(); });

// Another page (side panel, auto-lock) changed the vault or lock state.
vault.onChange((changes, area) => {
  if ((area === 'session' && 'vaultKey' in changes) || vault.vaultRemoved(changes)) refresh();
});

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    S.tab = tab || null;
  } catch (e) { S.tab = null; }
  // A right-click save made while the vault was locked hands its page or link to us.
  const { pendingSave } = await chrome.storage.session.get('pendingSave');
  if (pendingSave && Date.now() - pendingSave.t < 120000) {
    S.tab = { ...(S.tab || {}), url: pendingSave.url, title: pendingSave.title };
    S.pending = true;
  }
  if (pendingSave) chrome.storage.session.remove('pendingSave');
  await refresh();
})();

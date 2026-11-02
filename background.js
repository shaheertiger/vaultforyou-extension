// Service worker: auto-lock, right-click saving and first-run onboarding.
import { UNINSTALL_URL } from './src/config.js';
import * as vault from './src/vault.js';

// ---------- Auto-lock ----------

async function autolockMinutes() {
  return Number((await vault.getSettings()).autolock ?? 5);
}

async function applyIdleInterval() {
  const m = await autolockMinutes();
  // chrome.idle needs at least 15 seconds. "When Chrome closes" (0) relies on
  // chrome.storage.session, which Chrome clears on exit.
  if (m > 0) chrome.idle.setDetectionInterval(Math.max(15, m * 60));
}

chrome.idle.onStateChanged.addListener(async state => {
  if (state === 'active') return;
  // The screen locking always locks the vault. Going idle locks it unless the
  // person chose "When Chrome closes".
  if (state === 'locked' || (await autolockMinutes()) > 0) await vault.lock();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applyIdleInterval();
});

// ---------- Right-click "Save to Private Bookmarks" ----------

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'save-page', title: 'Save page to Private Bookmarks', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'save-link', title: 'Save link to Private Bookmarks', contexts: ['link'] });
  });
}

const isWebUrl = u => { try { return /^https?:$/.test(new URL(u).protocol); } catch (e) { return false; } };

async function flash(tabId, text, title, color = '#17745A') {
  const opts = tabId != null ? { tabId } : {};
  await chrome.action.setBadgeBackgroundColor({ ...opts, color });
  await chrome.action.setBadgeText({ ...opts, text });
  await chrome.action.setTitle({ ...opts, title });
  setTimeout(() => {
    chrome.action.setBadgeText({ ...opts, text: '' });
    chrome.action.setTitle({ ...opts, title: 'Private Bookmarks' });
  }, 2500);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.menuItemId === 'save-link' ? info.linkUrl : (info.pageUrl || tab?.url);
  if (!url || !isWebUrl(url)) return flash(tab?.id, '!', 'Only http:// and https:// pages can be saved', '#C0262D');
  let title = info.menuItemId === 'save-link' ? (info.linkText || '').trim() : (tab?.title || '').trim();
  if (!title) { try { title = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { title = url; } }

  if ((await vault.status()) !== 'unlocked') {
    // Hand the page to the popup, which asks for the password first.
    await chrome.storage.session.set({ pendingSave: { url, title, t: Date.now() } });
    try { await chrome.action.openPopup(); }
    catch (e) { flash(tab?.id, '🔒', 'Unlock Private Bookmarks to save this page', '#2B3BFF'); }
    return;
  }
  try {
    const { lastFolder } = await vault.getSettings();
    let added = false;
    await vault.mutate(d => {
      if (d.bms.some(b => b.url === url)) return;
      const folder = d.folders.some(f => f.id === lastFolder) ? lastFolder : null;
      d.bms.unshift({ id: vault.uid(), title: title.slice(0, 300), url, folder, fav: false, added: Date.now() });
      added = true;
    });
    flash(tab?.id, '✓', added ? 'Saved to Private Bookmarks' : 'Already in Private Bookmarks');
  } catch (e) {
    flash(tab?.id, '!', 'Couldn’t save. Unlock Private Bookmarks and try again.', '#C0262D');
  }
});

// ---------- Install / startup ----------

chrome.runtime.onStartup.addListener(() => { applyIdleInterval(); createMenus(); });

chrome.runtime.onInstalled.addListener(({ reason }) => {
  applyIdleInterval();
  createMenus();
  // Keep the encrypted key out of reach of anything but extension pages.
  chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  chrome.runtime.setUninstallURL?.(UNINSTALL_URL);
});

// Clicking the toolbar icon opens the popup, not the side panel.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});

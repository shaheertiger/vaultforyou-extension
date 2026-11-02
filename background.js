// Service worker: auto-lock and first-run onboarding.
import { UNINSTALL_URL } from './src/config.js';

const lockVault = () => chrome.storage.session.remove('vaultKey');

async function autolockMinutes() {
  const { settings } = await chrome.storage.local.get('settings');
  return Number((settings && settings.autolock) ?? 5);
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
  if (state === 'locked' || (await autolockMinutes()) > 0) await lockVault();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applyIdleInterval();
});

chrome.runtime.onStartup.addListener(applyIdleInterval);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  applyIdleInterval();
  // Keep the encrypted key out of reach of anything but extension pages.
  chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  if (chrome.runtime.setUninstallURL) chrome.runtime.setUninstallURL(UNINSTALL_URL);
});

// Clicking the toolbar icon opens the popup, not the side panel.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});


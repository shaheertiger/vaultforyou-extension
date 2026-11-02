// Opening bookmarks, optionally in an incognito window so visits stay out of history.

export const canUseIncognito = () => new Promise(r => {
  try { chrome.extension.isAllowedIncognitoAccess(ok => r(!!ok)); } catch (e) { r(false); }
});

/** Returns 'ok' or 'needs-access' (incognito asked for but not allowed). */
export async function openUrl(url, { incognito = false } = {}) {
  if (!incognito) {
    await chrome.tabs.create({ url });
    return 'ok';
  }
  if (!(await canUseIncognito())) return 'needs-access';
  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const inc = wins.filter(w => w.incognito).sort((a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0))[0];
  if (inc) {
    await chrome.tabs.create({ windowId: inc.id, url });
    await chrome.windows.update(inc.id, { focused: true });
  } else {
    await chrome.windows.create({ url, incognito: true, focused: true });
  }
  return 'ok';
}

/** Opens this extension's page in chrome://extensions so the person can turn on "Allow in Incognito". */
export const openExtensionSettings = () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });

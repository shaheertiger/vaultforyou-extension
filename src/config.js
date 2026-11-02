// Funnel destinations. Every link out of the extension is tagged so the
// VaultForYou site can attribute installs that came from this extension.
// No analytics or tracking code runs inside the extension itself.
export const SITE = 'https://www.vaultforyou.app/';

export function siteUrl(content, path = '') {
  const u = new URL(path, SITE);
  u.searchParams.set('utm_source', 'chrome_extension');
  u.searchParams.set('utm_medium', 'extension');
  u.searchParams.set('utm_campaign', 'private_bookmarks');
  u.searchParams.set('utm_content', content);
  return u.toString();
}

export const UNINSTALL_URL = siteUrl('uninstall');

import { h, icon } from './dom.js';
import * as vault from './vault.js';
import { setupView, unlockView, focusFirst } from './auth-views.js';
import { siteUrl } from './config.js';

document.getElementById('app-cta').href = siteUrl('welcome_cta');
document.getElementById('site-link').href = siteUrl('welcome_footer');

// Show the person's real shortcut if they changed it.
chrome.commands?.getAll?.().then(cmds => {
  const c = cmds.find(x => x.name === '_execute_action');
  if (c && c.shortcut) document.getElementById('shortcut').textContent = c.shortcut;
}).catch(() => {});

const host = document.getElementById('setup-host');

function done() {
  return h('div', { class: 'w-done' },
    h('span', { class: 'lock-badge', style: 'color:#7EE2B8' }, icon('check', 22)),
    h('h2', { class: 'h-lg' }, 'Your vault is ready'),
    h('p', { style: 'margin:0;font-size:14px;line-height:1.55;color:var(--night-muted)' }, 'Pin Private Bookmarks to your toolbar, then open any page and click the button to save it.'),
    h('div', { class: 'note-dark' }, h('b', null, 'Tip: '), 'Export an encrypted backup from Settings once you’ve saved a few pages. There is no password reset.'));
}

async function render() {
  const status = await vault.status();
  let view;
  if (status === 'unlocked') view = done();
  else if (status === 'locked') view = unlockView({ onUnlocked: render, onErased: render });
  // The hero already explains the product, so go straight to creating the vault.
  else view = setupView({ onCreated: render });
  host.replaceChildren(view);
  focusFirst(view);
}

vault.onChange((changes, area) => { if (area === 'session' || vault.vaultRemoved(changes)) render(); });
render();

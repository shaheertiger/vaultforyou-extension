// Welcome, Create vault and Unlock screens. Used by the popup and the side panel.
import { h, icon, passwordField, setError, setBusy, toast } from './dom.js';
import * as vault from './vault.js';

const logo = size => icon('logo', size, 'logo light');

export function welcomeView({ onStart }) {
  return h('div', { class: 'dark col gap-16 pad-auth' },
    logo(46),
    h('div', null,
      h('h1', { class: 'h-xl' }, 'Private bookmarks, ', h('span', { class: 'it', style: 'color:var(--blue-light)' }, 'kept to yourself.')),
      h('p', { style: 'margin:10px 0 0;font-size:14px;line-height:1.5;color:var(--night-muted)' }, 'Save pages into a vault that opens with a password you choose.')),
    h('ul', { class: 'ticks' },
      ['Stored on this computer only', 'No account or sign-up', 'One password opens everything'].map(t => h('li', null, icon('check', 16), t))),
    h('button', { class: 'btn btn-primary btn-lg', autofocus: true, onClick: onStart }, 'Set up your vault')
  );
}

export function setupView({ onBack, onCreated }) {
  const pw = passwordField({ id: 's-pw', label: 'Password', autocomplete: 'new-password', describedBy: 's-pw-h' });
  const hint = h('div', { id: 's-pw-h', class: 'hint' }, 'At least 8 characters. A short phrase is easy to remember.');
  pw.wrap.append(hint);
  const pw2 = h('input', { id: 's-pw2', type: 'password', autocomplete: 'new-password', class: 'input input-dark' });
  // One show/hide toggle controls both fields, like the design.
  pw.wrap.querySelector('.eye').addEventListener('click', () => { pw2.type = pw.input.type; });
  const ack = h('input', { type: 'checkbox' });
  const ackWrap = h('span', null, 'I understand that a forgotten password can’t be recovered.');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Create vault');

  pw.input.addEventListener('input', () => { setError(pw.input, '', true); hint.hidden = false; });
  pw2.addEventListener('input', () => setError(pw2, '', true));
  ack.addEventListener('change', () => ackWrap.querySelector('.field-err')?.remove());

  const form = h('form', { class: 'dark col gap-14 pad-form', novalidate: true },
    h('div', { class: 'row', style: onBack ? 'gap:6px;margin-left:-8px' : 'gap:6px' },
      onBack && h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back', onClick: onBack }, icon('back')),
      h('h1', { class: 'h-lg' }, 'Create your vault')),
    pw.wrap,
    h('div', { class: 'field' }, h('label', { for: 's-pw2', class: 'label label-dark' }, 'Confirm password'), pw2),
    h('div', { class: 'note-dark col', style: 'gap:8px' },
      h('div', null, h('b', null, 'Where it lives. '), 'Bookmarks are encrypted and saved in this browser on this computer. Nothing is sent to a server, and you don’t need an account.'),
      h('div', null, h('b', null, 'If you forget the password. '), 'There is no reset and we can’t recover it. Keep an exported backup so you can restore on a new vault.')),
    h('label', { class: 'check', style: 'color:#D5DBE8' }, ack, ackWrap),
    submit);

  pw.input.autofocus = true;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit.disabled) return;
    const p = pw.input.value, p2 = pw2.value;
    let first = null;
    if (p.length < 8) { hint.hidden = true; setError(pw.input, 'Use at least 8 characters.', true); first = first || pw.input; }
    if (p2 !== p) { setError(pw2, 'Passwords don’t match.', true); first = first || pw2; }
    ackWrap.querySelector('.field-err')?.remove();
    if (!ack.checked) { ackWrap.append(h('span', { class: 'field-err dark', role: 'alert', style: 'display:block;margin-top:2px' }, 'Please confirm to continue.')); first = first || ack; }
    if (first) return first.focus();
    setBusy(submit, true, 'Creating vault…');
    try {
      await vault.createVault(p);
      toast('Vault created. It’s ready for your first bookmark');
      onCreated && onCreated();
    } catch (err) {
      setBusy(submit, false, 'Create vault');
      toast('Couldn’t create the vault. Please try again.');
    }
  });
  return form;
}

export function unlockView({ onUnlocked, onErased }) {
  const pw = passwordField({ id: 'u-pw', label: 'Password', autocomplete: 'current-password', describedBy: 'u-err' });
  pw.input.style.cssText = 'height:44px;font-size:15px';
  pw.input.autofocus = true;
  const err = h('div', { id: 'u-err', 'aria-live': 'polite' });
  pw.wrap.append(err);
  const showErr = msg => {
    err.replaceChildren(h('div', { role: 'alert', class: 'row', style: 'margin-top:8px;align-items:flex-start;font-size:13px;line-height:1.4;color:var(--night-err)' }, icon('alert', 16), msg));
    pw.input.classList.add('invalid');
    pw.input.setAttribute('aria-invalid', 'true');
  };
  pw.input.addEventListener('input', () => { err.replaceChildren(); pw.input.classList.remove('invalid'); pw.input.setAttribute('aria-invalid', 'false'); });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Unlock');

  const forgotBody = h('div', { class: 'note-dark', style: 'margin-top:10px', hidden: true });
  const renderForgot = asking => {
    forgotBody.replaceChildren(
      'There is no reset, and no account that could recover it. If you have a backup file, you can import it into a new vault. Otherwise you can erase this vault and start over.',
      asking
        ? h('div', { role: 'alert', style: 'margin-top:10px' }, h('b', null, 'Erase all bookmarks on this computer?'),
          h('div', { class: 'row', style: 'margin-top:8px' },
            h('button', { type: 'button', class: 'btn btn-sm', style: 'border-color:#3A4766;background:transparent;color:var(--night-text)', onClick: () => renderForgot(false) }, 'Cancel'),
            h('button', { type: 'button', class: 'btn btn-sm btn-danger', onClick: async () => { await vault.erase(); toast('Vault erased'); onErased && onErased(); } }, 'Erase vault')))
        : h('button', { type: 'button', class: 'btn btn-sm', style: 'display:flex;margin-top:10px;border-color:var(--night-err);background:transparent;color:var(--night-err)', onClick: () => renderForgot(true) }, 'Erase vault and start over…'));
  };
  renderForgot(false);
  const forgotBtn = h('button', { type: 'button', class: 'btn-link', 'aria-expanded': 'false' }, 'Forgot your password?');
  forgotBtn.addEventListener('click', () => {
    forgotBody.hidden = !forgotBody.hidden;
    forgotBtn.setAttribute('aria-expanded', String(!forgotBody.hidden));
    renderForgot(false);
  });

  const form = h('form', { class: 'dark col gap-16 pad-auth', novalidate: true },
    h('div', { class: 'row gap-12' },
      h('span', { class: 'lock-badge' }, icon('lock', 22)),
      h('div', null, h('h1', { class: 'h-lg', style: 'font-size:30px;line-height:1' }, 'Vault locked'), h('div', { style: 'margin-top:4px;font-size:13.5px;color:var(--night-muted)' }, 'Enter your password to open your bookmarks.'))),
    pw.wrap,
    submit,
    h('div', { style: 'border-top:1px solid #1E2944;padding-top:12px' }, forgotBtn, forgotBody));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit.disabled) return;
    if (!pw.input.value) { showErr('Enter your password to unlock.'); return pw.input.focus(); }
    setBusy(submit, true, 'Unlocking…');
    const ok = await vault.unlock(pw.input.value);
    if (ok) { onUnlocked && onUnlocked(); return; }
    setBusy(submit, false, 'Unlock');
    showErr('That password isn’t right. Check it and try again.');
    pw.input.select();
    pw.input.focus();
  });
  return form;
}

/** Focus the element marked autofocus after a view is inserted. */
export function focusFirst(root) {
  const el = root.querySelector('[autofocus]') || root.querySelector('input,button');
  if (el) requestAnimationFrame(() => el.focus());
}

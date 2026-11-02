// Tiny DOM helpers shared by every extension page.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'autofocus') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Static, trusted SVG markup only (never user data).
const ICONS = {
  logo: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M24 4.5A15.5 15.5 0 1 0 24 35.5A18 18 0 0 1 24 4.5Z" fill="var(--logo-moon,#0B1220)"/><path d="M24 14H31a3 3 0 0 1 3 3V28L29 23L27 25.5L24.5 22L21 27Z" fill="#2B3BFF"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.3-1"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>'
};

export function icon(name, size = 18, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name];
  const svg = t.content.firstChild;
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  if (cls) svg.setAttribute('class', cls);
  return svg;
}

export const spinner = () => h('span', { class: 'spinner', 'aria-hidden': 'true' });

const TILES = [['#E3E8FF', '#2B3BFF'], ['#E2F2EC', '#17745A'], ['#FBEBDD', '#8A430C'], ['#EDE7F8', '#5B3AA6'], ['#E0F0F7', '#17617F'], ['#F8E4E8', '#A3304A']];

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

export function tile(url, size = 32) {
  const d = domainOf(url) || '?';
  let n = 0;
  for (const c of d) n += c.charCodeAt(0);
  const [bg, fg] = TILES[n % TILES.length];
  return h('span', { class: 'tile', style: `width:${size}px;height:${size}px;background:${bg};color:${fg};font-size:${Math.round(size * 0.44)}px`, 'aria-hidden': 'true' }, d[0].toUpperCase());
}

export function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'today';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export const isWebUrl = url => {
  try { return /^https?:$/.test(new URL(url).protocol); } catch (e) { return false; }
};

/** Same page ignoring the #fragment and a trailing slash. */
export const sameUrl = (a, b) => {
  const n = u => { try { const x = new URL(u); x.hash = ''; return x.toString().replace(/\/$/, ''); } catch (e) { return u; } };
  return n(a) === n(b);
};

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Password input with a show/hide toggle. */
export function passwordField({ id, label, autocomplete, dark = true, describedBy, onInput }) {
  const input = h('input', { id, type: 'password', autocomplete, class: dark ? 'input input-dark with-btn' : 'input with-btn', 'aria-describedby': describedBy, onInput });
  const btn = h('button', { type: 'button', class: dark ? 'eye eye-dark' : 'eye', 'aria-label': 'Show password', 'aria-pressed': 'false' }, icon('eye'));
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
  });
  const wrap = h('div', { class: 'field' }, h('label', { for: id, class: dark ? 'label label-dark' : 'label' }, label), h('div', { class: 'rel' }, input, btn));
  return { wrap, input };
}

export function fieldError(text, dark) {
  return h('div', { class: dark ? 'field-err dark' : 'field-err', role: 'alert' }, text);
}

/** Show or clear an error under an input. */
export function setError(input, text, dark) {
  const host = input.closest('.field');
  host.querySelectorAll(':scope > .field-err').forEach(e => e.remove());
  input.setAttribute('aria-invalid', text ? 'true' : 'false');
  input.classList.toggle('invalid', !!text);
  if (text) host.append(fieldError(text, dark));
}

export function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.replaceChildren(...(busy ? [spinner(), label] : [label]));
}

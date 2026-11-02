import { h, icon, setError } from './dom.js';
import { uid } from './vault.js';

/** Folder picker with a "+ New folder…" option that reveals a name field. */
export function folderSelect({ id, folders, selected }) {
  const sel = h('select', { id, class: 'select' },
    h('option', { value: '' }, 'No folder'),
    folders.map(f => h('option', { value: f.id, selected: f.id === selected }, f.name)),
    h('option', { value: '__new' }, '+ New folder…'));
  if (!folders.some(f => f.id === selected)) sel.value = '';
  const name = h('input', { class: 'input', 'aria-label': 'New folder name', placeholder: 'New folder name', style: 'margin-top:8px', hidden: true, maxlength: 60 });
  const wrap = h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, 'Folder'), h('div', { class: 'select-wrap' }, sel, icon('chevron', 14)), name);
  sel.addEventListener('change', () => {
    name.hidden = sel.value !== '__new';
    setError(name, '');
    if (!name.hidden) name.focus();
  });
  name.addEventListener('input', () => setError(name, ''));
  return {
    wrap,
    /** Validates; returns false (and shows an error) or { folderId, newFolder }. */
    resolve(currentFolders) {
      if (sel.value !== '__new') return { folderId: sel.value || null, newFolder: null };
      const v = name.value.trim();
      if (!v) { setError(name, 'Enter a folder name.'); name.focus(); return false; }
      if (currentFolders.some(f => f.name.toLowerCase() === v.toLowerCase())) { setError(name, 'A folder with this name already exists.'); name.focus(); return false; }
      const nf = { id: uid(), name: v };
      return { folderId: nf.id, newFolder: nf };
    }
  };
}

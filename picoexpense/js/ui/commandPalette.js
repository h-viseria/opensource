import * as router from '../core/router.js';

const ACTIONS = [
  { id: 'add-expense', label: 'Add expense', href: '#/add?type=EXPENSE' },
  { id: 'add-income', label: 'Add income', href: '#/add?type=INCOME' },
  { id: 'transfer', label: 'Transfer', href: '#/add?type=TRANSFER' },
  { id: 'scan', label: 'Scan receipt', href: '#/ocr-review' },
  { id: 'search', label: 'Search', run: 'search' },
  { id: 'home', label: 'Dashboard', href: '#/home' },
  { id: 'accounts', label: 'Accounts', href: '#/accounts' },
  { id: 'budgets', label: 'Budgets', href: '#/budgets' },
  { id: 'reports', label: 'Reports', href: '#/reports' },
  { id: 'import', label: 'Import CSV', href: '#/import' },
  { id: 'export', label: 'Export', href: '#/backup' },
  { id: 'backup', label: 'Backup', href: '#/backup' },
  { id: 'guide', label: 'User guide', href: '#/guide' },
  { id: 'settings', label: 'Settings', href: '#/settings' },
];

export function openCommandPalette() {
  let existing = document.getElementById('cmd-palette');
  if (existing) {
    existing.remove();
  }
  const overlay = document.createElement('div');
  overlay.id = 'cmd-palette';
  overlay.className = 'cmd-overlay';
  overlay.innerHTML = `
    <div class="cmd-panel" role="dialog" aria-label="Command palette">
      <input class="input" id="cmd-input" placeholder="Type a command…" aria-label="Command" />
      <ul id="cmd-list" class="cmd-list"></ul>
    </div>`;
  document.body.appendChild(overlay);
  const input = /** @type {HTMLInputElement} */ (overlay.querySelector('#cmd-input'));
  const list = overlay.querySelector('#cmd-list');
  let items = ACTIONS;
  let idx = 0;

  const render = () => {
    const q = input.value.toLowerCase().trim();
    items = ACTIONS.filter((a) => a.label.toLowerCase().includes(q));
    idx = 0;
    list.innerHTML = items
      .map((a, i) => `<li class="${i === 0 ? 'is-active' : ''}" data-i="${i}">${a.label}</li>`)
      .join('');
  };
  const run = (item) => {
    overlay.remove();
    if (!item) return;
    if (item.run === 'search') {
      import('./layout.js').then((m) => m.openSearch());
      return;
    }
    if (item.href) router.navigate(item.href.replace('#', ''));
  };
  render();
  input.focus();
  input.addEventListener('input', render);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
    const li = e.target.closest('[data-i]');
    if (li) run(items[Number(li.getAttribute('data-i'))]);
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(items.length - 1, idx + 1);
      list.querySelectorAll('li').forEach((el, i) => el.classList.toggle('is-active', i === idx));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(0, idx - 1);
      list.querySelectorAll('li').forEach((el, i) => el.classList.toggle('is-active', i === idx));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      run(items[idx]);
    }
  });
}

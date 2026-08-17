import * as router from '../core/router.js';
import { openCommandPalette } from './commandPalette.js';
import { openSearch } from './layout.js';

export function bindShortcuts() {
  window.addEventListener('keydown', (e) => {
    const tag = (e.target instanceof HTMLElement ? e.target.tagName : '') || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (e.key === 'Escape') {
      document.getElementById('cmd-palette')?.remove();
      const s = document.getElementById('search-overlay');
      if (s) s.hidden = true;
      return;
    }
    if (typing) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      router.navigate('/add');
    }
    if (e.key === '/') {
      e.preventDefault();
      openSearch();
    }
  });
}

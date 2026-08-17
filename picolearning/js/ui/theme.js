/**
 * Theme application — light / dark / system.
 */

import { THEMES, SETTINGS_KEYS } from '../core/constants.js';
import { getSetting, setSetting } from '../services/settingsService.js';

/** @type {MediaQueryList|null} */
let mql = null;
/** @type {((e: MediaQueryListEvent) => void)|null} */
let mqlHandler = null;

/**
 * Resolve and apply a theme preference to <html data-theme>.
 * @param {string} [theme]
 */
export async function applyTheme(theme) {
  let pref = theme;
  if (pref == null) {
    pref = /** @type {string|undefined} */ (await getSetting(SETTINGS_KEYS.THEME));
  }
  const key = normalizeTheme(pref);
  const resolved = key === THEMES.SYSTEM ? resolveSystemTheme() : key;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.dataset.themePref = key;
  return { preference: key, resolved };
}

/**
 * Persist theme and apply.
 * @param {string} theme
 */
export async function setTheme(theme) {
  const key = normalizeTheme(theme);
  await setSetting(SETTINGS_KEYS.THEME, key);
  return applyTheme(key);
}

/**
 * Listen for OS theme changes when preference is system.
 * Call once at app boot (safe to call multiple times).
 */
export function bindSystemThemeListener() {
  if (typeof window.matchMedia !== 'function') return () => {};

  if (mql && mqlHandler) {
    mql.removeEventListener('change', mqlHandler);
  }

  mql = window.matchMedia('(prefers-color-scheme: dark)');
  mqlHandler = () => {
    const pref = document.documentElement.dataset.themePref || THEMES.SYSTEM;
    if (pref === THEMES.SYSTEM) {
      document.documentElement.setAttribute('data-theme', resolveSystemTheme());
    }
  };
  mql.addEventListener('change', mqlHandler);

  return () => {
    if (mql && mqlHandler) mql.removeEventListener('change', mqlHandler);
    mql = null;
    mqlHandler = null;
  };
}

/** @param {unknown} theme */
function normalizeTheme(theme) {
  const t = String(theme || THEMES.SYSTEM).toLowerCase();
  if (t === THEMES.LIGHT || t === THEMES.DARK || t === THEMES.SYSTEM) return t;
  return THEMES.SYSTEM;
}

function resolveSystemTheme() {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return THEMES.DARK;
  }
  return THEMES.LIGHT;
}

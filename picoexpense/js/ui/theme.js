import { SETTINGS_KEYS, THEMES } from '../core/constants.js';
import { getSetting, setSetting } from '../services/settingsService.js';
import { emit } from '../core/eventBus.js';
import { EVENTS } from '../core/constants.js';

export async function applyTheme(theme) {
  const mode = theme || (await getSetting(SETTINGS_KEYS.THEME)) || THEMES.SYSTEM;
  const dark =
    mode === THEMES.DARK ||
    (mode === THEMES.SYSTEM && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePref = mode;
  const large = await getSetting(SETTINGS_KEYS.LARGE_TEXT);
  const contrast = await getSetting(SETTINGS_KEYS.HIGH_CONTRAST);
  const motion = await getSetting(SETTINGS_KEYS.REDUCED_MOTION);
  document.documentElement.classList.toggle('is-large-text', Boolean(large));
  document.documentElement.classList.toggle('is-high-contrast', Boolean(contrast));
  document.documentElement.classList.toggle('is-reduced-motion', Boolean(motion));
  emit(EVENTS.THEME_CHANGED, mode);
}

export async function setTheme(theme) {
  await setSetting(SETTINGS_KEYS.THEME, theme);
  await applyTheme(theme);
}

export function bindSystemThemeListener() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
  });
}

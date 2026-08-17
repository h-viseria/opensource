/**
 * Settings — theme, hardware, AI models, storage, privacy, demo mode.
 */

import { SETTINGS_KEYS, THEMES } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { detectHardware } from '../../core/hardware.js';
import { modelManager } from '../../ai/modelManager.js';
import { getProfileLlm, listProfiles } from '../../data/modelRegistry.js';
import { getSetting, setSetting } from '../../services/settingsService.js';
import { estimateStorage, clearAllData, formatBytes } from '../../services/storageService.js';
import { applyTheme, setTheme } from '../theme.js';
import { confirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import { getOutlet } from './helpers.js';
import { PRIVACY_SHORT } from './privacy.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 */
export async function renderSettings(_ctx) {
  const outlet = getOutlet();
  outlet.innerHTML = `<div class="page"><p class="muted">Loading settings…</p></div>`;
  await paint(outlet);
}

/**
 * @param {HTMLElement} outlet
 */
async function paint(outlet) {
  const [theme, demoMode, activeProfile, hw, storage, installed] = await Promise.all([
    getSetting(SETTINGS_KEYS.THEME),
    getSetting(SETTINGS_KEYS.DEMO_MODE),
    modelManager.getActiveProfile(),
    detectHardware(),
    estimateStorage(),
    modelManager.getInstalled(),
  ]);

  const profiles = listProfiles();

  outlet.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Settings</h1>
          <p class="lede">Appearance, device capability, on-device models, and local storage.</p>
        </div>
      </div>

      <section class="panel">
        <h2>Theme</h2>
        <label class="field">
          <span class="field__label">Appearance</span>
          <select class="input" data-theme>
            <option value="${THEMES.SYSTEM}" ${theme === THEMES.SYSTEM || !theme ? 'selected' : ''}>System</option>
            <option value="${THEMES.LIGHT}" ${theme === THEMES.LIGHT ? 'selected' : ''}>Light</option>
            <option value="${THEMES.DARK}" ${theme === THEMES.DARK ? 'selected' : ''}>Dark</option>
          </select>
        </label>
      </section>

      <section class="panel">
        <h2>Device capability</h2>
        <dl class="stat-grid">
          <div><dt>Browser</dt><dd>${escapeHtml(hw.browser)}</dd></div>
          <div><dt>OS</dt><dd>${escapeHtml(hw.os)}</dd></div>
          <div><dt>WebGPU</dt><dd>${hw.webgpu ? 'Yes' : 'No'}</dd></div>
          <div><dt>Memory</dt><dd>${hw.deviceMemoryGB != null ? `${hw.deviceMemoryGB} GB` : '—'}</dd></div>
          <div><dt>CPU cores</dt><dd>${hw.cpuCores ?? '—'}</dd></div>
          <div><dt>Recommended</dt><dd>${escapeHtml(hw.recommendedProfile)}</dd></div>
        </dl>
        ${
          hw.warnings?.length
            ? `<ul class="muted">${hw.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
            : ''
        }
        <button type="button" class="btn btn--secondary btn--sm" data-action="redetect">Re-detect</button>
      </section>

      <section class="panel">
        <h2>AI models</h2>
        <p class="muted">Active profile: <strong>${escapeHtml(activeProfile)}</strong>. Downloads stay in browser storage. Requires WebGPU (Chrome/Edge recommended). Without a download, Ask/Quiz use DemoLLM.</p>
        <div data-model-progress class="import-progress" hidden>
          <p class="muted" data-model-msg></p>
          <div class="progress-bar"><div class="progress-bar__fill" data-model-fill style="width:0%"></div></div>
        </div>
        <ul class="card-list">
          ${profiles
            .map((p) => {
              const llm = getProfileLlm(p);
              const ready = installed.some((m) => m.profile === p && m.status === 'ready');
              return `
              <li class="list-card">
                <div>
                  <strong>${escapeHtml(p)}</strong>
                  ${p === hw.recommendedProfile ? ' <span class="badge badge--ok">Recommended</span>' : ''}
                  ${ready ? ' <span class="badge badge--ok">Installed</span>' : ''}
                  <p class="muted">${escapeHtml(llm?.modelId || '—')} · ~${llm?.approxDownloadMB ?? 0} MB</p>
                </div>
                <div class="stack" style="flex-direction:row;gap:0.35rem">
                  <button type="button" class="btn btn--primary btn--sm" data-download="${escapeHtml(p)}">Download</button>
                  <button type="button" class="btn btn--ghost btn--sm" data-activate="${escapeHtml(p)}">Set active</button>
                </div>
              </li>`;
            })
            .join('')}
        </ul>
      </section>

      <section class="panel">
        <h2>Storage</h2>
        <dl class="stat-grid">
          <div><dt>Documents</dt><dd>${storage.documents.count} · ${formatBytes(storage.documents.bytes)}</dd></div>
          <div><dt>Embeddings</dt><dd>${storage.embeddings.count} · ${formatBytes(storage.embeddings.bytes)}</dd></div>
          <div><dt>Generated</dt><dd>${storage.generated.count} · ${formatBytes(storage.generated.bytes)}</dd></div>
          <div><dt>Models meta</dt><dd>${storage.models.count} · ${formatBytes(storage.models.bytes)}</dd></div>
          <div><dt>Estimate total</dt><dd>${formatBytes(storage.totalBytes)}</dd></div>
          <div><dt>Browser usage</dt><dd>${formatBytes(storage.browser.usage)} / ${formatBytes(storage.browser.quota)}</dd></div>
        </dl>
        <button type="button" class="btn btn--danger btn--sm" data-action="clear">Clear all data</button>
      </section>

      <section class="panel">
        <h2>Demo mode</h2>
        <label class="field field--check">
          <input type="checkbox" data-demo ${demoMode ? 'checked' : ''} />
          Prefer demo / heuristic answers even when a model is installed
        </label>
      </section>

      <section class="panel">
        <h2>Privacy</h2>
        <p>${PRIVACY_SHORT}</p>
        <a class="btn btn--ghost btn--sm" href="#/privacy">Full privacy statement</a>
      </section>
    </div>
  `;

  /** @type {HTMLSelectElement|null} */
  const themeSelect = outlet.querySelector('[data-theme]');
  themeSelect?.addEventListener('change', async () => {
    await setTheme(themeSelect.value);
    showToast('Theme updated', 'success');
  });

  outlet.querySelector('[data-action="redetect"]')?.addEventListener('click', async () => {
    const info = await detectHardware();
    await setSetting(SETTINGS_KEYS.HARDWARE_SNAPSHOT, info);
    showToast(`Recommended: ${info.recommendedProfile}`, 'info');
    await paint(outlet);
  });

  outlet.querySelector('[data-demo]')?.addEventListener('change', async (e) => {
    const checked = /** @type {HTMLInputElement} */ (e.target).checked;
    await setSetting(SETTINGS_KEYS.DEMO_MODE, checked);
    showToast(checked ? 'Demo mode on' : 'Demo mode off', 'success');
  });

  outlet.querySelectorAll('[data-activate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const profile = btn.getAttribute('data-activate');
      if (!profile) return;
      await modelManager.setActiveProfile(profile);
      showToast(`Active profile: ${profile}`, 'success');
      await paint(outlet);
    });
  });

  outlet.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const profile = btn.getAttribute('data-download');
      if (!profile) return;
      const llm = getProfileLlm(profile);
      const size = llm?.approxDownloadMB ?? 0;
      const ok = await confirmModal({
        title: `Download ${profile}?`,
        bodyHtml: `<p>This downloads approximately <strong>${size} MB</strong> of model weights into browser storage. Processing stays on-device.</p>`,
        confirmLabel: 'Download',
      });
      if (!ok) return;

      const prog = outlet.querySelector('[data-model-progress]');
      const msg = outlet.querySelector('[data-model-msg]');
      const fill = /** @type {HTMLElement|null} */ (outlet.querySelector('[data-model-fill]'));
      if (prog) prog.hidden = false;

      try {
        await modelManager.downloadProfile(profile, {
          onProgress: (p) => {
            if (msg) msg.textContent = p.text || `${p.phase} ${Math.round((p.progress || 0) * 100)}%`;
            if (fill) fill.style.width = `${Math.round((p.progress || 0) * 100)}%`;
          },
        });
        showToast(`${profile} ready`, 'success');
        await paint(outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }
    });
  });

  outlet.querySelector('[data-action="clear"]')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Clear all data?',
      bodyHtml:
        '<p>This permanently deletes documents, embeddings, quizzes, progress, and model records on this device. Setup preferences can be kept.</p>',
      confirmLabel: 'Clear everything',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearAllData({ keepSetup: true });
      await applyTheme();
      showToast('Local data cleared', 'success');
      await paint(outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  });
}

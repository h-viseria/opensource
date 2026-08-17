/**
 * First-run onboarding — privacy, hardware, profile choice.
 */

import { AI_PROFILES, SETTINGS_KEYS } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { detectHardware } from '../../core/hardware.js';
import { modelManager } from '../../ai/modelManager.js';
import { getProfileLlm, listProfiles } from '../../data/modelRegistry.js';
import { setSetting } from '../../services/settingsService.js';
import { navigate } from '../../core/router.js';
import { confirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import { getOutlet } from './helpers.js';
import { privacyStatementHtml } from './privacy.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 */
export async function renderOnboarding(_ctx) {
  const outlet = getOutlet();
  outlet.innerHTML = `<div class="page"><p class="muted">Preparing setup…</p></div>`;

  const hw = await detectHardware();
  await setSetting(SETTINGS_KEYS.HARDWARE_SNAPSHOT, hw);
  const recommended = hw.recommendedProfile || AI_PROFILES.LITE;
  let selected = recommended;

  const paint = () => {
    outlet.innerHTML = `
      <div class="page onboarding">
        <p class="brand-mark">PicoLearning</p>
        <h1>Welcome — set up once</h1>
        <p class="lede">A private study workspace for your textbooks. Your learning data stays on this device.</p>

        <section class="panel">
          <h2>1. Privacy</h2>
          ${privacyStatementHtml()}
          <label class="field field--check">
            <input type="checkbox" data-privacy-ack />
            I understand that study data is stored locally in this browser
          </label>
        </section>

        <section class="panel">
          <h2>2. Device capability</h2>
          <dl class="stat-grid">
            <div><dt>WebGPU</dt><dd>${hw.webgpu ? 'Available' : 'Not available'}</dd></div>
            <div><dt>Memory</dt><dd>${hw.deviceMemoryGB != null ? `${hw.deviceMemoryGB} GB` : 'Unknown'}</dd></div>
            <div><dt>Recommended profile</dt><dd><strong>${escapeHtml(recommended)}</strong></dd></div>
          </dl>
          ${
            hw.warnings?.length
              ? `<ul class="muted">${hw.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
              : `<p class="muted">Looks good for on-device study${hw.webgpu ? ' and optional LLM download' : ''}.</p>`
          }
        </section>

        <section class="panel">
          <h2>3. Choose AI profile</h2>
          <p class="muted">You can download now or later from Settings. Heuristics work without a model.</p>
          <ul class="card-list">
            ${listProfiles()
              .map((p) => {
                const llm = getProfileLlm(p);
                return `
                <li class="list-card list-card--row">
                  <label class="field field--check" style="flex:1">
                    <input type="radio" name="profile" value="${escapeHtml(p)}" ${p === selected ? 'checked' : ''} data-profile />
                    <strong>${escapeHtml(p)}</strong>
                    ${p === recommended ? ' <span class="badge badge--ok">Recommended</span>' : ''}
                    <span class="muted"> — ${escapeHtml(llm?.sizeLabel || '')} · min ~${llm?.minRamGB ?? '?'} GB RAM</span>
                  </label>
                </li>`;
              })
              .join('')}
          </ul>
          <div data-dl-progress class="import-progress" hidden>
            <p class="muted" data-dl-msg></p>
            <div class="progress-bar"><div class="progress-bar__fill" data-dl-fill style="width:0%"></div></div>
          </div>
        </section>

        <div class="stack" style="flex-direction:row;flex-wrap:wrap;gap:0.5rem">
          <button type="button" class="btn btn--primary" data-action="finish-later">Continue without download</button>
          <button type="button" class="btn btn--secondary" data-action="download">Download selected profile</button>
        </div>
      </div>
    `;

    outlet.querySelectorAll('[data-profile]').forEach((el) => {
      el.addEventListener('change', () => {
        selected = /** @type {HTMLInputElement} */ (el).value;
      });
    });

    outlet.querySelector('[data-action="finish-later"]')?.addEventListener('click', () =>
      completeSetup(outlet, selected, false)
    );
    outlet.querySelector('[data-action="download"]')?.addEventListener('click', () =>
      completeSetup(outlet, selected, true)
    );
  };

  paint();
}

/**
 * @param {HTMLElement} outlet
 * @param {string} profile
 * @param {boolean} download
 */
async function completeSetup(outlet, profile, download) {
  const ack = /** @type {HTMLInputElement|null} */ (outlet.querySelector('[data-privacy-ack]'));
  if (!ack?.checked) {
    showToast('Please acknowledge the privacy statement', 'warn');
    return;
  }

  await setSetting(SETTINGS_KEYS.ACTIVE_PROFILE, profile);
  await modelManager.setActiveProfile(profile);

  if (download) {
    const llm = getProfileLlm(profile);
    const ok = await confirmModal({
      title: `Download ${profile}?`,
      bodyHtml: `<p>About <strong>${llm?.approxDownloadMB ?? 0} MB</strong> will be stored in this browser.</p>`,
      confirmLabel: 'Download',
    });
    if (!ok) return;

    const prog = outlet.querySelector('[data-dl-progress]');
    const msg = outlet.querySelector('[data-dl-msg]');
    const fill = /** @type {HTMLElement|null} */ (outlet.querySelector('[data-dl-fill]'));
    if (prog) prog.hidden = false;

    try {
      await modelManager.downloadProfile(profile, {
        onProgress: (p) => {
          if (msg) msg.textContent = p.text || '';
          if (fill) fill.style.width = `${Math.round((p.progress || 0) * 100)}%`;
        },
      });
      showToast('Model ready', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      // Still allow completing setup without model
    }
  }

  await setSetting(SETTINGS_KEYS.SETUP_COMPLETE, true);
  showToast('Setup complete', 'success');
  navigate('/home', { replace: true });
}

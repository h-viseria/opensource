/**
 * Floating PicoScan panel. Scan results go to OCR review — never auto-saved.
 */

import { getPicoScanWidgetUrl } from '../data/picoscanConfig.js';
import * as router from '../core/router.js';
import { showToast } from './toast.js';
import { onScanResult } from '../ocr/picoScanAdapter.js';

const HOST_ID = 'picoscan-fab-host';
const POS_KEY = 'picoexpense.picoscanFabPos';
const DRAFT_KEY = 'picoexpense.ocrDraft';
const DRAG_THRESHOLD = 6;

export function mountPicoScanFab() {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'picoscan-fab-host';
  host.innerHTML = `
    <div class="picoscan-panel" id="picoscan-panel" hidden>
      <div class="picoscan-panel__chrome">
        <div class="picoscan-panel__title">
          <span>PicoScan</span>
          <span class="picoscan-panel__hint">OCR · review before save</span>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-picoscan="close" aria-label="Close">✕</button>
      </div>
      <iframe class="picoscan-panel__frame" id="picoscan-frame" title="PicoScan" loading="lazy" referrerpolicy="same-origin"></iframe>
    </div>
    <button type="button" class="picoscan-fab" id="picoscan-fab" title="Open PicoScan OCR (drag to move)" aria-expanded="false">
      <span aria-hidden="true">◈</span>
      <span class="picoscan-fab__label">Scan</span>
    </button>
  `;
  document.body.appendChild(host);

  const panel = /** @type {HTMLElement} */ (host.querySelector('#picoscan-panel'));
  const fab = /** @type {HTMLButtonElement} */ (host.querySelector('#picoscan-fab'));
  const frame = /** @type {HTMLIFrameElement} */ (host.querySelector('#picoscan-frame'));
  let loaded = false;

  const open = () => {
    panel.hidden = false;
    fab.classList.add('is-open');
    fab.setAttribute('aria-expanded', 'true');
    if (!loaded) {
      frame.src = getPicoScanWidgetUrl();
      loaded = true;
    }
  };
  const close = () => {
    panel.hidden = true;
    fab.classList.remove('is-open');
    fab.setAttribute('aria-expanded', 'false');
  };
  const toggle = () => (panel.hidden ? open() : close());

  applySavedFabPosition(fab);
  enableFabDrag(fab, toggle);
  host.querySelector('[data-picoscan="close"]')?.addEventListener('click', close);

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'picoscan') return;
    if (data.type === 'picoscan:close') close();
    if (data.type === 'picoscan:result' && data.document) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data.document));
      } catch {
        /* ignore */
      }
      close();
      showToast('Review the extracted receipt before saving', 'info');
      router.navigate('/ocr-review');
    }
  });

  onScanResult((doc) => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
    } catch {
      /* ignore */
    }
  });

  window.addEventListener('resize', () => clampFabToViewport(fab));
}

export function readOcrDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearOcrDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function applySavedFabPosition(fab) {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw);
    if (typeof pos?.left !== 'number' || typeof pos?.top !== 'number') return;
    fab.classList.add('is-placed');
    fab.style.left = `${pos.left}px`;
    fab.style.top = `${pos.top}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    clampFabToViewport(fab);
  } catch {
    /* ignore */
  }
}

function saveFabPosition(fab) {
  const rect = fab.getBoundingClientRect();
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
  } catch {
    /* ignore */
  }
}

function clampFabToViewport(fab) {
  if (!fab.classList.contains('is-placed')) return;
  const rect = fab.getBoundingClientRect();
  const pad = 8;
  const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
  const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
  fab.style.left = `${Math.min(maxLeft, Math.max(pad, rect.left))}px`;
  fab.style.top = `${Math.min(maxTop, Math.max(pad, rect.top))}px`;
}

function enableFabDrag(fab, onClick) {
  let drag = null;
  fab.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    const rect = fab.getBoundingClientRect();
    fab.classList.add('is-placed', 'is-dragging');
    fab.style.left = `${rect.left}px`;
    fab.style.top = `${rect.top}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, dragged: false };
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.dragged = true;
    const pad = 8;
    fab.style.left = `${Math.min(window.innerWidth - fab.offsetWidth - pad, Math.max(pad, drag.origLeft + dx))}px`;
    fab.style.top = `${Math.min(window.innerHeight - fab.offsetHeight - pad, Math.max(pad, drag.origTop + dy))}px`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const wasDrag = drag.dragged;
    fab.classList.remove('is-dragging');
    try {
      fab.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (wasDrag) saveFabPosition(fab);
    else onClick();
    drag = null;
  };
  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);
  fab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

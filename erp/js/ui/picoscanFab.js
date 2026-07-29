/**
 * Floating PicoScan launcher — iframe panel (manual copy/paste into ERP).
 * FAB button is draggable so it can be moved if it blocks the UI.
 */

import { getPicoScanWidgetUrl } from '../data/picoscanConfig.js';

const HOST_ID = 'picoscan-fab-host';
const POS_KEY = 'picoerp.picoscanFabPos';
const DRAG_THRESHOLD = 6;

/**
 * Mount FAB + panel once on document.body (survives book remounts).
 */
export function mountPicoScanFab() {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'picoscan-fab-host';
  host.innerHTML = `
    <div class="picoscan-panel" id="picoscan-panel" hidden>
      <div class="picoscan-panel__chrome">
        <div class="picoscan-panel__title">
          <span aria-hidden="true">◈</span>
          <span>PicoScan</span>
          <span class="picoscan-panel__hint">OCR · copy into ERP</span>
        </div>
        <button type="button" class="btn btn--ghost btn--sm picoscan-panel__close" data-picoscan="close" title="Close">✕</button>
      </div>
      <iframe
        class="picoscan-panel__frame"
        id="picoscan-frame"
        title="PicoScan"
        loading="lazy"
        referrerpolicy="same-origin"
      ></iframe>
    </div>
    <button type="button" class="picoscan-fab" id="picoscan-fab" title="Open PicoScan OCR (drag to move)" aria-expanded="false">
      <span class="picoscan-fab__icon" aria-hidden="true">◈</span>
      <span class="picoscan-fab__label">PicoScan</span>
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

  const toggle = () => {
    if (panel.hidden) open();
    else close();
  };

  applySavedFabPosition(fab);
  enableFabDrag(fab, toggle);

  host.querySelector('[data-picoscan="close"]')?.addEventListener('click', close);

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'picoscan') return;
    if (data.type === 'picoscan:close') close();
  });

  window.addEventListener('resize', () => clampFabToViewport(fab));
}

/**
 * @param {HTMLElement} fab
 */
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

/**
 * @param {HTMLElement} fab
 */
function saveFabPosition(fab) {
  const rect = fab.getBoundingClientRect();
  try {
    localStorage.setItem(
      POS_KEY,
      JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) })
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} fab
 */
function clampFabToViewport(fab) {
  if (!fab.classList.contains('is-placed')) return;
  const rect = fab.getBoundingClientRect();
  const pad = 8;
  const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
  const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
  const left = Math.min(maxLeft, Math.max(pad, rect.left));
  const top = Math.min(maxTop, Math.max(pad, rect.top));
  fab.style.left = `${left}px`;
  fab.style.top = `${top}px`;
}

/**
 * Pointer drag on FAB; small moves still count as click (onClick).
 * @param {HTMLButtonElement} fab
 * @param {() => void} onClick
 */
function enableFabDrag(fab, onClick) {
  /** @type {{ pointerId: number, startX: number, startY: number, origLeft: number, origTop: number, dragged: boolean }|null} */
  let drag = null;

  fab.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    const rect = fab.getBoundingClientRect();
    // Switch from bottom/right defaults to explicit left/top for dragging
    fab.classList.add('is-placed', 'is-dragging');
    fab.style.left = `${rect.left}px`;
    fab.style.top = `${rect.top}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.setPointerCapture(e.pointerId);
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      dragged: false,
    };
  });

  fab.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.dragged = true;
    const pad = 8;
    const w = fab.offsetWidth;
    const h = fab.offsetHeight;
    const left = Math.min(
      window.innerWidth - w - pad,
      Math.max(pad, drag.origLeft + dx)
    );
    const top = Math.min(
      window.innerHeight - h - pad,
      Math.max(pad, drag.origTop + dy)
    );
    fab.style.left = `${left}px`;
    fab.style.top = `${top}px`;
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
    if (wasDrag) {
      saveFabPosition(fab);
    } else {
      onClick();
    }
    drag = null;
  };

  fab.addEventListener('pointerup', endDrag);
  fab.addEventListener('pointercancel', endDrag);

  // Prevent native click after drag (we handle click on pointerup)
  fab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

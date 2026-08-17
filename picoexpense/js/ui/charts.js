/**
 * Lightweight SVG charts. Click handlers via data-key on slices/bars.
 */

import { escapeHtml } from '../utils/html.js';
import { money } from '../utils/format.js';

const PALETTE = ['#1F7A6A', '#C44536', '#3D5A80', '#B08968', '#2A9D8F', '#E07A5F', '#457B9D', '#6B4C9A', '#2D6A4F', '#1D3557'];

/**
 * @param {{ key: string, label: string, value: number }[]} items
 * @param {string} currency
 */
export function donutHtml(items, currency) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const slices = items.map((item, i) => {
    const frac = item.value / total;
    const dash = frac * c;
    const color = PALETTE[i % PALETTE.length];
    const slice = `<circle class="chart-slice" data-key="${escapeHtml(item.key)}" cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)" role="img" aria-label="${escapeHtml(item.label)} ${money(item.value, currency)}"></circle>`;
    offset += dash;
    return slice;
  });
  const legend = items
    .map(
      (item, i) =>
        `<button type="button" class="chart-legend" data-key="${escapeHtml(item.key)}"><span class="swatch" style="background:${PALETTE[i % PALETTE.length]}"></span>${escapeHtml(item.label)} <strong>${money(item.value, currency)}</strong></button>`
    )
    .join('');
  return `<div class="chart chart--donut"><svg viewBox="0 0 100 100" aria-hidden="true">${slices.join('')}</svg><div class="chart-legend-list">${legend}</div></div>`;
}

/**
 * @param {{ label: string, a: number, b: number }[]} months
 * @param {string} currency
 * @param {string} aLabel
 * @param {string} bLabel
 */
export function groupedBarsHtml(months, currency, aLabel, bLabel) {
  const max = Math.max(1, ...months.flatMap((m) => [m.a, m.b]));
  const bars = months
    .map((m, i) => {
      const ha = Math.round((m.a / max) * 100);
      const hb = Math.round((m.b / max) * 100);
      return `<div class="bar-group" data-key="${escapeHtml(m.label)}">
        <div class="bars">
          <div class="bar bar--in" style="height:${ha}%" title="${escapeHtml(aLabel)} ${money(m.a, currency)}"></div>
          <div class="bar bar--out" style="height:${hb}%" title="${escapeHtml(bLabel)} ${money(m.b, currency)}"></div>
        </div>
        <span class="bar-label">${escapeHtml(m.label)}</span>
      </div>`;
    })
    .join('');
  return `<div class="chart chart--bars" role="img" aria-label="${escapeHtml(aLabel)} vs ${escapeHtml(bLabel)}">${bars}</div>`;
}

/**
 * @param {{ label: string, value: number, status?: string }[]} items
 * @param {string} currency
 */
export function budgetBarsHtml(items, currency) {
  return `<div class="budget-bars">${items
    .map((i) => {
      const pct = Math.min(100, Math.round((i.value || 0) * 100));
      return `<div class="budget-bar" data-status="${escapeHtml(i.status || 'NORMAL')}">
        <div class="budget-bar__meta"><span>${escapeHtml(i.label)}</span><span>${pct}%</span></div>
        <div class="budget-bar__track" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" role="progressbar">
          <div class="budget-bar__fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    })
    .join('')}</div>`;
}

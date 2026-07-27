/**
 * Shared report UI helpers - date filters, FY picker, and amount cells.
 */

import { escapeHtml } from './modal.js';
import { formatMoney } from '../utils/money.js';

/**
 * @param {{
 *   fromDate: string,
 *   toDate: string,
 *   showZero?: boolean,
 *   includeZero?: boolean,
 *   fyOptions?: { label: string, fromDate: string, toDate: string }[],
 *   selectedFyValue?: string,
 * }} opts
 */
export function rangeFilterHtml(opts) {
  const fyOptions = opts.fyOptions || [];
  const selectedFy = opts.selectedFyValue || '';

  const fyField =
    fyOptions.length > 0
      ? `<div class="field">
           <label class="field__label" for="r-fy">Financial year</label>
           <select class="select" id="r-fy" name="fy">
             <option value="" ${!selectedFy ? 'selected' : ''}>Custom dates</option>
             ${fyOptions
               .map((o) => {
                 const value = `${o.fromDate}|${o.toDate}`;
                 return `<option value="${escapeHtml(value)}" ${
                   value === selectedFy ? 'selected' : ''
                 }>${escapeHtml(o.label)}</option>`;
               })
               .join('')}
           </select>
         </div>`
      : '';

  return `
    <form class="toolbar filter-bar" id="report-filter">
      ${fyField}
      <div class="field">
        <label class="field__label" for="r-from">From</label>
        <input class="input" type="date" id="r-from" name="from" value="${escapeHtml(opts.fromDate || '')}" />
      </div>
      <div class="field">
        <label class="field__label" for="r-to">To</label>
        <input class="input" type="date" id="r-to" name="to" value="${escapeHtml(opts.toDate || '')}" />
      </div>
      ${
        opts.showZero
          ? `<div class="field">
               <label class="field__label" for="r-zero">Zeros</label>
               <select class="select" id="r-zero" name="zero">
                 <option value="0" ${!opts.includeZero ? 'selected' : ''}>Hide zero rows</option>
                 <option value="1" ${opts.includeZero ? 'selected' : ''}>Show all ledgers</option>
               </select>
             </div>`
          : ''
      }
      <div class="field field--action">
        <label class="field__label">&nbsp;</label>
        <button type="submit" class="btn btn--secondary">Apply</button>
      </div>
    </form>`;
}

/**
 * Bind filter form: FY selection updates From/To then applies; dates drive the report.
 * @param {HTMLElement} outlet
 * @param {string} basePath e.g. /reports/trial-balance
 * @param {{ extraParams?: () => Record<string, string> }} [opts]
 */
export function bindRangeFilter(outlet, basePath, opts = {}) {
  const form = /** @type {HTMLFormElement|null} */ (outlet.querySelector('#report-filter'));
  if (!form) return;

  const fromInput = /** @type {HTMLInputElement|null} */ (form.querySelector('#r-from'));
  const toInput = /** @type {HTMLInputElement|null} */ (form.querySelector('#r-to'));
  const fySelect = /** @type {HTMLSelectElement|null} */ (form.querySelector('#r-fy'));

  const applyHash = () => {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    const from = String(fd.get('from') || '');
    const to = String(fd.get('to') || '');
    const zero = String(fd.get('zero') || '');
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (zero === '1') params.set('zero', '1');
    if (opts.extraParams) {
      for (const [k, v] of Object.entries(opts.extraParams())) {
        if (v) params.set(k, v);
      }
    }
    const q = params.toString();
    location.hash = q ? `#${basePath}?${q}` : `#${basePath}`;
  };

  fySelect?.addEventListener('change', () => {
    const v = fySelect.value;
    if (!v) return;
    const [from, to] = v.split('|');
    if (fromInput) fromInput.value = from || '';
    if (toInput) toInput.value = to || '';
    applyHash();
  });

  // Manual date edits → Custom FY
  const markCustom = () => {
    if (fySelect && fySelect.value) {
      const current = `${fromInput?.value || ''}|${toInput?.value || ''}`;
      if (fySelect.value !== current) fySelect.value = '';
    }
  };
  fromInput?.addEventListener('change', markCustom);
  toInput?.addEventListener('change', markCustom);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    applyHash();
  });
}

/**
 * @param {number} n
 * @param {string} [currency]
 * @param {{ blankZero?: boolean }} [opts]
 */
export function amountCell(n, currency, opts = {}) {
  if (opts.blankZero && (!n || n === 0)) return '';
  return formatMoney(n, currency);
}

/**
 * Indent spacer for hierarchical report rows.
 * @param {number} depth
 */
export function treePad(depth) {
  const d = Math.max(0, Number(depth) || 0);
  return `<span class="tree-pad" style="padding-left:${d * 1.1}rem"></span>`;
}

/**
 * Render hierarchical amount rows (group / ledger / subtotal) for BS, P&L, Net Worth.
 * @param {any[]} rows
 * @param {string} currency
 * @param {{ fromDate?: string, toDate?: string, emptyText?: string }} [opts]
 */
export function hierarchyAmountRowsHtml(rows, currency, opts = {}) {
  if (!rows || rows.length === 0) {
    return `<tr><td class="muted" colspan="2">${escapeHtml(opts.emptyText || 'None')}</td></tr>`;
  }
  const from = opts.fromDate || '';
  const to = opts.toDate || '';
  return rows
    .map((r) => {
      const pad = treePad(r.depth || 0);
      if (r.kind === 'group') {
        return `<tr class="tree-row tree-row--group">
          <td>${pad}<strong>${escapeHtml(r.name)}</strong></td>
          <td class="num"></td>
        </tr>`;
      }
      if (r.kind === 'subtotal') {
        return `<tr class="tree-row tree-row--subtotal">
          <td>${pad}<span class="tree-subtotal-label">${escapeHtml(r.name)}</span></td>
          <td class="num mono">${formatMoney(r.amount || 0, currency)}</td>
        </tr>`;
      }
      const name = r.isPlug
        ? escapeHtml(r.name)
        : from && to
          ? `<a href="#/reports/ledger?ledgerId=${encodeURIComponent(r.ledgerId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}">${escapeHtml(r.name)}</a>`
          : r.ledgerId
            ? `<a href="#/reports/ledger?ledgerId=${encodeURIComponent(r.ledgerId)}">${escapeHtml(r.name)}</a>`
            : escapeHtml(r.name);
      return `<tr class="tree-row tree-row--ledger">
        <td>${pad}${name}</td>
        <td class="num mono">${formatMoney(r.amount || 0, currency)}</td>
      </tr>`;
    })
    .join('');
}

/**
 * @param {boolean} balanced
 * @param {string} [extra]
 */
export function balanceBadge(balanced, extra = '') {
  if (balanced) {
    return `<span class="badge badge--success">Balanced${extra ? ' - ' + escapeHtml(extra) : ''}</span>`;
  }
  return `<span class="badge badge--warning">Out of balance${extra ? ' - ' + escapeHtml(extra) : ''}</span>`;
}

/**
 * Parse from/to/zero from route query with defaults.
 * @param {Record<string, string>} query
 * @param {{ fromDate: string, toDate: string }} defaults
 */
export function parseRangeQuery(query, defaults) {
  return {
    fromDate: query.from || defaults.fromDate,
    toDate: query.to || defaults.toDate,
    includeZero: query.zero === '1',
  };
}

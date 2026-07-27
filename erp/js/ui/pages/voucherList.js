/**
 * Voucher list with type / date filters and pagination.
 */

import * as bookService from '../../services/bookService.js';
import * as voucherService from '../../services/voucherService.js';
import { CSV_LABELS, CSV_SAMPLES, importVouchers } from '../../services/csvBulkImport.js';
import { VOUCHER_TYPE_LIST } from '../../engine/accountingEngine.js';
import { escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';

const PAGE_SIZE = 100;

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderVoucherList(ctx, outlet) {
  const { book, financialYear } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const voucherType = ctx.query.type || '';
  const fromDate = ctx.query.from || '';
  const toDate = ctx.query.to || '';
  const page = Math.max(1, Number(ctx.query.page) || 1);

  const all = await voucherService.listVouchers(book.id, {
    voucherType: voucherType || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const vouchers = all.slice(start, start + PAGE_SIZE);

  const filterParams = () => {
    const params = new URLSearchParams();
    if (voucherType) params.set('type', voucherType);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    return params;
  };

  const pageHref = (p) => {
    const params = filterParams();
    if (p > 1) params.set('page', String(p));
    const q = params.toString();
    return q ? `#/transactions/list?${q}` : '#/transactions/list';
  };

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/transactions">Transactions</a> / All vouchers</p>
        <h1 class="page-header__title">Vouchers</h1>
        <p class="page-header__desc">
          ${total} voucher${total === 1 ? '' : 's'}
          ${total > PAGE_SIZE ? ` · showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)}` : ''}
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--primary" href="#/transactions/new/Journal">New journal</a>
      </div>
    </div>

    ${csvImportPanelHtml()}

    <form class="toolbar filter-bar" id="filter-form">
      <div class="field">
        <label class="field__label" for="f-type">Type</label>
        <select class="select" id="f-type" name="type">
          <option value="">All types</option>
          ${VOUCHER_TYPE_LIST.map(
            (t) =>
              `<option value="${escapeHtml(t)}" ${voucherType === t ? 'selected' : ''}>${escapeHtml(t)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="f-from">From</label>
        <input class="input" type="date" id="f-from" name="from" value="${escapeHtml(fromDate)}" />
      </div>
      <div class="field">
        <label class="field__label" for="f-to">To</label>
        <input class="input" type="date" id="f-to" name="to" value="${escapeHtml(toDate)}" />
      </div>
      <div class="field field--action">
        <label class="field__label">&nbsp;</label>
        <button type="submit" class="btn btn--secondary">Apply</button>
      </div>
    </form>

    <div class="panel" style="padding:0;overflow:hidden">
      ${
        vouchers.length === 0
          ? `<div class="empty-state"><p class="muted">No vouchers match these filters.</p></div>`
          : `<div class="table-wrap"><table class="data-table">
             <thead>
               <tr>
                 <th>Date</th>
                 <th>Type</th>
                 <th>Number</th>
                 <th>Narration</th>
                 <th class="num">Debit</th>
                 <th></th>
               </tr>
             </thead>
             <tbody>
               ${vouchers
                 .map(
                   (v) => `
                 <tr>
                   <td>${formatDisplayDate(v.date)}</td>
                   <td><span class="badge badge--muted">${escapeHtml(v.voucherType)}</span></td>
                   <td class="mono"><a href="#/transactions/${v.id}">${escapeHtml(v.voucherNumber)}</a></td>
                   <td class="truncate">${escapeHtml(v.narration || '—')}</td>
                   <td class="num mono">${formatMoney(v.debitTotal, book.currency)}</td>
                   <td><a class="btn btn--ghost btn--sm" href="#/transactions/${v.id}">Open</a></td>
                 </tr>`
                 )
                 .join('')}
             </tbody>
           </table></div>`
      }
    </div>

    ${
      totalPages > 1
        ? `<div class="pagination">
            <a class="btn btn--secondary btn--sm ${safePage <= 1 ? 'is-disabled' : ''}" href="${pageHref(safePage - 1)}" ${safePage <= 1 ? 'aria-disabled="true"' : ''}>Previous</a>
            <span class="muted" style="font-size:var(--text-sm)">Page ${safePage} of ${totalPages}</span>
            <a class="btn btn--secondary btn--sm ${safePage >= totalPages ? 'is-disabled' : ''}" href="${pageHref(safePage + 1)}" ${safePage >= totalPages ? 'aria-disabled="true"' : ''}>Next</a>
          </div>`
        : ''
    }
  `;

  outlet.querySelector('#filter-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(/** @type {HTMLFormElement} */ (e.target));
    const params = new URLSearchParams();
    const type = String(fd.get('type') || '');
    const from = String(fd.get('from') || '');
    const to = String(fd.get('to') || '');
    if (type) params.set('type', type);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const q = params.toString();
    location.hash = q ? `#/transactions/list?${q}` : '#/transactions/list';
  });

  wireCsvImport(outlet, {
    labels: CSV_LABELS.vouchers,
    sampleRows: CSV_SAMPLES.vouchers,
    fileName: 'vouchers_template.csv',
    onRows: (rows) => importVouchers(book.id, financialYear?.id, rows),
    onDone: async (result) => {
      if (result.created > 0) await renderVoucherList(ctx, outlet);
    },
  });
}

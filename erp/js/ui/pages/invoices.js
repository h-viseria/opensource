/**
 * Invoice list — Sales and Purchase invoices.
 */

import * as bookService from '../../services/bookService.js';
import * as invoiceService from '../../services/invoiceService.js';
import { escapeHtml, confirmModal } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import { showToast } from '../toast.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderInvoices(ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const typeFilter = ctx.query.type === 'Purchase' ? 'Purchase' : ctx.query.type === 'Sales' ? 'Sales' : '';
  const invoices = await invoiceService.listInvoices(book.id, {
    invoiceType: typeFilter || undefined,
  });
  const currency = book.currency || 'INR';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Invoices</h1>
        <p class="page-header__desc">
          Sales and purchase invoices for <strong>${escapeHtml(book.name)}</strong> —
          stock, tax, and receivables/payables in one posting.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/invoices/templates">Templates</a>
        <a class="btn btn--secondary" href="#/invoices/new/Purchase">New purchase</a>
        <a class="btn btn--primary" href="#/invoices/new/Sales">New sales</a>
      </div>
    </div>

    <div class="toolbar" style="margin-bottom:1rem">
      <a class="btn btn--sm ${!typeFilter ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices">All</a>
      <a class="btn btn--sm ${typeFilter === 'Sales' ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices?type=Sales">Sales</a>
      <a class="btn btn--sm ${typeFilter === 'Purchase' ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices?type=Purchase">Purchase</a>
    </div>

    ${
      invoices.length === 0
        ? `<div class="panel empty-state"><p class="muted">No invoices yet. Create a sales or purchase invoice to post stock and accounts together.</p></div>`
        : `<div class="panel" style="padding:0;overflow:hidden">
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Number</th>
                    <th>Type</th>
                    <th>Party</th>
                    <th class="num">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${invoices
                    .map(
                      (inv) => `
                    <tr>
                      <td>${formatDisplayDate(inv.date)}</td>
                      <td class="mono"><a href="#/invoices/${inv.id}">${escapeHtml(inv.invoiceNumber)}</a></td>
                      <td><span class="badge badge--muted">${escapeHtml(inv.invoiceType)}</span></td>
                      <td>${escapeHtml(inv.partyName)}</td>
                      <td class="num mono">${formatMoney(inv.grandTotal, currency)}</td>
                      <td class="row-actions">
                        <a class="btn btn--ghost btn--sm" href="#/invoices/${inv.id}">Open</a>
                        <button type="button" class="btn btn--ghost btn--sm" data-del="${inv.id}">Delete</button>
                      </td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>`
    }
  `;

  outlet.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del');
      if (!id) return;
      const inv = invoices.find((x) => x.id === id);
      const ok = await confirmModal({
        title: 'Delete invoice?',
        danger: true,
        confirmLabel: 'Delete',
        bodyHtml: `<p>Delete <strong>${escapeHtml(inv?.invoiceNumber || id)}</strong>? This reverses the linked stock movements and accounting vouchers.</p>`,
      });
      if (!ok) return;
      try {
        await invoiceService.deleteInvoice(id);
        showToast('Invoice deleted', 'success');
        await renderInvoices(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    });
  });
}

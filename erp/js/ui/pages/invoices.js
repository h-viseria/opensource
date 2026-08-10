/**
 * Invoice list — Sales, Purchase, Credit Notes, Debit Notes.
 */

import * as bookService from '../../services/bookService.js';
import * as invoiceService from '../../services/invoiceService.js';
import { INVOICE_STATUS } from '../../core/constants.js';
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

  const typeQ = String(ctx.query.type || '');
  const typeFilter = [
    'Sales',
    'Purchase',
    'Credit Note',
    'Debit Note',
  ].includes(typeQ)
    ? typeQ
    : '';
  const invoices = await invoiceService.listInvoices(book.id, {
    invoiceType: typeFilter || undefined,
  });
  const currency = book.currency || 'INR';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Invoices</h1>
        <p class="page-header__desc">
          Sales, purchase, credit notes, and debit notes for <strong>${escapeHtml(book.name)}</strong> —
          stock, tax, and receivables/payables in one posting.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/invoices/templates">Templates</a>
        <a class="btn btn--secondary" href="#/invoices/new/Purchase">New purchase</a>
        <a class="btn btn--primary" href="#/invoices/new/Sales">New sales</a>
      </div>
    </div>

    <div class="toolbar" style="margin-bottom:1rem;flex-wrap:wrap;gap:0.35rem">
      <a class="btn btn--sm ${!typeFilter ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices">All</a>
      <a class="btn btn--sm ${typeFilter === 'Sales' ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices?type=Sales">Sales</a>
      <a class="btn btn--sm ${typeFilter === 'Purchase' ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices?type=Purchase">Purchase</a>
      <a class="btn btn--sm ${typeFilter === 'Credit Note' ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices?type=${encodeURIComponent('Credit Note')}">Credit notes</a>
      <a class="btn btn--sm ${typeFilter === 'Debit Note' ? 'btn--secondary' : 'btn--ghost'}" href="#/invoices?type=${encodeURIComponent('Debit Note')}">Debit notes</a>
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
                    <th>Status</th>
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
                      <td>${statusBadge(inv.status)}</td>
                      <td>${escapeHtml(inv.partyName)}</td>
                      <td class="num mono">${formatMoney(inv.grandTotal, currency)}</td>
                      <td class="row-actions">
                        <a class="btn btn--ghost btn--sm" href="#/invoices/${inv.id}">Open</a>
                        ${
                          invoiceService.isSourceInvoice(inv) &&
                          inv.status !== INVOICE_STATUS.CANCELLED &&
                          invoiceService.getReturnableLines(inv).length
                            ? `<a class="btn btn--ghost btn--sm" href="#/invoices/${inv.id}/return">Return</a>`
                            : ''
                        }
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
      const delId = btn.getAttribute('data-del');
      if (!delId) return;
      const inv = invoices.find((x) => x.id === delId);
      const ok = await confirmModal({
        title: 'Delete invoice?',
        danger: true,
        confirmLabel: 'Delete',
        bodyHtml: `<p>Delete <strong>${escapeHtml(inv?.invoiceNumber || delId)}</strong>? This reverses the linked stock movements and accounting vouchers.</p>`,
      });
      if (!ok) return;
      try {
        await invoiceService.deleteInvoice(delId);
        showToast('Invoice deleted', 'success');
        await renderInvoices(ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    });
  });
}

/**
 * @param {string} [status]
 */
function statusBadge(status) {
  const s = status || INVOICE_STATUS.POSTED;
  if (s === INVOICE_STATUS.CANCELLED) {
    return `<span class="badge badge--danger">Cancelled</span>`;
  }
  if (s === INVOICE_STATUS.PARTIALLY_RETURNED) {
    return `<span class="badge badge--warning">Partial return</span>`;
  }
  return `<span class="badge badge--success">Posted</span>`;
}

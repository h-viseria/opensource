/**
 * Partial / full return (credit or debit note) against a Sales or Purchase invoice.
 */

import * as bookService from '../../services/bookService.js';
import * as invoiceService from '../../services/invoiceService.js';
import { INVOICE_STATUS } from '../../core/constants.js';
import { escapeHtml } from '../modal.js';
import { toDateInput, formatDisplayDate } from '../../utils/date.js';
import { formatMoney, roundMoney } from '../../utils/money.js';
import { roundQty } from '../../engine/inventoryEngine.js';
import { showToast } from '../toast.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderInvoiceReturn(ctx, outlet) {
  const id = ctx.params.id;
  const invoice = await invoiceService.getInvoice(id);
  if (!invoice) {
    outlet.innerHTML = `<p class="muted">Invoice not found. <a href="#/invoices">Back</a></p>`;
    return;
  }
  if (!invoiceService.isSourceInvoice(invoice)) {
    outlet.innerHTML = `<p class="muted">Returns are posted against Sales or Purchase invoices only.
      <a href="#/invoices/${escapeHtml(invoice.id)}">Back</a></p>`;
    return;
  }
  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    outlet.innerHTML = `<p class="muted">This invoice is cancelled — nothing left to return.
      <a href="#/invoices/${escapeHtml(invoice.id)}">Back</a></p>`;
    return;
  }

  const returnable = invoiceService.getReturnableLines(invoice);
  if (returnable.length === 0) {
    outlet.innerHTML = `<p class="muted">All quantities on this invoice have already been returned.
      <a href="#/invoices/${escapeHtml(invoice.id)}">Back</a></p>`;
    return;
  }

  const book = await bookService.getBook(invoice.bookId);
  const currency = book?.currency || 'INR';
  const noteLabel =
    invoice.invoiceType === invoiceService.INVOICE_TYPES.SALES ? 'Credit Note' : 'Debit Note';
  const nextNum = await invoiceService.nextInvoiceNumber(invoice.bookId, noteLabel);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/invoices">Invoices</a> /
          <a href="#/invoices/${escapeHtml(invoice.id)}">${escapeHtml(invoice.invoiceNumber)}</a> /
          Return</p>
        <h1 class="page-header__title">Return / reject items</h1>
        <p class="page-header__desc">
          Posts a <strong>${escapeHtml(noteLabel)}</strong> against
          ${escapeHtml(invoice.invoiceType)} ${escapeHtml(invoice.invoiceNumber)}
          (${escapeHtml(invoice.partyName)}, ${escapeHtml(formatDisplayDate(invoice.date))}).
          Enter quantity for each line — leave at 0 to skip.
        </p>
      </div>
    </div>

    <form id="return-form" class="panel">
      <div class="form-grid">
        <label class="field">
          <span class="field__label">${escapeHtml(noteLabel)} number</span>
          <input class="input" name="invoiceNumber" value="${escapeHtml(nextNum)}" required />
        </label>
        <label class="field">
          <span class="field__label">Date</span>
          <input class="input" type="date" name="date" value="${toDateInput(new Date())}" required />
        </label>
        <label class="field field--full">
          <span class="field__label">Reason / narration</span>
          <input class="input" name="reason" placeholder="e.g. Damaged goods, customer rejection, short delivery" />
        </label>
      </div>

      <div class="table-wrap" style="margin-top:1rem">
        <table class="data-table" id="return-lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th class="num">Invoiced</th>
              <th class="num">Already returned</th>
              <th class="num">Remaining</th>
              <th class="num">Rate</th>
              <th class="num">Return qty</th>
              <th class="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            ${returnable
              .map((l) => {
                const returned = Number(l.returnedQuantity) || 0;
                return `
              <tr data-line-no="${l.lineNo}" data-rate="${l.rate}" data-tax-rate="${l.taxRate || 0}" data-max="${l.returnableQuantity}">
                <td>${l.lineNo}</td>
                <td>${escapeHtml(l.itemName)}</td>
                <td class="num mono">${l.quantity}</td>
                <td class="num mono">${returned}</td>
                <td class="num mono">${l.returnableQuantity}</td>
                <td class="num mono">${formatMoney(l.rate, currency)}</td>
                <td class="num">
                  <input class="input num-input" data-qty type="number" min="0" max="${l.returnableQuantity}"
                    step="any" value="0" style="width:6rem" />
                </td>
                <td class="num mono" data-line-total>${formatMoney(0, currency)}</td>
              </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="toolbar" style="margin-top:1rem;justify-content:space-between;flex-wrap:wrap;gap:0.75rem">
        <div class="muted" id="return-totals">Selected total: ${formatMoney(0, currency)}</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button type="button" class="btn btn--ghost" id="btn-fill-all">Return all remaining</button>
          <a class="btn btn--secondary" href="#/invoices/${escapeHtml(invoice.id)}">Cancel</a>
          <button type="submit" class="btn btn--primary">Post ${escapeHtml(noteLabel)}</button>
        </div>
      </div>
    </form>
  `;

  const tbody = /** @type {HTMLTableSectionElement} */ (outlet.querySelector('#return-lines tbody'));
  const totalsEl = /** @type {HTMLElement} */ (outlet.querySelector('#return-totals'));

  const recalc = () => {
    let total = 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const qty = Number(/** @type {HTMLInputElement} */ (tr.querySelector('[data-qty]')).value) || 0;
      const rate = Number(tr.getAttribute('data-rate')) || 0;
      const taxRate = Number(tr.getAttribute('data-tax-rate')) || 0;
      const amount = roundMoney(qty * rate);
      const tax = taxRate ? roundMoney((amount * taxRate) / 100) : 0;
      const lineTotal = roundMoney(amount + tax);
      total = roundMoney(total + lineTotal);
      const cell = tr.querySelector('[data-line-total]');
      if (cell) cell.textContent = formatMoney(lineTotal, currency);
    });
    totalsEl.textContent = `Selected total: ${formatMoney(total, currency)}`;
  };

  tbody.addEventListener('input', recalc);

  outlet.querySelector('#btn-fill-all')?.addEventListener('click', () => {
    tbody.querySelectorAll('tr').forEach((tr) => {
      const max = tr.getAttribute('data-max') || '0';
      /** @type {HTMLInputElement} */ (tr.querySelector('[data-qty]')).value = max;
    });
    recalc();
  });

  outlet.querySelector('#return-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const fd = new FormData(form);
    /** @type {{ lineNo: number, quantity: number }[]} */
    const lines = [];
    for (const tr of tbody.querySelectorAll('tr')) {
      const lineNo = Number(tr.getAttribute('data-line-no'));
      const max = Number(tr.getAttribute('data-max')) || 0;
      const qty = roundQty(
        Number(/** @type {HTMLInputElement} */ (tr.querySelector('[data-qty]')).value) || 0
      );
      if (qty <= 0) continue;
      if (qty > max + 0.0001) {
        showToast(`Line ${lineNo}: quantity exceeds remaining ${max}`, 'error');
        return;
      }
      lines.push({ lineNo, quantity: qty });
    }

    if (lines.length === 0) {
      showToast('Enter a return quantity on at least one line', 'error');
      return;
    }

    try {
      const note = await invoiceService.createReturnNote({
        sourceInvoiceId: invoice.id,
        date: String(fd.get('date') || ''),
        invoiceNumber: String(fd.get('invoiceNumber') || ''),
        reason: String(fd.get('reason') || ''),
        lines,
      });
      showToast(`${note.invoiceType} ${note.invoiceNumber} posted`, 'success');
      router.navigate(`/invoices/${note.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Return failed', 'error');
    }
  });
}

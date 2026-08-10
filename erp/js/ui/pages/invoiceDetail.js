/**
 * Invoice detail — view, print PDF, fill Word/ODT template, return, cancel, delete.
 */

import * as bookService from '../../services/bookService.js';
import * as invoiceService from '../../services/invoiceService.js';
import * as invoiceTemplateService from '../../services/invoiceTemplateService.js';
import { INVOICE_STATUS } from '../../core/constants.js';
import { escapeHtml, confirmModal, formModal } from '../modal.js';
import { formatDisplayDate, toDateInput } from '../../utils/date.js';
import { formatMoney } from '../../utils/money.js';
import { showToast } from '../toast.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderInvoiceDetail(ctx, outlet) {
  const id = ctx.params.id;
  const invoice = await invoiceService.getInvoice(id);
  if (!invoice) {
    outlet.innerHTML = `<p class="muted">Invoice not found. <a href="#/invoices">Back</a></p>`;
    return;
  }

  const book = await bookService.getBook(invoice.bookId);
  const currency = book?.currency || 'INR';
  const templates = await invoiceTemplateService.listTemplates(invoice.bookId);
  const printBody = await invoiceService.buildInvoicePrintHtml(invoice, { book, currency });
  const isSource = invoiceService.isSourceInvoice(invoice);
  const isNote = invoiceService.isReturnNote(invoice);
  const returnable = isSource ? invoiceService.getReturnableLines(invoice) : [];
  const canReturn = isSource && invoice.status !== INVOICE_STATUS.CANCELLED && returnable.length > 0;
  const canCancel = canReturn;
  const statusBadge = statusBadgeHtml(invoice.status);

  /** @type {any[]} */
  let relatedNotes = [];
  if (isSource && (invoice.returnInvoiceIds || []).length) {
    const all = await Promise.all(
      invoice.returnInvoiceIds.map((rid) => invoiceService.getInvoice(rid))
    );
    relatedNotes = all.filter(Boolean);
  }

  let sourceInvoice = null;
  if (isNote && invoice.sourceInvoiceId) {
    sourceInvoice = await invoiceService.getInvoice(invoice.sourceInvoiceId);
  }

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/invoices">Invoices</a> / ${escapeHtml(invoice.invoiceNumber)}</p>
        <h1 class="page-header__title">${escapeHtml(invoice.invoiceType)}${
          isNote ? '' : ' invoice'
        } ${statusBadge}</h1>
        <p class="page-header__desc">
          ${escapeHtml(formatDisplayDate(invoice.date))} · ${escapeHtml(invoice.partyName)} ·
          ${formatMoney(invoice.grandTotal, currency)}
          ${
            sourceInvoice
              ? ` · against <a href="#/invoices/${sourceInvoice.id}">${escapeHtml(sourceInvoice.invoiceNumber)}</a>`
              : ''
          }
        </p>
      </div>
      <div class="page-header__actions">
        ${
          canReturn
            ? `<a class="btn btn--secondary" href="#/invoices/${escapeHtml(invoice.id)}/return">Return / reject</a>`
            : ''
        }
        ${canCancel ? `<button type="button" class="btn btn--secondary" id="btn-cancel">Cancel invoice</button>` : ''}
        <button type="button" class="btn btn--secondary" id="btn-pdf">PDF preview</button>
        <button type="button" class="btn btn--secondary" id="btn-template" ${templates.length ? '' : 'disabled'} title="${
          templates.length ? 'Fill Word/ODT template' : 'Upload a template first'
        }">Download template</button>
        <button type="button" class="btn btn--ghost" id="btn-delete">Delete</button>
      </div>
    </div>

    <div class="stat-grid" style="margin-bottom:1rem">
      <div class="stat-tile">
        <div class="stat-tile__label">Subtotal</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(invoice.subtotal, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Tax</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(invoice.taxTotal, currency)}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Grand total</div>
        <div class="stat-tile__value" style="font-size:var(--text-lg)">${formatMoney(invoice.grandTotal, currency)}</div>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Details</h2>
      <table style="font-size:var(--text-sm);margin-bottom:1rem">
        <tbody>
          <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0;width:9rem">Status</td><td>${statusBadge}</td></tr>
          <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Warehouse</td><td>${escapeHtml(invoice.warehouseName || '—')}</td></tr>
          <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Voucher</td><td>${
            invoice.voucherId
              ? `<a class="mono" href="#/transactions/${invoice.voucherId}">Open accounting voucher</a>`
              : '—'
          }</td></tr>
          <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Narration</td><td>${escapeHtml(invoice.narration || '—')}</td></tr>
          ${
            invoice.cancelReason
              ? `<tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Cancel reason</td><td>${escapeHtml(invoice.cancelReason)}</td></tr>`
              : ''
          }
        </tbody>
      </table>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th><th>Item</th><th class="num">Qty</th>
              ${isSource ? '<th class="num">Returned</th>' : ''}
              <th class="num">Rate</th>
              <th class="num">Amount</th><th class="num">Tax</th><th class="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            ${(invoice.lines || [])
              .map(
                (l) => `
              <tr>
                <td>${l.lineNo}</td>
                <td>${escapeHtml(l.itemName)}</td>
                <td class="num mono">${l.quantity}</td>
                ${
                  isSource
                    ? `<td class="num mono">${Number(l.returnedQuantity) || 0}</td>`
                    : ''
                }
                <td class="num mono">${formatMoney(l.rate, currency)}</td>
                <td class="num mono">${formatMoney(l.amount, currency)}</td>
                <td class="num mono">${l.taxRate ? `${l.taxRate}% / ${formatMoney(l.taxAmount, currency)}` : '—'}</td>
                <td class="num mono">${formatMoney(l.lineTotal, currency)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${
      relatedNotes.length
        ? `<div class="panel" style="margin-top:1rem">
             <h2 class="panel__title">Returns / notes</h2>
             <div class="table-wrap">
               <table class="data-table">
                 <thead>
                   <tr><th>Date</th><th>Number</th><th>Type</th><th class="num">Total</th></tr>
                 </thead>
                 <tbody>
                   ${relatedNotes
                     .map(
                       (n) => `
                     <tr>
                       <td>${formatDisplayDate(n.date)}</td>
                       <td class="mono"><a href="#/invoices/${n.id}">${escapeHtml(n.invoiceNumber)}</a></td>
                       <td><span class="badge badge--muted">${escapeHtml(n.invoiceType)}</span></td>
                       <td class="num mono">${formatMoney(n.grandTotal, currency)}</td>
                     </tr>`
                     )
                     .join('')}
                 </tbody>
               </table>
             </div>
           </div>`
        : ''
    }

    ${
      templates.length
        ? `<div class="panel" style="margin-top:1rem">
             <h2 class="panel__title">Template download</h2>
             <p class="panel__desc">Choose a Word (.docx) or OpenDocument (.odt) template to fill.</p>
             <div class="form-grid">
               <label class="field" style="grid-column: span 2">
                 <span class="field__label">Template</span>
                 <select class="select" id="template-pick">
                   ${templates
                     .map(
                       (t) =>
                         `<option value="${t.id}">${escapeHtml(t.name)} (${escapeHtml(t.format)})${
                           t.isDefault ? ' · default' : ''
                         }</option>`
                     )
                     .join('')}
                 </select>
               </label>
             </div>
           </div>`
        : `<div class="panel" style="margin-top:1rem"><p class="muted">No templates yet. <a href="#/invoices/templates">Upload an invoice template</a> to generate Word/ODT files.</p></div>`
    }

    <div id="invoice-print-source" hidden>${printBody}</div>
  `;

  outlet.querySelector('#btn-pdf')?.addEventListener('click', () => {
    openInvoicePrintPreview(invoice, printBody);
  });

  outlet.querySelector('#btn-template')?.addEventListener('click', async () => {
    const pick = /** @type {HTMLSelectElement|null} */ (outlet.querySelector('#template-pick'));
    const templateId = pick?.value || templates[0]?.id;
    try {
      const file = await invoiceService.generateInvoiceFromTemplate(invoice.id, templateId);
      invoiceTemplateService.downloadFilledTemplate(file);
      showToast('Template downloaded', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Template fill failed', 'error');
    }
  });

  outlet.querySelector('#btn-cancel')?.addEventListener('click', async () => {
    const fields = await formModal({
      title: 'Cancel invoice?',
      confirmLabel: 'Cancel invoice',
      fieldsHtml: `
        <p style="margin:0 0 1rem">This posts a full ${
          invoice.invoiceType === 'Sales' ? 'credit note' : 'debit note'
        } for all remaining quantities on <strong>${escapeHtml(invoice.invoiceNumber)}</strong>,
        reversing stock, tax, and receivables/payables.</p>
        <label class="field">
          <span class="field__label">Date</span>
          <input class="input" name="date" type="date" value="${toDateInput(new Date())}" required />
        </label>
        <label class="field">
          <span class="field__label">Reason</span>
          <input class="input" name="reason" placeholder="Optional cancellation reason" />
        </label>
      `,
    });
    if (!fields) return;
    try {
      const result = await invoiceService.cancelInvoice(invoice.id, {
        date: String(fields.get('date') || ''),
        reason: String(fields.get('reason') || ''),
      });
      showToast(
        `Invoice cancelled — ${result.returnNote.invoiceType} ${result.returnNote.invoiceNumber} posted`,
        'success'
      );
      await renderInvoiceDetail(ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cancel failed', 'error');
    }
  });

  outlet.querySelector('#btn-delete')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Delete invoice?',
      danger: true,
      confirmLabel: 'Delete',
      bodyHtml: isNote
        ? `<p>Delete <strong>${escapeHtml(invoice.invoiceNumber)}</strong>? This reverses the note’s stock and vouchers and restores returnable qty on the source invoice.</p>`
        : `<p>Delete <strong>${escapeHtml(invoice.invoiceNumber)}</strong> and reverse stock + vouchers?
             Prefer <strong>Cancel invoice</strong> if you need an audit trail via a credit/debit note.</p>`,
    });
    if (!ok) return;
    try {
      await invoiceService.deleteInvoice(invoice.id);
      showToast('Invoice deleted', 'success');
      router.navigate('/invoices');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  });
}

/**
 * @param {string} [status]
 */
function statusBadgeHtml(status) {
  const s = status || INVOICE_STATUS.POSTED;
  if (s === INVOICE_STATUS.CANCELLED) {
    return `<span class="badge badge--danger">Cancelled</span>`;
  }
  if (s === INVOICE_STATUS.PARTIALLY_RETURNED) {
    return `<span class="badge badge--warning">Partially returned</span>`;
  }
  return `<span class="badge badge--success">Posted</span>`;
}

/**
 * @param {any} invoice
 * @param {string} bodyHtml
 */
function openInvoicePrintPreview(invoice, bodyHtml) {
  document.getElementById('report-print-overlay')?.remove();
  document.body.classList.remove('has-report-print-preview');

  const overlay = document.createElement('div');
  overlay.id = 'report-print-overlay';
  overlay.className = 'report-print-overlay';
  overlay.innerHTML = `
    <div class="report-print-chrome">
      <div class="report-print-chrome__copy">
        <strong>Invoice preview</strong>
        <span>Click Print / Save as PDF, then choose “Save as PDF”.</span>
      </div>
      <div class="report-print-chrome__actions">
        <button type="button" class="btn btn--ghost" data-print-close>Close</button>
        <button type="button" class="btn btn--primary" data-print-go>Print / Save as PDF</button>
      </div>
    </div>
    <div class="report-print-scroll">
      <article class="report-print-sheet">${bodyHtml}</article>
    </div>
  `;

  const close = () => {
    overlay.remove();
    document.body.classList.remove('has-report-print-preview');
    document.removeEventListener('keydown', onKey);
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };

  overlay.querySelector('[data-print-close]')?.addEventListener('click', close);
  overlay.querySelector('[data-print-go]')?.addEventListener('click', () => window.print());
  document.addEventListener('keydown', onKey);
  document.body.classList.add('has-report-print-preview');
  document.body.appendChild(overlay);
}

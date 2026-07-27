/**
 * Invoice detail — view, print PDF, fill Word/ODT template.
 */

import * as bookService from '../../services/bookService.js';
import * as invoiceService from '../../services/invoiceService.js';
import * as invoiceTemplateService from '../../services/invoiceTemplateService.js';
import { escapeHtml, confirmModal } from '../modal.js';
import { formatDisplayDate } from '../../utils/date.js';
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

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/invoices">Invoices</a> / ${escapeHtml(invoice.invoiceNumber)}</p>
        <h1 class="page-header__title">${escapeHtml(invoice.invoiceType)} invoice</h1>
        <p class="page-header__desc">
          ${escapeHtml(formatDisplayDate(invoice.date))} · ${escapeHtml(invoice.partyName)} ·
          ${formatMoney(invoice.grandTotal, currency)}
        </p>
      </div>
      <div class="page-header__actions">
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
          <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0;width:9rem">Warehouse</td><td>${escapeHtml(invoice.warehouseName || '—')}</td></tr>
          <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Voucher</td><td>${
            invoice.voucherId
              ? `<a class="mono" href="#/transactions/${invoice.voucherId}">Open accounting voucher</a>`
              : '—'
          }</td></tr>
          <tr><td class="muted" style="padding:0.35rem 1rem 0.35rem 0">Narration</td><td>${escapeHtml(invoice.narration || '—')}</td></tr>
        </tbody>
      </table>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th>
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

  outlet.querySelector('#btn-delete')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Delete invoice?',
      danger: true,
      confirmLabel: 'Delete',
      bodyHtml: `<p>Delete <strong>${escapeHtml(invoice.invoiceNumber)}</strong> and reverse stock + vouchers?</p>`,
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
  document.body.appendChild(overlay);
  document.body.classList.add('has-report-print-preview');
  document.addEventListener('keydown', onKey);
}

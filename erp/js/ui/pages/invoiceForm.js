/**
 * Create Sales / Purchase invoice form.
 */

import * as bookService from '../../services/bookService.js';
import * as invoiceService from '../../services/invoiceService.js';
import * as inventoryService from '../../services/inventoryService.js';
import * as coaService from '../../services/coaService.js';
import * as taxService from '../../services/taxService.js';
import * as catalogueService from '../../services/catalogueService.js';
import { TAX_COMPONENTS } from '../../core/constants.js';
import { ACCOUNT_NATURES } from '../../core/accountTypes.js';
import { escapeHtml } from '../modal.js';
import { toDateInput } from '../../utils/date.js';
import { formatMoney, roundMoney } from '../../utils/money.js';
import { showToast } from '../toast.js';
import * as router from '../../core/router.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderInvoiceNew(ctx, outlet) {
  const typeParam = String(ctx.params.type || 'Sales');
  const invoiceType = typeParam.toLowerCase().startsWith('purch') ? 'Purchase' : 'Sales';
  await renderInvoiceForm(outlet, invoiceType);
}

/**
 * @param {HTMLElement} outlet
 * @param {'Sales'|'Purchase'} invoiceType
 */
async function renderInvoiceForm(outlet, invoiceType) {
  const session = await bookService.getSessionContext();
  const book = session.book;
  if (!book || !session.financialYear) {
    outlet.innerHTML = `<p class="muted">Open a book with an active financial year first.</p>`;
    return;
  }

  await inventoryService.ensureInventoryMasters(book.id);
  await taxService.ensureTaxMasters(book.id);

  const [items, warehouses, ledgers, taxCodes, invoiceNumber, catalogueTypes] = await Promise.all([
    inventoryService.listItems(book.id),
    inventoryService.listWarehouses(book.id),
    coaService.listLedgers(book.id),
    taxService.listTaxCodes(book.id),
    invoiceService.nextInvoiceNumber(book.id, invoiceType),
    catalogueService.listCatalogueTypes(book.id),
  ]);

  const activeItems = items.filter((i) => i.isActive !== false);
  const partyLedgers = ledgers.filter((l) => l.isActive !== false);
  const salesLedgers = ledgers.filter(
    (l) => l.isActive !== false && l.nature === ACCOUNT_NATURES.INCOME
  );
  const taxForType = taxCodes.filter(
    (c) =>
      c.isActive !== false &&
      c.component === (invoiceType === 'Sales' ? TAX_COMPONENTS.OUTPUT : TAX_COMPONENTS.INPUT)
  );
  const defaultWh = warehouses.find((w) => w.isDefault) || warehouses[0];
  const currency = book.currency || 'INR';
  const isSales = invoiceType === 'Sales';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/invoices">Invoices</a> / New</p>
        <h1 class="page-header__title">New ${escapeHtml(invoiceType)} invoice</h1>
        <p class="page-header__desc">
          ${
            isSales
              ? 'Debits the customer, credits Sales + output tax, reduces stock, and posts COGS.'
              : 'Credits the supplier, debits Stock + input tax, and increases inventory.'
          }
        </p>
      </div>
    </div>

    <form id="invoice-form" class="panel">
      <div class="form-grid">
        <label class="field">
          <span class="field__label">Invoice number</span>
          <input class="input mono" name="invoiceNumber" value="${escapeHtml(invoiceNumber)}" required />
        </label>
        <label class="field">
          <span class="field__label">Date</span>
          <input class="input" type="date" name="date" value="${toDateInput(new Date())}" required />
        </label>
        <label class="field" style="grid-column: span 2">
          <span class="field__label">${isSales ? 'Customer (receivable ledger)' : 'Supplier (payable ledger)'}</span>
          <select class="select" name="partyLedgerId" required>
            <option value="">Select ledger…</option>
            ${partyLedgers
              .map((l) => `<option value="${l.id}">${escapeHtml(l.name)} (${escapeHtml(l.nature)})</option>`)
              .join('')}
          </select>
        </label>
        ${
          isSales
            ? `<label class="field" style="grid-column: span 2">
                 <span class="field__label">Sales ledger</span>
                 <select class="select" name="salesLedgerId">
                   <option value="">Default “Sales”</option>
                   ${salesLedgers
                     .map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
                     .join('')}
                 </select>
               </label>`
            : ''
        }
        <label class="field" style="grid-column: span 2">
          <span class="field__label">Warehouse</span>
          <select class="select" name="warehouseId" required>
            ${warehouses
              .map(
                (w) =>
                  `<option value="${w.id}" ${w.id === defaultWh?.id ? 'selected' : ''}>${escapeHtml(w.name)}</option>`
              )
              .join('')}
          </select>
        </label>
        <label class="field" style="grid-column: 1 / -1">
          <span class="field__label">Narration</span>
          <input class="input" name="narration" placeholder="Optional" />
        </label>
      </div>

      <h2 class="panel__title" style="margin-top:1.25rem">Lines</h2>
      <div class="toolbar" style="margin:0 0 0.75rem;padding:0;border:0">
        <label class="field" style="margin:0;min-width:14rem">
          <span class="field__label">Filter by catalogue</span>
          <select class="select" id="line-catalogue-filter">
            <option value="">All items</option>
            ${catalogueTypes
              .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
              .join('')}
          </select>
        </label>
      </div>
      <div class="table-wrap">
        <table class="data-table" id="inv-lines">
          <thead>
            <tr>
              <th>Item</th>
              <th class="num">Qty</th>
              <th class="num">Rate</th>
              <th>Tax</th>
              <th class="num">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="form-actions" style="justify-content:space-between;border:0;padding:0.75rem 0 0">
        <button type="button" class="btn btn--secondary" id="btn-add-line">Add line</button>
        <div class="mono" id="inv-totals">Subtotal ${formatMoney(0, currency)} · Tax ${formatMoney(0, currency)} · Total ${formatMoney(0, currency)}</div>
      </div>

      <div class="form-actions">
        <a class="btn btn--ghost" href="#/invoices">Cancel</a>
        <button type="submit" class="btn btn--primary">Post invoice</button>
      </div>
    </form>
  `;

  const tbody = /** @type {HTMLTableSectionElement} */ (outlet.querySelector('#inv-lines tbody'));
  const totalsEl = /** @type {HTMLElement} */ (outlet.querySelector('#inv-totals'));
  const catalogueFilter = /** @type {HTMLSelectElement|null} */ (
    outlet.querySelector('#line-catalogue-filter')
  );

  /**
   * @param {string} [catalogueTypeId]
   */
  function buildItemOptions(catalogueTypeId = '') {
    return activeItems
      .filter((i) => !catalogueTypeId || i.catalogueTypeId === catalogueTypeId)
      .map((i) => {
        const rate = isSales ? i.saleRate || i.purchaseRate || 0 : i.purchaseRate || i.saleRate || 0;
        return `<option value="${i.id}" data-rate="${rate}" data-catalogue="${i.catalogueTypeId || ''}">${escapeHtml(i.name)}${
          i.code ? ` (${escapeHtml(i.code)})` : ''
        }</option>`;
      })
      .join('');
  }

  let itemOptions = buildItemOptions();

  const taxOptions =
    `<option value="">No tax</option>` +
    taxForType
      .map((c) => `<option value="${c.id}" data-rate="${c.rate}">${escapeHtml(c.name)} (${c.rate}%)</option>`)
      .join('');

  function refreshItemSelects() {
    const typeId = catalogueFilter?.value || '';
    itemOptions = buildItemOptions(typeId);
    tbody.querySelectorAll('[data-f="itemId"]').forEach((sel) => {
      const current = /** @type {HTMLSelectElement} */ (sel).value;
      /** @type {HTMLSelectElement} */ (sel).innerHTML =
        `<option value="">Item…</option>${itemOptions}`;
      if (current && [.../** @type {HTMLSelectElement} */ (sel).options].some((o) => o.value === current)) {
        /** @type {HTMLSelectElement} */ (sel).value = current;
      }
    });
  }

  catalogueFilter?.addEventListener('change', refreshItemSelects);

  function addRow(prefill = {}) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select class="select" data-f="itemId" required>
          <option value="">Item…</option>
          ${itemOptions}
        </select>
      </td>
      <td><input class="input num" data-f="quantity" type="number" min="0.0001" step="any" value="${prefill.quantity ?? 1}" required /></td>
      <td><input class="input num" data-f="rate" type="number" min="0" step="any" value="${prefill.rate ?? ''}" required /></td>
      <td><select class="select" data-f="taxCodeId">${taxOptions}</select></td>
      <td class="num mono" data-amt>—</td>
      <td><button type="button" class="btn btn--ghost btn--sm" data-remove>✕</button></td>
    `;
    tbody.appendChild(tr);
    const itemSel = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-f="itemId"]'));
    itemSel.addEventListener('change', () => {
      const opt = itemSel.selectedOptions[0];
      const rateInput = /** @type {HTMLInputElement} */ (tr.querySelector('[data-f="rate"]'));
      if (opt?.dataset.rate && rateInput && !rateInput.value) {
        rateInput.value = opt.dataset.rate;
      }
      recalc();
    });
    tr.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', recalc));
    tr.querySelector('[data-remove]')?.addEventListener('click', () => {
      tr.remove();
      recalc();
    });
    recalc();
  }

  function recalc() {
    let subtotal = 0;
    let taxTotal = 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const qty = Number(/** @type {HTMLInputElement} */ (tr.querySelector('[data-f="quantity"]')).value) || 0;
      const rate = Number(/** @type {HTMLInputElement} */ (tr.querySelector('[data-f="rate"]')).value) || 0;
      const taxSel = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-f="taxCodeId"]'));
      const taxRate = Number(taxSel.selectedOptions[0]?.dataset.rate || 0);
      const amount = roundMoney(qty * rate);
      const tax = taxRate > 0 ? roundMoney((amount * taxRate) / 100) : 0;
      subtotal = roundMoney(subtotal + amount);
      taxTotal = roundMoney(taxTotal + tax);
      const amtCell = tr.querySelector('[data-amt]');
      if (amtCell) amtCell.textContent = formatMoney(roundMoney(amount + tax), currency);
    });
    totalsEl.textContent = `Subtotal ${formatMoney(subtotal, currency)} · Tax ${formatMoney(taxTotal, currency)} · Total ${formatMoney(roundMoney(subtotal + taxTotal), currency)}`;
  }

  outlet.querySelector('#btn-add-line')?.addEventListener('click', () => addRow());
  addRow();

  outlet.querySelector('#invoice-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const fd = new FormData(form);
    /** @type {any[]} */
    const lines = [];
    tbody.querySelectorAll('tr').forEach((tr) => {
      const itemId = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-f="itemId"]')).value;
      if (!itemId) return;
      lines.push({
        itemId,
        quantity: Number(/** @type {HTMLInputElement} */ (tr.querySelector('[data-f="quantity"]')).value),
        rate: Number(/** @type {HTMLInputElement} */ (tr.querySelector('[data-f="rate"]')).value),
        taxCodeId: /** @type {HTMLSelectElement} */ (tr.querySelector('[data-f="taxCodeId"]')).value || null,
      });
    });

    try {
      const invoice = await invoiceService.createInvoice({
        bookId: book.id,
        financialYearId: session.financialYear.id,
        invoiceType,
        date: String(fd.get('date') || ''),
        invoiceNumber: String(fd.get('invoiceNumber') || ''),
        partyLedgerId: String(fd.get('partyLedgerId') || ''),
        salesLedgerId: String(fd.get('salesLedgerId') || '') || undefined,
        warehouseId: String(fd.get('warehouseId') || ''),
        narration: String(fd.get('narration') || ''),
        lines,
      });
      showToast(`${invoiceType} invoice posted`, 'success');
      router.navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not post invoice', 'error');
    }
  });
}

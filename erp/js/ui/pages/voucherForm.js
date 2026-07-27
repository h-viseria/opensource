/**
 * Voucher create / edit form with live double-entry balance check and tax tagging.
 */

import * as voucherService from '../../services/voucherService.js';
import * as taxService from '../../services/taxService.js';
import {
  isKnownVoucherType,
  defaultLinesForType,
  validateVoucherLines,
} from '../../engine/accountingEngine.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { toDateInput } from '../../utils/date.js';
import { formatMoney, roundMoney, moneyEquals } from '../../utils/money.js';
import * as router from '../../core/router.js';

/**
 * New voucher by type: /transactions/new/:type
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderVoucherNew(ctx, outlet) {
  const type = decodeURIComponent(ctx.params.type || 'Journal');
  if (!isKnownVoucherType(type)) {
    outlet.innerHTML = `<p class="muted">Unknown voucher type.</p>
      <p><a href="#/transactions">Back</a></p>`;
    return;
  }
  await renderVoucherForm(outlet, { mode: 'create', voucherType: type });
}

/**
 * Edit / view: /transactions/:id
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 */
export async function renderVoucherDetail(ctx, outlet) {
  const id = ctx.params.id;
  if (!id || id === 'new' || id === 'list') return;
  const data = await voucherService.getVoucherWithLines(id);
  if (!data) {
    outlet.innerHTML = `<p class="muted">Voucher not found.</p>
      <p><a href="#/transactions">Back</a></p>`;
    return;
  }
  await renderVoucherForm(outlet, {
    mode: 'edit',
    voucherType: data.voucher.voucherType,
    voucher: data.voucher,
    lines: data.lines,
  });
}

/**
 * @param {HTMLElement} outlet
 * @param {{
 *   mode: 'create'|'edit',
 *   voucherType: string,
 *   voucher?: import('../../models/types.js').Voucher,
 *   lines?: import('../../models/types.js').VoucherLine[]
 * }} opts
 */
async function renderVoucherForm(outlet, opts) {
  const ctx = await voucherService.getEntryContext();
  const { book, financialYear, ledgers } = ctx;
  const currency = book.currency || 'INR';

  await taxService.ensureTaxMasters(book.id);
  const taxCodes = await taxService.listTaxCodes(book.id, { activeOnly: true });

  const initialLines =
    opts.mode === 'edit' && opts.lines
      ? opts.lines.map((l) => ({
          ledgerId: l.ledgerId,
          debit: l.debit,
          credit: l.credit,
          taxCodeId: l.taxCodeId || '',
          narration: l.narration || '',
        }))
      : defaultLinesForType(opts.voucherType).map((l) => ({
          ...l,
          taxCodeId: '',
        }));

  const voucherNumber =
    opts.mode === 'edit'
      ? opts.voucher.voucherNumber
      : await voucherService.nextVoucherNumber(book.id, opts.voucherType);

  const dateValue =
    opts.mode === 'edit' ? opts.voucher.date : toDateInput(new Date());
  const narrationValue = opts.mode === 'edit' ? opts.voucher.narration || '' : '';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/transactions">Transactions</a> / ${escapeHtml(opts.voucherType)}</p>
        <h1 class="page-header__title">${opts.mode === 'edit' ? 'Edit' : 'New'} ${escapeHtml(opts.voucherType)}</h1>
        <p class="page-header__desc">
          ${escapeHtml(financialYear.name)} · Debits must equal credits ·
          Tag tax lines for <a href="#/tax">Tax reports</a>
        </p>
      </div>
      <div class="page-header__actions">
        ${opts.mode === 'edit' ? `<button type="button" class="btn btn--ghost" id="btn-delete">Delete</button>` : ''}
        <a class="btn btn--secondary" href="#/transactions">Cancel</a>
        <button type="button" class="btn btn--primary" id="btn-save">Save</button>
      </div>
    </div>

    <form class="voucher-form" id="voucher-form">
      <div class="panel">
        <div class="form-row form-row--3">
          <div class="field">
            <label class="field__label" for="v-number">Number</label>
            <input class="input mono" id="v-number" name="voucherNumber" value="${escapeHtml(voucherNumber)}" required />
          </div>
          <div class="field">
            <label class="field__label" for="v-date">Date</label>
            <input class="input" type="date" id="v-date" name="date" value="${escapeHtml(dateValue)}" required />
          </div>
          <div class="field">
            <label class="field__label" for="v-type">Type</label>
            <input class="input" id="v-type" value="${escapeHtml(opts.voucherType)}" disabled />
          </div>
        </div>
        <div class="field" style="margin-top:var(--space-4)">
          <label class="field__label" for="v-narration">Narration</label>
          <input class="input" id="v-narration" name="narration" maxlength="500" value="${escapeHtml(narrationValue)}" placeholder="Optional description" />
        </div>
      </div>

      <div class="panel" style="margin-top:var(--space-4);padding:0;overflow:hidden">
        <div class="table-wrap">
          <table class="data-table voucher-lines" id="lines-table">
            <thead>
              <tr>
                <th style="width:2.5rem">#</th>
                <th>Ledger</th>
                <th style="width:9rem">Tax</th>
                <th class="num" style="width:7.5rem">Debit</th>
                <th class="num" style="width:7.5rem">Credit</th>
                <th style="width:2.5rem"></th>
              </tr>
            </thead>
            <tbody id="lines-body"></tbody>
          </table>
        </div>
        <div class="voucher-lines__footer">
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <button type="button" class="btn btn--secondary btn--sm" id="btn-add-line">Add line</button>
            <button type="button" class="btn btn--secondary btn--sm" id="btn-apply-tax" ${taxCodes.length ? '' : 'disabled'} title="Add a tax line from a base amount">Apply tax</button>
          </div>
          <div class="voucher-balance" id="balance-bar">
            <span>Debit <strong class="mono" id="sum-debit">0.00</strong></span>
            <span>Credit <strong class="mono" id="sum-credit">0.00</strong></span>
            <span class="voucher-balance__status" id="balance-status">Unbalanced</span>
          </div>
        </div>
      </div>

      <div class="voucher-alerts" id="voucher-alerts" hidden></div>
    </form>
  `;

  /** @type {{ ledgerId: string, debit: number|string, credit: number|string, taxCodeId: string, narration: string }[]} */
  let lineState = initialLines.map((l) => ({
    ledgerId: l.ledgerId || '',
    debit: l.debit || '',
    credit: l.credit || '',
    taxCodeId: l.taxCodeId || '',
    narration: l.narration || '',
  }));

  const body = /** @type {HTMLElement} */ (outlet.querySelector('#lines-body'));

  function taxOptionsHtml(selected) {
    return (
      `<option value="">—</option>` +
      taxCodes
        .map(
          (t) =>
            `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${escapeHtml(t.code || t.name)} ${t.rate}%</option>`
        )
        .join('')
    );
  }

  function renderLines() {
    body.innerHTML = lineState
      .map((line, i) => {
        const ledgerOpts = ledgers
          .map(
            (l) =>
              `<option value="${l.id}" ${l.id === line.ledgerId ? 'selected' : ''}>${escapeHtml(l.name)} (${escapeHtml(l.nature)})</option>`
          )
          .join('');
        return `
          <tr data-idx="${i}">
            <td class="mono faint">${i + 1}</td>
            <td>
              <select class="select select--compact" data-field="ledgerId">
                <option value="">Select ledger…</option>
                ${ledgerOpts}
              </select>
            </td>
            <td>
              <select class="select select--compact" data-field="taxCodeId">
                ${taxOptionsHtml(line.taxCodeId)}
              </select>
            </td>
            <td>
              <input class="input input--compact num-input" data-field="debit" type="number" min="0" step="0.01" value="${line.debit === 0 || line.debit === '' ? '' : line.debit}" />
            </td>
            <td>
              <input class="input input--compact num-input" data-field="credit" type="number" min="0" step="0.01" value="${line.credit === 0 || line.credit === '' ? '' : line.credit}" />
            </td>
            <td>
              <button type="button" class="btn btn--ghost btn--sm" data-action="remove" title="Remove" ${lineState.length <= 2 ? 'disabled' : ''}>✕</button>
            </td>
          </tr>`;
      })
      .join('');

    bindLineEvents();
    updateBalance();
  }

  function readLinesFromDom() {
    body.querySelectorAll('tr').forEach((tr) => {
      const idx = Number(tr.getAttribute('data-idx'));
      if (!lineState[idx]) return;
      const ledger = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-field="ledgerId"]'));
      const tax = /** @type {HTMLSelectElement} */ (tr.querySelector('[data-field="taxCodeId"]'));
      const debit = /** @type {HTMLInputElement} */ (tr.querySelector('[data-field="debit"]'));
      const credit = /** @type {HTMLInputElement} */ (tr.querySelector('[data-field="credit"]'));
      lineState[idx] = {
        ledgerId: ledger?.value || '',
        taxCodeId: tax?.value || '',
        debit: debit?.value || '',
        credit: credit?.value || '',
        narration: lineState[idx].narration || '',
      };
    });
  }

  function bindLineEvents() {
    body.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        const tr = el.closest('tr');
        const idx = Number(tr?.getAttribute('data-idx'));
        const field = el.getAttribute('data-field');
        if (Number.isNaN(idx) || !field) return;

        if (field === 'debit' && /** @type {HTMLInputElement} */ (el).value) {
          const credit = /** @type {HTMLInputElement|null} */ (tr.querySelector('[data-field="credit"]'));
          if (credit) credit.value = '';
        }
        if (field === 'credit' && /** @type {HTMLInputElement} */ (el).value) {
          const debit = /** @type {HTMLInputElement|null} */ (tr.querySelector('[data-field="debit"]'));
          if (debit) debit.value = '';
        }

        // Auto-fill ledger when tax code selected and ledger empty
        if (field === 'taxCodeId') {
          const taxId = /** @type {HTMLSelectElement} */ (el).value;
          const code = taxCodes.find((t) => t.id === taxId);
          const ledgerSel = /** @type {HTMLSelectElement|null} */ (
            tr.querySelector('[data-field="ledgerId"]')
          );
          if (code?.ledgerId && ledgerSel && !ledgerSel.value) {
            ledgerSel.value = code.ledgerId;
          }
        }

        readLinesFromDom();
        updateBalance();
      });
      el.addEventListener('change', () => {
        readLinesFromDom();
        updateBalance();
      });
    });

    body.querySelectorAll('[data-action="remove"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const idx = Number(tr?.getAttribute('data-idx'));
        readLinesFromDom();
        if (lineState.length <= 2) return;
        lineState.splice(idx, 1);
        renderLines();
      });
    });
  }

  function updateBalance() {
    readLinesFromDom();
    const ledgersById = new Map(ledgers.map((l) => [l.id, l]));
    const validation = validateVoucherLines(
      lineState.map((l) => ({
        ledgerId: l.ledgerId,
        debit: roundMoney(l.debit),
        credit: roundMoney(l.credit),
        taxCodeId: l.taxCodeId || null,
      })),
      { voucherType: opts.voucherType, ledgersById }
    );

    const debitEl = outlet.querySelector('#sum-debit');
    const creditEl = outlet.querySelector('#sum-credit');
    const statusEl = outlet.querySelector('#balance-status');
    const bar = outlet.querySelector('#balance-bar');
    const alerts = outlet.querySelector('#voucher-alerts');

    if (debitEl) debitEl.textContent = formatMoney(validation.debitTotal);
    if (creditEl) creditEl.textContent = formatMoney(validation.creditTotal);

    const balanced =
      moneyEquals(validation.debitTotal, validation.creditTotal) && validation.lines.length >= 2;
    if (statusEl && bar) {
      statusEl.textContent = balanced ? 'Balanced' : 'Unbalanced';
      bar.classList.toggle('is-balanced', balanced);
      bar.classList.toggle('is-unbalanced', !balanced);
    }

    if (alerts) {
      const msgs = [...validation.errors, ...validation.warnings.map((w) => `Note: ${w}`)];
      if (msgs.length === 0) {
        alerts.hidden = true;
        alerts.innerHTML = '';
      } else {
        alerts.hidden = false;
        alerts.innerHTML = msgs
          .map(
            (m) =>
              `<div class="voucher-alert ${m.startsWith('Note:') ? 'voucher-alert--warn' : 'voucher-alert--error'}">${escapeHtml(m)}</div>`
          )
          .join('');
      }
    }

    return validation;
  }

  outlet.querySelector('#btn-add-line')?.addEventListener('click', () => {
    readLinesFromDom();
    lineState.push({ ledgerId: '', debit: '', credit: '', taxCodeId: '', narration: '' });
    renderLines();
  });

  outlet.querySelector('#btn-apply-tax')?.addEventListener('click', async () => {
    if (!taxCodes.length) {
      showToast('Create a tax code first', 'info');
      return;
    }
    readLinesFromDom();

    // Prefer last line with an amount and no tax as the base
    let base = 0;
    for (let i = lineState.length - 1; i >= 0; i--) {
      const amt = Math.max(roundMoney(lineState[i].debit), roundMoney(lineState[i].credit));
      if (amt > 0 && !lineState[i].taxCodeId) {
        base = amt;
        break;
      }
    }
    if (base <= 0) {
      showToast('Enter a base amount on a line first', 'info');
      return;
    }

    const codeOpts = taxCodes
      .map(
        (t) =>
          `<option value="${t.id}">${escapeHtml(t.name)} (${t.rate}% ${escapeHtml(t.component)})</option>`
      )
      .join('');

    const fd = await formModal({
      title: 'Apply tax',
      confirmLabel: 'Add tax line',
      fieldsHtml: `
        <p class="muted" style="margin:0 0 0.75rem">Base amount: <strong class="mono">${formatMoney(base, currency)}</strong></p>
        <label class="field"><span class="field__label">Tax code *</span>
          <select class="input" name="taxCodeId" required>${codeOpts}</select></label>
      `,
    });
    if (!fd) return;

    const taxCode = taxCodes.find((t) => t.id === String(fd.get('taxCodeId')));
    if (!taxCode) return;
    if (!taxCode.ledgerId) {
      showToast('Link a posting ledger on this tax code first', 'error');
      return;
    }

    const suggested = taxService.suggestTaxLine(taxCode, base);
    lineState.push({
      ledgerId: suggested.ledgerId,
      taxCodeId: suggested.taxCodeId,
      debit: suggested.debit || '',
      credit: suggested.credit || '',
      narration: `${taxCode.name} on ${formatMoney(base)}`,
    });
    renderLines();
    showToast(`Added ${formatMoney(suggested.amount, currency)} tax`, 'success');
  });

  outlet.querySelector('#btn-save')?.addEventListener('click', async () => {
    readLinesFromDom();
    const validation = updateBalance();
    if (!validation.ok) {
      showToast(validation.errors[0] || 'Voucher is not balanced', 'error');
      return;
    }

    const number = /** @type {HTMLInputElement} */ (outlet.querySelector('#v-number')).value;
    const date = /** @type {HTMLInputElement} */ (outlet.querySelector('#v-date')).value;
    const narration = /** @type {HTMLInputElement} */ (outlet.querySelector('#v-narration')).value;

    const payloadLines = lineState.map((l) => ({
      ledgerId: l.ledgerId,
      debit: roundMoney(l.debit),
      credit: roundMoney(l.credit),
      taxCodeId: l.taxCodeId || null,
      narration: l.narration || '',
    }));

    try {
      if (opts.mode === 'create') {
        const result = await voucherService.createVoucher({
          bookId: book.id,
          financialYearId: financialYear.id,
          voucherType: opts.voucherType,
          date,
          narration,
          voucherNumber: number,
          lines: payloadLines,
        });
        if (result.warnings?.length) {
          showToast(result.warnings[0], 'info');
        } else {
          showToast('Voucher saved', 'success');
        }
        router.navigate(`/transactions/${result.voucher.id}`);
      } else {
        const result = await voucherService.updateVoucher(opts.voucher.id, {
          date,
          narration,
          voucherNumber: number,
          lines: payloadLines,
        });
        if (result.warnings?.length) {
          showToast(result.warnings[0], 'info');
        } else {
          showToast('Voucher updated', 'success');
        }
        await renderVoucherForm(outlet, {
          mode: 'edit',
          voucherType: result.voucher.voucherType,
          voucher: result.voucher,
          lines: result.lines,
        });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  });

  outlet.querySelector('#btn-delete')?.addEventListener('click', async () => {
    if (opts.mode !== 'edit' || !opts.voucher) return;
    const ok = await confirmModal({
      title: 'Delete voucher?',
      danger: true,
      confirmLabel: 'Delete',
      bodyHtml: `<p>Delete <strong>${escapeHtml(opts.voucher.voucherNumber)}</strong>? This cannot be undone.</p>`,
    });
    if (!ok) return;
    try {
      await voucherService.deleteVoucher(opts.voucher.id);
      showToast('Voucher deleted', 'success');
      router.navigate('/transactions');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  });

  renderLines();
}

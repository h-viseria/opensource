import { PAYMENT_METHODS, SETTINGS_KEYS, TRANSFER_LIKE, TXN_TYPES } from '../../core/constants.js';
import { escapeHtml } from '../../utils/html.js';
import { todayIsoDate } from '../../utils/date.js';
import { toMinor, fromMinor } from '../../utils/money.js';
import { getSetting } from '../../services/settingsService.js';
import { listAccounts } from '../../services/accountService.js';
import { getCategoryTree, listCategories } from '../../services/categoryService.js';
import { listMerchants, listPeople, listTags, getOrCreateMerchant, suggestCategory } from '../../services/masterService.js';
import { getTransaction, saveTransaction } from '../../services/transactionService.js';
import { storeReceipt } from '../../services/receiptService.js';
import { listCurrencies, getBaseCurrency } from '../../services/currencyService.js';
import { showToast } from '../toast.js';
import * as router from '../../core/router.js';
import { ACCOUNT_TYPE_LABELS } from '../../data/defaults.js';

/**
 * @param {HTMLElement} outlet
 * @param {{ id?: string, type?: string, draft?: object }} opts
 */
export async function renderTransactionForm(outlet, opts = {}) {
  const existing = opts.id ? await getTransaction(opts.id) : null;
  const accounts = await listAccounts();
  if (!accounts.length) {
    outlet.innerHTML = `<section class="page"><p>Create an account first.</p><a class="btn btn--primary" href="#/accounts">Accounts</a></section>`;
    return;
  }
  const tree = await getCategoryTree();
  const cats = await listCategories();
  const merchants = await listMerchants();
  const people = await listPeople();
  const tags = await listTags();
  const currencies = await listCurrencies();
  const base = await getBaseCurrency();
  const lastAccount = (await getSetting(SETTINGS_KEYS.LAST_ACCOUNT_ID)) || (await getSetting(SETTINGS_KEYS.DEFAULT_ACCOUNT_ID));
  const lastCat = await getSetting(SETTINGS_KEYS.LAST_CATEGORY_ID);
  const type = existing?.type || opts.type || opts.draft?.type || TXN_TYPES.EXPENSE;
  const currency = existing?.currency || accounts[0].currency || base;

  const catOptions = flattenCats(tree);
  const draft = opts.draft || {};

  outlet.innerHTML = `
    <section class="page page--form">
      <h2>${existing ? 'Edit transaction' : 'Add transaction'}</h2>
      <p class="lede">${
        existing
          ? 'Change the saved entry. Date is the day the money moved — not today’s date unless it happened today.'
          : 'Record a new expense, income, or transfer. This is not a search screen.'
      }</p>
      <form id="txn-form" class="form">
        <div class="field">
          <p class="field__label" id="type-label">What happened</p>
          <div class="seg" role="tablist" aria-labelledby="type-label">
            ${typeBtn('EXPENSE', 'Expense', type)}
            ${typeBtn('INCOME', 'Income', type)}
            ${typeBtn('TRANSFER', 'Transfer', type)}
          </div>
          <p class="field__hint">Expense is money you spent. Income is money you received. Transfer moves money between your own accounts and is not spending.</p>
        </div>
        <input type="hidden" name="type" id="f-type" value="${escapeHtml(type)}" />
        <div class="field-row">
          <div class="field">
            <label class="field__label" for="f-date">Date of this transaction</label>
            <input class="input" id="f-date" name="date" type="date" required value="${escapeHtml(existing?.date || draft.date || todayIsoDate())}" />
            <p class="field__hint">The calendar day the money moved, not when you are entering it.</p>
          </div>
          <div class="field">
            <label class="field__label" for="f-amount">Amount</label>
            <input class="input input--amount" id="f-amount" name="amount" inputmode="decimal" required value="${escapeHtml(draft.total || (existing ? fromMinor(existing.amountMinor, existing.currency) : ''))}" />
            <p class="field__hint">How much, in the currency of the account below.</p>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field__label" for="f-account">Account</label>
            <select class="input" id="f-account" name="accountId" required>
              ${accounts.map((a) => `<option value="${a.id}" ${a.id === (existing?.accountId || lastAccount) ? 'selected' : ''}>${escapeHtml(a.name)} (${escapeHtml(ACCOUNT_TYPE_LABELS[a.type] || a.type)})</option>`).join('')}
            </select>
            <p class="field__hint">Wallet, bank, or card this came from (or went into, for income).</p>
          </div>
          <div class="field" id="xfer-wrap" ${TRANSFER_LIKE.includes(type) ? '' : 'hidden'}>
            <label class="field__label" for="f-xfer">To account</label>
            <select class="input" id="f-xfer" name="transferAccountId">
              ${accounts.map((a) => `<option value="${a.id}" ${a.id === existing?.transferAccountId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
            </select>
            <p class="field__hint">Destination for a transfer only. Hidden for ordinary expenses.</p>
          </div>
        </div>
        <div class="field" id="cat-wrap">
          <label class="field__label" for="f-cat">Category</label>
          <select class="input" id="f-cat" name="categoryId">
            <option value="">—</option>
            ${catOptions
              .map(
                (c) =>
                  `<option value="${c.id}" ${c.id === (existing?.subcategoryId || existing?.categoryId || draft.categoryId || lastCat) ? 'selected' : ''}>${escapeHtml(c.label)}</option>`
              )
              .join('')}
          </select>
          <p class="field__hint">What this was for — Groceries, Salary, and so on. Used in reports.</p>
        </div>
        <details class="more-fields">
          <summary>Optional details</summary>
          <div class="field">
            <label class="field__label" for="f-merchant">Merchant</label>
            <input class="input" id="f-merchant" name="merchant" list="merchant-list" value="${escapeHtml(draft.merchant || '')}" />
            <datalist id="merchant-list">${merchants.map((m) => `<option value="${escapeHtml(m.name)}"></option>`).join('')}</datalist>
            <p class="field__hint">Store or payee name, if you want it on the list.</p>
          </div>
          <div class="field">
            <label class="field__label" for="f-desc">Description</label>
            <input class="input" id="f-desc" name="description" value="${escapeHtml(existing?.description || draft.merchant || '')}" />
            <p class="field__hint">Short label shown in the list. Defaults to the merchant name.</p>
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field__label" for="f-ccy">Currency</label>
              <select class="input" id="f-ccy" name="currency">
                ${currencies.map((c) => `<option ${c.code === currency ? 'selected' : ''}>${c.code}</option>`).join('')}
              </select>
              <p class="field__hint">Usually the same as the account. Change only if you paid in another currency.</p>
            </div>
            <div class="field">
              <label class="field__label" for="f-rate">FX rate → ${escapeHtml(base)}</label>
              <input class="input" id="f-rate" name="exchangeRate" inputmode="decimal" placeholder="optional" value="${existing?.exchangeRate ?? ''}" />
              <p class="field__hint">How many ${escapeHtml(base)} per 1 of the currency above. Leave blank if unused.</p>
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="f-pay">Payment method</label>
            <select class="input" id="f-pay" name="paymentMethod">
              <option value="">—</option>
              ${Object.keys(PAYMENT_METHODS)
                .map(
                  (k) =>
                    `<option value="${k}" ${existing?.paymentMethod === k || draft.paymentMethod === k ? 'selected' : ''}>${k.replace(/_/g, ' ')}</option>`
                )
                .join('')}
            </select>
            <p class="field__hint">How you paid — card, cash, UPI, and so on. Optional.</p>
          </div>
          <div class="field">
            <label class="field__label" for="f-person">Person</label>
            <select class="input" id="f-person" name="personId">
              <option value="">—</option>
              ${people.map((p) => `<option value="${p.id}" ${existing?.personId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
            </select>
            <p class="field__hint">Who this was for or with, if you track shared spending.</p>
          </div>
          <div class="field">
            <label class="field__label">Tags</label>
            <div class="tag-picks">
              ${tags
                .map(
                  (t) =>
                    `<label class="chip"><input type="checkbox" name="tagIds" value="${t.id}" ${(existing?.tagIds || []).includes(t.id) ? 'checked' : ''} /> ${escapeHtml(t.name)}</label>`
                )
                .join('')}
            </div>
            <p class="field__hint">Extra labels for later filtering. Optional.</p>
          </div>
          <div class="field">
            <label class="field__label" for="f-notes">Notes</label>
            <textarea class="input" id="f-notes" name="notes" rows="2">${escapeHtml(existing?.notes || '')}</textarea>
            <p class="field__hint">Anything you want to remember that does not belong in the description.</p>
          </div>
          <label class="chip"><input type="checkbox" name="isReimbursable" ${existing?.isReimbursable ? 'checked' : ''} /> Reimbursable</label>
          <label class="chip"><input type="checkbox" name="isTaxRelated" ${existing?.isTaxRelated ? 'checked' : ''} /> Tax-related</label>
          <label class="chip"><input type="checkbox" name="isTaxDeductible" ${existing?.isTaxDeductible ? 'checked' : ''} /> Tax-deductible</label>
          <div class="field">
            <label class="field__label" for="f-receipt">Receipt</label>
            <input class="input" id="f-receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
            <p class="field__hint">Photo or PDF attached to this entry. Optional.</p>
          </div>
          <p class="muted">Splits (optional — amounts must add up to the total above)</p>
          <button type="button" class="btn btn--ghost btn--sm" id="add-split">Add split</button>
          <div id="split-rows"></div>
        </details>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary" id="btn-save">Save</button>
          ${existing ? '' : '<button type="submit" class="btn btn--secondary" id="btn-save-new" name="again" value="1">Save &amp; another</button>'}
          <a class="btn btn--ghost" href="#/transactions">Cancel</a>
        </div>
      </form>
    </section>
  `;

  const form = /** @type {HTMLFormElement} */ (outlet.querySelector('#txn-form'));
  const typeInput = /** @type {HTMLInputElement} */ (outlet.querySelector('#f-type'));
  outlet.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-type');
      typeInput.value = t;
      outlet.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('is-active', b === btn));
      const xfer = outlet.querySelector('#xfer-wrap');
      if (xfer) xfer.hidden = !TRANSFER_LIKE.includes(t);
    });
  });

  const merchantInput = /** @type {HTMLInputElement} */ (outlet.querySelector('#f-merchant'));
  merchantInput?.addEventListener('change', async () => {
    const sug = await suggestCategory({ merchantName: merchantInput.value, description: form.description.value });
    if (sug?.categoryId) form.categoryId.value = sug.subcategoryId || sug.categoryId;
  });

  outlet.querySelector('#add-split')?.addEventListener('click', () => addSplitRow(outlet, catOptions));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const again = e.submitter && e.submitter.id === 'btn-save-new';
    try {
      const fd = new FormData(form);
      const ccy = String(fd.get('currency') || currency);
      const amountMinor = toMinor(String(fd.get('amount')), ccy);
      const typeVal = String(fd.get('type') || TXN_TYPES.EXPENSE);
      let merchantId = existing?.merchantId || null;
      const merchantName = String(fd.get('merchant') || '').trim();
      if (merchantName) merchantId = (await getOrCreateMerchant(merchantName)).id;
      const catId = String(fd.get('categoryId') || '');
      const cat = cats.find((c) => c.id === catId);
      const splitRows = [...outlet.querySelectorAll('.split-row')].map((row) => ({
        categoryId: row.querySelector('[name="splitCat"]')?.value,
        amountMinor: toMinor(row.querySelector('[name="splitAmt"]')?.value || '0', ccy),
        description: row.querySelector('[name="splitDesc"]')?.value,
      })).filter((s) => s.amountMinor);
      const saved = await saveTransaction({
        id: existing?.id,
        date: String(fd.get('date')),
        type: typeVal,
        amountMinor,
        currency: ccy,
        exchangeRate: fd.get('exchangeRate') ? Number(fd.get('exchangeRate')) : null,
        accountId: String(fd.get('accountId')),
        transferAccountId: String(fd.get('transferAccountId') || ''),
        categoryId: cat?.parentId || catId || null,
        subcategoryId: cat?.parentId ? catId : null,
        merchantId,
        description: String(fd.get('description') || merchantName),
        notes: String(fd.get('notes') || ''),
        paymentMethod: String(fd.get('paymentMethod') || ''),
        personId: String(fd.get('personId') || '') || null,
        tagIds: [...form.querySelectorAll('[name="tagIds"]:checked')].map((el) => el.value),
        isReimbursable: form.querySelector('[name="isReimbursable"]')?.checked,
        isTaxRelated: form.querySelector('[name="isTaxRelated"]')?.checked,
        isTaxDeductible: form.querySelector('[name="isTaxDeductible"]')?.checked,
        splits: splitRows,
      });
      const receipt = form.querySelector('#f-receipt')?.files?.[0];
      if (receipt) await storeReceipt(receipt, { transactionId: saved.id });
      showToast('Saved', 'success');
      if (again) {
        form.amount.value = '';
        form.description.value = '';
        form.amount.focus();
      } else router.navigate('/transactions');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  });

  form.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      form.requestSubmit();
    }
  });
}

function typeBtn(id, label, current) {
  return `<button type="button" class="seg__btn ${current === id ? 'is-active' : ''}" data-type="${id}">${label}</button>`;
}

function flattenCats(tree, prefix = '') {
  const out = [];
  for (const n of tree) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ id: n.id, label, kind: n.kind });
    for (const c of n.children || []) out.push({ id: c.id, label: `${label} / ${c.name}`, kind: c.kind });
  }
  return out;
}

function addSplitRow(outlet, catOptions) {
  const wrap = outlet.querySelector('#split-rows');
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = 'split-row field-row';
  div.innerHTML = `
    <select class="input" name="splitCat">${catOptions.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('')}</select>
    <input class="input" name="splitAmt" inputmode="decimal" placeholder="Amount" />
    <input class="input" name="splitDesc" placeholder="Note" />
    <button type="button" class="btn btn--ghost" aria-label="Remove">✕</button>
  `;
  div.querySelector('button')?.addEventListener('click', () => div.remove());
  wrap.appendChild(div);
}

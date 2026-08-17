import { createAccount, updateAccount, listAccounts, getBalances } from '../../services/accountService.js';
import { ACCOUNT_TYPES } from '../../core/constants.js';
import { ACCOUNT_TYPE_LABELS } from '../../data/defaults.js';
import { escapeHtml } from '../../utils/html.js';
import { money } from '../../utils/format.js';
import { toMinor } from '../../utils/money.js';
import { formModal } from '../modal.js';
import { showToast } from '../toast.js';
import { getBaseCurrency, listCurrencies } from '../../services/currencyService.js';
import { percent } from '../../utils/format.js';

export async function renderAccounts() {
  const outlet = document.getElementById('outlet');
  const rows = await getBalances();
  const base = await getBaseCurrency();
  outlet.innerHTML = `
    <section class="page">
      <div class="page-head">
        <h2>Accounts</h2>
        <button type="button" class="btn btn--primary" id="btn-add">Add account</button>
      </div>
      <ul class="card-list">
        ${rows
          .map((r) => {
            const a = r.account;
            const extra = r.card
              ? `<p class="muted">Outstanding ${money(r.card.outstanding, a.currency)} · Available ${money(r.card.available, a.currency)} · Util ${percent(r.card.utilization)}${r.card.paymentDueDate ? ` · Due day ${r.card.paymentDueDate}` : ''}</p>`
              : '';
            return `<li class="acct-card">
              <h3>${escapeHtml(a.name)}</h3>
              <p class="muted">${escapeHtml(ACCOUNT_TYPE_LABELS[a.type] || a.type)} · ${escapeHtml(a.currency)}</p>
              <p class="hero-amount ${r.liability ? 'amount--out' : ''}">${money(r.balanceMinor, a.currency)}</p>
              ${extra}
              ${a.currency !== base ? `<p class="muted">Reporting currency is ${escapeHtml(base)} — convert with a manual FX rate.</p>` : ''}
              <button type="button" class="btn btn--ghost btn--sm" data-edit="${a.id}">Edit</button>
            </li>`;
          })
          .join('') || '<li class="muted">No accounts yet</li>'}
      </ul>
    </section>
  `;
  outlet.querySelector('#btn-add')?.addEventListener('click', () => editAccount());
  outlet.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit');
      const rec = rows.find((x) => x.account.id === id)?.account;
      await editAccount(rec);
    });
  });
}

async function editAccount(existing) {
  const currencies = await listCurrencies();
  const fd = await formModal({
    title: existing ? 'Edit account' : 'New account',
    fieldsHtml: `
      <div class="form">
        <div class="field"><label class="field__label" for="n">Name</label><input class="input" id="n" name="name" required value="${escapeHtml(existing?.name || '')}" /></div>
        <div class="field"><label class="field__label" for="t">Type</label>
          <select class="input" id="t" name="type">${Object.keys(ACCOUNT_TYPES)
            .map((k) => `<option value="${k}" ${existing?.type === k ? 'selected' : ''}>${ACCOUNT_TYPE_LABELS[k]}</option>`)
            .join('')}</select></div>
        <div class="field"><label class="field__label" for="c">Currency</label>
          <select class="input" id="c" name="currency">${currencies.map((c) => `<option ${c.code === (existing?.currency || 'AED') ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div>
        <div class="field"><label class="field__label" for="o">Opening balance</label><input class="input" id="o" name="opening" value="${existing ? existing.openingBalanceMinor / 100 : '0'}" /></div>
        <div class="field"><label class="field__label" for="inst">Institution</label><input class="input" id="inst" name="institution" value="${escapeHtml(existing?.institution || '')}" /></div>
        <div class="field"><label class="field__label" for="lim">Credit limit (cards)</label><input class="input" id="lim" name="limit" value="${existing?.creditLimitMinor ? existing.creditLimitMinor / 100 : ''}" /></div>
        <div class="field"><label class="field__label" for="due">Payment due day (1–31)</label><input class="input" id="due" name="paymentDueDate" inputmode="numeric" value="${existing?.paymentDueDate ?? ''}" /></div>
      </div>`,
  });
  if (!fd) return;
  const ccy = String(fd.get('currency'));
  const payload = {
    name: String(fd.get('name')),
    type: String(fd.get('type')),
    currency: ccy,
    openingBalanceMinor: toMinor(String(fd.get('opening') || '0'), ccy),
    institution: String(fd.get('institution') || ''),
    creditLimitMinor: fd.get('limit') ? toMinor(String(fd.get('limit')), ccy) : 0,
    paymentDueDate: fd.get('paymentDueDate') ? Number(fd.get('paymentDueDate')) : null,
  };
  try {
    if (existing) await updateAccount(existing.id, payload);
    else await createAccount(payload);
    showToast('Account saved', 'success');
    renderAccounts();
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Failed', 'error');
  }
  void listAccounts;
}

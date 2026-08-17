import { SETTINGS_KEYS, THEMES } from '../../core/constants.js';
import { getSettingsMap, setSetting } from '../../services/settingsService.js';
import { listCurrencies, setBaseCurrency, saveRate, listRates } from '../../services/currencyService.js';
import { listAccounts } from '../../services/accountService.js';
import { listCategories } from '../../services/categoryService.js';
import { listAudit, clearAudit } from '../../services/auditService.js';
import { saveMerchant, listMerchants, saveTag, listTags, savePerson, listPeople, saveRule, listRules, deleteRule } from '../../services/masterService.js';
import { setTheme } from '../theme.js';
import { escapeHtml } from '../../utils/html.js';
import { showToast } from '../toast.js';
import { formModal, confirmModal } from '../modal.js';
import { loadSampleData, removeSampleData } from '../../services/seedService.js';

export async function renderSettings() {
  const outlet = document.getElementById('outlet');
  const [s, currencies, accounts, cats, rates] = await Promise.all([
    getSettingsMap(),
    listCurrencies(),
    listAccounts(),
    listCategories(),
    listRates(),
  ]);
  outlet.innerHTML = `
    <section class="page">
      <h2>Settings</h2>
      <form id="set-form" class="form">
        <div class="field"><label class="field__label" for="name">Profile name</label>
          <input class="input" id="name" name="profile" value="${escapeHtml(String(s.profileName || ''))}" /></div>
        <div class="field"><label class="field__label" for="ccy">Base currency</label>
          <select class="input" id="ccy">${currencies.map((c) => `<option ${c.code === s.baseCurrency ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div>
        <div class="field"><label class="field__label" for="theme">Theme</label>
          <select class="input" id="theme">
            ${Object.values(THEMES).map((t) => `<option ${s.theme === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field__label" for="df">Date format</label>
          <select class="input" id="df">
            ${['D MMM YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].map((f) => `<option ${s.dateFormat === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select></div>
        <div class="field"><label class="field__label" for="da">Default account</label>
          <select class="input" id="da"><option value="">—</option>${accounts.map((a) => `<option value="${a.id}" ${s.defaultAccountId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label class="field__label" for="dc">Default category</label>
          <select class="input" id="dc"><option value="">—</option>${cats.map((c) => `<option value="${c.id}" ${s.defaultCategoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <label class="chip"><input type="checkbox" id="large" ${s.largeText ? 'checked' : ''} /> Large text</label>
        <label class="chip"><input type="checkbox" id="hc" ${s.highContrast ? 'checked' : ''} /> High contrast</label>
        <label class="chip"><input type="checkbox" id="rm" ${s.reducedMotion ? 'checked' : ''} /> Reduced motion</label>
        <button type="submit" class="btn btn--primary">Save settings</button>
      </form>
      <h3>Exchange rates (manual)</h3>
      <p class="muted">No online FX. Rate = units of quote per 1 unit of base (e.g. INR per 1 AED).</p>
      <button type="button" class="btn btn--secondary" id="add-rate">Add rate</button>
      <ul>${rates.slice(0, 20).map((r) => `<li>${escapeHtml(r.date)} ${r.fromCurrency}→${r.toCurrency} = ${r.rate}</li>`).join('')}</ul>
      <h3>Masters</h3>
      <p><button type="button" class="btn btn--ghost" id="m-merch">Merchants</button>
      <button type="button" class="btn btn--ghost" id="m-tags">Tags</button>
      <button type="button" class="btn btn--ghost" id="m-people">People</button>
      <button type="button" class="btn btn--ghost" id="m-rules">Rules</button></p>
      <h3>Sample data</h3>
      <button type="button" class="btn btn--ghost" id="sample">Load sample data</button>
      <button type="button" class="btn btn--ghost" id="unsample">Remove sample data</button>
      <h3>Audit log</h3>
      <button type="button" class="btn btn--ghost" id="audit">Show audit</button>
      <button type="button" class="btn btn--ghost" id="audit-clear">Clear audit</button>
      <div id="audit-box"></div>
    </section>
  `;
  outlet.querySelector('#set-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await setSetting(SETTINGS_KEYS.PROFILE_NAME, outlet.querySelector('#name').value);
    await setBaseCurrency(outlet.querySelector('#ccy').value);
    await setTheme(outlet.querySelector('#theme').value);
    await setSetting(SETTINGS_KEYS.DATE_FORMAT, outlet.querySelector('#df').value);
    await setSetting(SETTINGS_KEYS.DEFAULT_ACCOUNT_ID, outlet.querySelector('#da').value);
    await setSetting(SETTINGS_KEYS.DEFAULT_CATEGORY_ID, outlet.querySelector('#dc').value);
    await setSetting(SETTINGS_KEYS.LARGE_TEXT, outlet.querySelector('#large').checked);
    await setSetting(SETTINGS_KEYS.HIGH_CONTRAST, outlet.querySelector('#hc').checked);
    await setSetting(SETTINGS_KEYS.REDUCED_MOTION, outlet.querySelector('#rm').checked);
    showToast('Settings saved', 'success');
  });
  outlet.querySelector('#add-rate')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'Manual FX rate',
      fieldsHtml: `<div class="field"><label>From</label><input class="input" name="from" value="AED" /></div>
        <div class="field"><label>To</label><input class="input" name="to" value="INR" /></div>
        <div class="field"><label>Date</label><input class="input" name="date" type="date" required /></div>
        <div class="field"><label>Rate</label><input class="input" name="rate" required /></div>`,
    });
    if (!fd) return;
    await saveRate(String(fd.get('from')), String(fd.get('to')), String(fd.get('date')), Number(fd.get('rate')));
    showToast('Rate saved', 'success');
    renderSettings();
  });
  outlet.querySelector('#sample')?.addEventListener('click', async () => {
    await loadSampleData();
    showToast('Sample data loaded — labelled SAMPLE', 'success');
  });
  outlet.querySelector('#unsample')?.addEventListener('click', async () => {
    await removeSampleData();
    showToast('Sample data removed', 'success');
  });
  outlet.querySelector('#audit')?.addEventListener('click', async () => {
    const rows = await listAudit();
    outlet.querySelector('#audit-box').innerHTML = `<ul>${rows.map((r) => `<li>${escapeHtml(r.createdAt)} ${escapeHtml(r.action)} ${escapeHtml(r.entity)}</li>`).join('')}</ul>`;
  });
  outlet.querySelector('#audit-clear')?.addEventListener('click', async () => {
    if (await confirmModal({ title: 'Clear audit log?', bodyHtml: '<p>Local history only.</p>', danger: true })) {
      await clearAudit();
      showToast('Audit cleared', 'success');
    }
  });
  outlet.querySelector('#m-merch')?.addEventListener('click', async () => {
    const list = await listMerchants();
    const fd = await formModal({
      title: 'New merchant',
      fieldsHtml: `<p class="muted">${list.length} merchants</p><div class="field"><label>Name</label><input class="input" name="name" required /></div>`,
    });
    if (fd) await saveMerchant({ name: String(fd.get('name')) });
  });
  outlet.querySelector('#m-tags')?.addEventListener('click', async () => {
    await listTags();
    const fd = await formModal({ title: 'New tag', fieldsHtml: `<input class="input" name="name" required placeholder="Tag name" />` });
    if (fd) await saveTag({ name: String(fd.get('name')) });
  });
  outlet.querySelector('#m-people')?.addEventListener('click', async () => {
    await listPeople();
    const fd = await formModal({
      title: 'Person',
      fieldsHtml: `<input class="input" name="name" required /><input class="input" name="relationship" placeholder="relationship" />`,
    });
    if (fd) await savePerson({ name: String(fd.get('name')), relationship: String(fd.get('relationship') || '') });
  });
  outlet.querySelector('#m-rules')?.addEventListener('click', async () => {
    const rules = await listRules();
    const fd = await formModal({
      title: 'Categorization rule',
      fieldsHtml: `<p>${rules.map((r) => escapeHtml(r.pattern)).join(', ') || 'None'}</p>
        <input class="input" name="pattern" placeholder="contains text" required />
        <select class="input" name="categoryId">${cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>`,
    });
    if (fd) await saveRule({ pattern: String(fd.get('pattern')), categoryId: String(fd.get('categoryId')), priority: 20 });
    void deleteRule;
  });
}

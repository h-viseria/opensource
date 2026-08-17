import { completeSetup, skipSetup, loadSampleData } from '../../services/seedService.js';
import { toMinor } from '../../utils/money.js';
import { ACCOUNT_TYPES } from '../../core/constants.js';
import { ACCOUNT_TYPE_LABELS } from '../../data/defaults.js';
import { listCurrencies } from '../../services/currencyService.js';
import { escapeHtml } from '../../utils/html.js';
import { showToast } from '../toast.js';
import * as router from '../../core/router.js';

export async function renderOnboarding() {
  const outlet = document.getElementById('outlet');
  const currencies = await listCurrencies();
  outlet.innerHTML = `
    <section class="page page--onboard">
      <p class="brand-mark">PicoExpense</p>
      <h1>Your money, on this device.</h1>
      <p class="lede">Your financial data stays on this device. No account. No cloud required.</p>
      <p class="muted"><a href="#/guide">Read the user guide</a> before you start, or after.</p>
      <form id="onboard" class="form">
        <div class="field"><label class="field__label" for="name">What should we call you?</label>
          <input class="input" id="name" name="name" required placeholder="Name" /></div>
        <div class="field"><label class="field__label" for="ccy">Base currency</label>
          <select class="input" id="ccy" name="currency">${currencies.map((c) => `<option ${c.code === 'AED' ? 'selected' : ''}>${c.code}</option>`).join('')}</select></div>
        <div class="field"><label class="field__label" for="country">Country / locale (optional)</label>
          <input class="input" id="country" name="country" placeholder="UAE" /></div>
        <div class="field"><label class="field__label" for="acct">First account</label>
          <input class="input" id="acct" name="account" required placeholder="Everyday account" /></div>
        <div class="field"><label class="field__label" for="type">Account type</label>
          <select class="input" id="type" name="type">${Object.keys(ACCOUNT_TYPES).map((k) => `<option value="${k}">${ACCOUNT_TYPE_LABELS[k]}</option>`).join('')}</select></div>
        <div class="field"><label class="field__label" for="open">Opening balance</label>
          <input class="input" id="open" name="opening" value="0" /></div>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">Start</button>
          <button type="button" class="btn btn--ghost" id="skip">Skip for now</button>
          <button type="button" class="btn btn--ghost" id="sample">Use sample data</button>
        </div>
      </form>
    </section>
  `;
  outlet.querySelector('#onboard')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const ccy = String(fd.get('currency'));
    try {
      await completeSetup({
        profileName: String(fd.get('name')),
        baseCurrency: ccy,
        country: String(fd.get('country') || ''),
        accountName: String(fd.get('account')),
        accountType: String(fd.get('type') || ACCOUNT_TYPES.BANK),
        openingMinor: toMinor(String(fd.get('opening') || '0'), ccy),
      });
      router.navigate('/home');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Setup failed', 'error');
    }
  });
  outlet.querySelector('#skip')?.addEventListener('click', async () => {
    await skipSetup();
    router.navigate('/home');
  });
  outlet.querySelector('#sample')?.addEventListener('click', async () => {
    await skipSetup();
    await loadSampleData();
    router.navigate('/home');
  });
}

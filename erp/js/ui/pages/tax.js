/**
 * Tax hub — masters and tax reports.
 */

import * as bookService from '../../services/bookService.js';
import * as taxService from '../../services/taxService.js';
import { escapeHtml } from '../modal.js';
import { formatMoney } from '../../utils/money.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderTax(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const stats = await taxService.getTaxHubStats(book.id);
  const payable = await taxService.taxPayableReport(book.id, {
    fromDate: '1900-01-01',
    toDate: '2999-12-31',
  });
  const currency = book.currency || 'INR';

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Tax</h1>
        <p class="page-header__desc">
          VAT / GST / Sales Tax for <strong>${escapeHtml(book.name)}</strong>.
          Tag voucher lines with a tax code; reports are computed live from those lines.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--primary" href="#/tax/codes">Tax codes</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Tax codes</div>
        <div class="stat-tile__value mono">${stats.activeCodes}</div>
        <div class="stat-tile__hint">${stats.codes} total · GST ${stats.byType.GST}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Tagged lines</div>
        <div class="stat-tile__value mono">${stats.taggedLines}</div>
        <div class="stat-tile__hint">On vouchers</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Output tax</div>
        <div class="stat-tile__value mono">${formatMoney(payable.totals.totalOutput, currency)}</div>
        <div class="stat-tile__hint">All time</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Net payable</div>
        <div class="stat-tile__value mono">${formatMoney(payable.totals.netPayable, currency)}</div>
        <div class="stat-tile__hint">Output − Input</div>
      </div>
    </div>

    <div class="master-grid">
      <a class="master-card" href="#/tax/codes">
        <div class="master-card__icon" aria-hidden="true">%</div>
        <div class="master-card__title">Tax codes</div>
        <div class="master-card__desc">VAT, GST, Sales Tax — rate, Input / Output, linked ledger</div>
        <div class="master-card__meta mono">${stats.codes} codes</div>
      </a>
      <a class="master-card" href="#/reports/tax-summary">
        <div class="master-card__icon" aria-hidden="true">▤</div>
        <div class="master-card__title">Tax summary</div>
        <div class="master-card__desc">Input and output totals by tax code</div>
      </a>
      <a class="master-card" href="#/reports/tax-ledger">
        <div class="master-card__icon" aria-hidden="true">≡</div>
        <div class="master-card__title">Tax ledger</div>
        <div class="master-card__desc">Every voucher line tagged with a tax code</div>
      </a>
      <a class="master-card" href="#/reports/tax-payable">
        <div class="master-card__icon" aria-hidden="true">◈</div>
        <div class="master-card__title">Tax payable</div>
        <div class="master-card__desc">Net tax due for a period (Output − Input)</div>
        <div class="master-card__meta mono">${formatMoney(payable.totals.netPayable, currency)}</div>
      </a>
    </div>
  `;
}

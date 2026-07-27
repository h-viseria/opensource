/**
 * Reports hub.
 */

import * as reportService from '../../services/reportService.js';
import { escapeHtml } from '../modal.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderReports(_ctx, outlet) {
  const range = await reportService.getDefaultRange();
  const { book } = range;

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Reports</h1>
        <p class="page-header__desc">
          Live statements for the <strong>active book</strong> (${escapeHtml(book.name)}).
          Totals come from that book&rsquo;s voucher lines only — not other books.
          See <a href="#/portfolio">Portfolio</a> for a cross-book overview.
        </p>
      </div>
    </div>

    <div class="master-grid">
      <a class="master-card" href="#/reports/trial-balance">
        <div class="master-card__icon">▤</div>
        <div class="master-card__title">Trial Balance</div>
        <div class="master-card__desc">Opening, period, and closing Dr/Cr for every ledger</div>
      </a>
      <a class="master-card" href="#/reports/profit-loss">
        <div class="master-card__icon">◈</div>
        <div class="master-card__title">Profit &amp; Loss</div>
        <div class="master-card__desc">Income minus expenses for the period</div>
      </a>
      <a class="master-card" href="#/reports/balance-sheet">
        <div class="master-card__icon">▣</div>
        <div class="master-card__title">Balance Sheet</div>
        <div class="master-card__desc">Assets = Liabilities + Equity (with period profit)</div>
      </a>
      <a class="master-card" href="#/reports/ledger">
        <div class="master-card__icon">≡</div>
        <div class="master-card__title">Ledger</div>
        <div class="master-card__desc">Running balance for a single account</div>
      </a>
      <a class="master-card" href="#/reports/ledger-detail">
        <div class="master-card__icon">⇄</div>
        <div class="master-card__title">Ledger detail</div>
        <div class="master-card__desc">Ledger with target account full path (Group:Sub:Account)</div>
      </a>
      <a class="master-card" href="#/reports/accounts-summary">
        <div class="master-card__icon">⧉</div>
        <div class="master-card__title">Accounts Summary</div>
        <div class="master-card__desc">Debits &amp; credits grouped by target account level</div>
      </a>
      <a class="master-card" href="#/reports/day-book">
        <div class="master-card__icon">☰</div>
        <div class="master-card__title">Day Book</div>
        <div class="master-card__desc">All vouchers in date order</div>
      </a>
      <a class="master-card" href="#/reports/cash-flow">
        <div class="master-card__icon">↔</div>
        <div class="master-card__title">Cash Flow</div>
        <div class="master-card__desc">Inflows and outflows on Cash &amp; Bank</div>
      </a>
      <a class="master-card" href="#/reports/stock-summary">
        <div class="master-card__icon">⬡</div>
        <div class="master-card__title">Stock Summary</div>
        <div class="master-card__desc">Quantity, weighted-average rate, and stock value</div>
      </a>
      <a class="master-card" href="#/reports/tax-summary">
        <div class="master-card__icon">%</div>
        <div class="master-card__title">Tax Summary</div>
        <div class="master-card__desc">Input and output tax by code for the period</div>
      </a>
      <a class="master-card" href="#/reports/tax-ledger">
        <div class="master-card__icon">≡</div>
        <div class="master-card__title">Tax Ledger</div>
        <div class="master-card__desc">Voucher lines tagged with a tax code</div>
      </a>
      <a class="master-card" href="#/reports/tax-payable">
        <div class="master-card__icon">◈</div>
        <div class="master-card__title">Tax Payable</div>
        <div class="master-card__desc">Net tax due (Output − Input)</div>
      </a>
      <a class="master-card" href="#/reports/net-worth">
        <div class="master-card__icon">▣</div>
        <div class="master-card__title">Net Worth</div>
        <div class="master-card__desc">Assets minus liabilities with allocation</div>
      </a>
      <a class="master-card" href="#/reports/budget-variance">
        <div class="master-card__icon">▤</div>
        <div class="master-card__title">Budget Variance</div>
        <div class="master-card__desc">Budgeted vs actual for the period</div>
      </a>
    </div>
  `;
}

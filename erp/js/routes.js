/**
 * Route registration - maps paths to page renderers.
 */

import * as router from './core/router.js';
import { renderDashboard } from './ui/pages/dashboard.js';
import { renderBooks } from './ui/pages/books.js';
import { renderSettings } from './ui/pages/settings.js';
import { renderDriveActivityCompare } from './ui/pages/driveActivityCompare.js';
import { renderMasters } from './ui/pages/masters.js';
import { renderChartOfAccounts } from './ui/pages/chartOfAccounts.js';
import { renderLedgerGroups } from './ui/pages/ledgerGroups.js';
import { renderLedgers } from './ui/pages/ledgers.js';
import { renderTransactions } from './ui/pages/transactions.js';
import { renderVoucherList } from './ui/pages/voucherList.js';
import { renderVoucherNew, renderVoucherDetail } from './ui/pages/voucherForm.js';
import { renderReports } from './ui/pages/reports.js';
import { renderTrialBalance } from './ui/pages/trialBalance.js';
import { renderProfitAndLoss } from './ui/pages/profitAndLoss.js';
import { renderBalanceSheet } from './ui/pages/balanceSheet.js';
import { renderLedgerReport } from './ui/pages/ledgerReport.js';
import { renderLedgerDetailReport } from './ui/pages/ledgerDetailReport.js';
import { renderAccountSummary } from './ui/pages/accountSummary.js';
import { renderDayBook } from './ui/pages/dayBook.js';
import { renderCashFlow } from './ui/pages/cashFlow.js';
import { renderPortfolio } from './ui/pages/portfolio.js';
import { renderInventory } from './ui/pages/inventory.js';
import { renderUnits } from './ui/pages/inventoryUnits.js';
import { renderItemCategories } from './ui/pages/inventoryCategories.js';
import { renderWarehouses } from './ui/pages/inventoryWarehouses.js';
import { renderInventoryItems } from './ui/pages/inventoryItems.js';
import { renderCatalogueTypes } from './ui/pages/catalogueTypes.js';
import { renderInventoryMovements } from './ui/pages/inventoryMovements.js';
import { renderInventoryMovementNew } from './ui/pages/inventoryMovementForm.js';
import { renderStockSummary } from './ui/pages/stockSummary.js';
import { renderTax } from './ui/pages/tax.js';
import { renderTaxCodes } from './ui/pages/taxCodes.js';
import { renderTaxSummary } from './ui/pages/taxSummary.js';
import { renderTaxLedger } from './ui/pages/taxLedger.js';
import { renderTaxPayable } from './ui/pages/taxPayable.js';
import { renderFinance } from './ui/pages/finance.js';
import { renderBudgets } from './ui/pages/budgets.js';
import { renderGoals } from './ui/pages/goals.js';
import { renderNetWorth } from './ui/pages/netWorth.js';
import { renderBudgetVariance } from './ui/pages/budgetVariance.js';
import { renderGnuCashImport } from './ui/pages/gnuCashImport.js';
import { renderInvoices } from './ui/pages/invoices.js';
import { renderInvoiceNew } from './ui/pages/invoiceForm.js';
import { renderInvoiceDetail } from './ui/pages/invoiceDetail.js';
import { renderInvoiceReturn } from './ui/pages/invoiceReturn.js';
import { renderInvoiceTemplates } from './ui/pages/invoiceTemplates.js';
import { renderUserGuide } from './ui/pages/userGuide.js';
import { renderBulkLoad } from './ui/pages/bulkLoad.js';
import { renderBankStatementImport } from './ui/pages/bankStatementImport.js';

/**
 * @param {HTMLElement} outlet
 * @param {{ onBookActivated?: () => void, onReset?: () => void, requireBook?: () => boolean }} hooks
 */
export function registerRoutes(outlet, hooks = {}) {
  const wrap = (fn) => async (ctx) => {
    await fn(ctx, outlet, hooks);
  };

  router.register('/portfolio', {
    title: 'Portfolio',
    requiresBook: false,
    render: wrap(renderPortfolio),
  });

  router.register('/dashboard', {
    title: 'Book dashboard',
    requiresBook: true,
    render: wrap(renderDashboard),
  });

  router.register('/books', {
    title: 'Books',
    requiresBook: false,
    render: wrap(async (ctx, el) => {
      await renderBooks(ctx, el, {
        gateMode: false,
        onBookActivated: hooks.onBookActivated,
      });
    }),
  });

  router.register('/settings', {
    title: 'Settings',
    requiresBook: false,
    render: wrap(async (ctx, el) => {
      await renderSettings(ctx, el, { onReset: hooks.onReset });
    }),
  });

  router.register('/settings/drive-activity', {
    title: 'Drive activity compare',
    requiresBook: false,
    render: wrap(renderDriveActivityCompare),
  });

  router.register('/guide', {
    title: 'User Guide',
    requiresBook: false,
    render: wrap(renderUserGuide),
  });

  router.register('/masters', {
    title: 'Masters',
    requiresBook: true,
    render: wrap(renderMasters),
  });

  router.register('/masters/chart', {
    title: 'Chart of Accounts',
    requiresBook: true,
    render: wrap(renderChartOfAccounts),
  });

  router.register('/masters/groups', {
    title: 'Ledger Groups',
    requiresBook: true,
    render: wrap(renderLedgerGroups),
  });

  router.register('/masters/ledgers', {
    title: 'Ledgers',
    requiresBook: true,
    render: wrap(renderLedgers),
  });

  router.register('/masters/gnucash-import', {
    title: 'GNUCash Import/Export',
    requiresBook: true,
    render: wrap(renderGnuCashImport),
  });

  router.register('/transactions', {
    title: 'Transactions',
    requiresBook: true,
    render: wrap(renderTransactions),
  });

  router.register('/transactions/list', {
    title: 'Vouchers',
    requiresBook: true,
    render: wrap(renderVoucherList),
  });

  // Register before /transactions/:id so "new" is not captured as an id
  router.register('/transactions/new/:type', {
    title: 'New voucher',
    requiresBook: true,
    render: wrap(renderVoucherNew),
  });

  router.register('/transactions/:id', {
    title: 'Voucher',
    requiresBook: true,
    render: wrap(renderVoucherDetail),
  });

  router.register('/invoices', {
    title: 'Invoices',
    requiresBook: true,
    render: wrap(renderInvoices),
  });

  router.register('/invoices/templates', {
    title: 'Invoice templates',
    requiresBook: true,
    render: wrap(renderInvoiceTemplates),
  });

  router.register('/invoices/new/:type', {
    title: 'New invoice',
    requiresBook: true,
    render: wrap(renderInvoiceNew),
  });

  router.register('/invoices/:id/return', {
    title: 'Return items',
    requiresBook: true,
    render: wrap(renderInvoiceReturn),
  });

  router.register('/invoices/:id', {
    title: 'Invoice',
    requiresBook: true,
    render: wrap(renderInvoiceDetail),
  });

  router.register('/reports', {
    title: 'Reports',
    requiresBook: true,
    render: wrap(renderReports),
  });

  router.register('/reports/trial-balance', {
    title: 'Trial Balance',
    requiresBook: true,
    render: wrap(renderTrialBalance),
  });

  router.register('/reports/profit-loss', {
    title: 'Profit & Loss',
    requiresBook: true,
    render: wrap(renderProfitAndLoss),
  });

  router.register('/reports/balance-sheet', {
    title: 'Balance Sheet',
    requiresBook: true,
    render: wrap(renderBalanceSheet),
  });

  router.register('/reports/ledger', {
    title: 'Ledger',
    requiresBook: true,
    render: wrap(renderLedgerReport),
  });

  router.register('/reports/ledger-detail', {
    title: 'Ledger detail',
    requiresBook: true,
    render: wrap(renderLedgerDetailReport),
  });

  router.register('/reports/accounts-summary', {
    title: 'Accounts Summary',
    requiresBook: true,
    render: wrap(renderAccountSummary),
  });

  router.register('/reports/day-book', {
    title: 'Day Book',
    requiresBook: true,
    render: wrap(renderDayBook),
  });

  router.register('/reports/cash-flow', {
    title: 'Cash Flow',
    requiresBook: true,
    render: wrap(renderCashFlow),
  });

  router.register('/reports/stock-summary', {
    title: 'Stock Summary',
    requiresBook: true,
    render: wrap(renderStockSummary),
  });

  router.register('/bulk-load', {
    title: 'Bulk Load',
    requiresBook: true,
    render: wrap(renderBulkLoad),
  });

  router.register('/bulk-load/bank-statement', {
    title: 'Bank Statement',
    requiresBook: true,
    render: wrap(renderBankStatementImport),
  });

  router.register('/inventory', {
    title: 'Inventory',
    requiresBook: true,
    render: wrap(renderInventory),
  });

  router.register('/inventory/units', {
    title: 'Units',
    requiresBook: true,
    render: wrap(renderUnits),
  });

  router.register('/inventory/categories', {
    title: 'Item categories',
    requiresBook: true,
    render: wrap(renderItemCategories),
  });

  router.register('/inventory/warehouses', {
    title: 'Warehouses',
    requiresBook: true,
    render: wrap(renderWarehouses),
  });

  router.register('/inventory/items', {
    title: 'Items',
    requiresBook: true,
    render: wrap(renderInventoryItems),
  });

  router.register('/inventory/catalogue', {
    title: 'Catalogue',
    requiresBook: true,
    render: wrap(renderCatalogueTypes),
  });

  router.register('/inventory/movements', {
    title: 'Stock movements',
    requiresBook: true,
    render: wrap(renderInventoryMovements),
  });

  router.register('/inventory/movements/new', {
    title: 'New stock movement',
    requiresBook: true,
    render: wrap(renderInventoryMovementNew),
  });

  router.register('/tax', {
    title: 'Tax',
    requiresBook: true,
    render: wrap(renderTax),
  });

  router.register('/tax/codes', {
    title: 'Tax codes',
    requiresBook: true,
    render: wrap(renderTaxCodes),
  });

  router.register('/reports/tax-summary', {
    title: 'Tax Summary',
    requiresBook: true,
    render: wrap(renderTaxSummary),
  });

  router.register('/reports/tax-ledger', {
    title: 'Tax Ledger',
    requiresBook: true,
    render: wrap(renderTaxLedger),
  });

  router.register('/reports/tax-payable', {
    title: 'Tax Payable',
    requiresBook: true,
    render: wrap(renderTaxPayable),
  });

  router.register('/finance', {
    title: 'Personal finance',
    requiresBook: true,
    render: wrap(renderFinance),
  });

  router.register('/finance/budgets', {
    title: 'Budgets',
    requiresBook: true,
    render: wrap(renderBudgets),
  });

  router.register('/finance/goals', {
    title: 'Goals',
    requiresBook: true,
    render: wrap(renderGoals),
  });

  router.register('/reports/net-worth', {
    title: 'Net Worth',
    requiresBook: true,
    render: wrap(renderNetWorth),
  });

  router.register('/reports/budget-variance', {
    title: 'Budget Variance',
    requiresBook: true,
    render: wrap(renderBudgetVariance),
  });

  router.registerNotFound({
    title: 'Not found',
    render: async () => {
      outlet.innerHTML = [
        '<div class="page-header"><div>',
        '<h1 class="page-header__title">Page not found</h1>',
        '<p class="page-header__desc">That route does not exist.</p>',
        '</div></div>',
        '<p><a href="#/portfolio">Back to portfolio</a></p>',
      ].join('');
    },
  });

  router.setBeforeNavigate(async (ctx) => {
    if (ctx.route.requiresBook && hooks.requireBook && !hooks.requireBook()) {
      showToastIfAvailable('Select a book first — use the Active book menu or Portfolio');
      router.navigate('/portfolio', { replace: true });
      return false;
    }
    return true;
  });
}

function showToastIfAvailable(message) {
  import('./ui/toast.js')
    .then((m) => m.showToast(message, 'info'))
    .catch(() => {});
}
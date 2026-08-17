import * as router from './core/router.js';
import { renderDashboard } from './ui/pages/dashboard.js';
import { renderTransactions, renderTransactionDetail, renderAdd } from './ui/pages/transactions.js';
import { renderAccounts } from './ui/pages/accounts.js';
import { renderCategories } from './ui/pages/categories.js';
import { renderBudgets } from './ui/pages/budgets.js';
import { renderGoals } from './ui/pages/goals.js';
import { renderReports, renderMonthly, renderAnnual } from './ui/pages/reports.js';
import { renderImport } from './ui/pages/importPage.js';
import { renderBackup } from './ui/pages/backup.js';
import { renderSettings } from './ui/pages/settings.js';
import { renderPrivacy } from './ui/pages/privacy.js';
import { renderOnboarding } from './ui/pages/onboarding.js';
import { renderOcrReview } from './ui/pages/ocrReview.js';
import { renderMore, renderTrash, renderNotFound } from './ui/pages/more.js';
import { renderUserGuide } from './ui/pages/userGuide.js';
import { isSetupComplete } from './services/seedService.js';

export function registerRoutes() {
  router.register('/home', { title: 'Home', render: renderDashboard });
  router.register('/transactions', { title: 'Transactions', render: renderTransactions });
  router.register('/transactions/:id', { title: 'Transaction', render: renderTransactionDetail });
  router.register('/add', { title: 'Add transaction', render: renderAdd });
  router.register('/accounts', { title: 'Accounts', render: renderAccounts });
  router.register('/categories', { title: 'Categories', render: renderCategories });
  router.register('/budgets', { title: 'Budgets', render: renderBudgets });
  router.register('/goals', { title: 'Goals', render: renderGoals });
  router.register('/reports', { title: 'Reports', render: renderReports });
  router.register('/monthly', { title: 'Monthly', render: renderMonthly });
  router.register('/annual', { title: 'Annual', render: renderAnnual });
  router.register('/import', { title: 'Import', render: renderImport });
  router.register('/backup', { title: 'Backup', render: renderBackup });
  router.register('/settings', { title: 'Settings', render: renderSettings });
  router.register('/privacy', { title: 'Privacy', render: renderPrivacy });
  router.register('/guide', { title: 'User guide', render: renderUserGuide });
  router.register('/setup', { title: 'Setup', render: renderOnboarding });
  router.register('/ocr-review', { title: 'Scan receipt', render: renderOcrReview });
  router.register('/more', { title: 'More', render: renderMore });
  router.register('/trash', { title: 'Trash', render: renderTrash });
  router.registerNotFound({ title: 'Not found', render: renderNotFound });

  router.setBeforeNavigate(async (ctx) => {
    if (ctx.path === '/setup' || ctx.path === '/guide') return true;
    const done = await isSetupComplete();
    if (!done) {
      router.navigate('/setup', { replace: true });
      return false;
    }
    return true;
  });
}

/**
 * app.js — Entry point: wires all modules together
 */

import { openDB } from './db.js';
import { renderAccountTree } from './ui-accounts.js';
import { renderLedger } from './ui-transactions.js';
import { initImport } from './import.js';
import { initGeneralLedgerExport } from './export-ledger.js';
import { initHdfcImport, populateHdfcAccountDropdown } from './import-hdfc.js';
import { initGnuCashImport } from './import-gnucash.js';
import { renderUpdateCoaTab } from './ui-update-coa.js';
import { renderUpdateTransactionsTab } from './ui-update-transactions.js';
import { getAll } from './db.js';
import { collectFinancialYears, setSelectedFinancialYear, getSelectedFinancialYear } from './fiscal-year.js';

let reportsModule = null;

async function init() {
    await openDB();
    await initFinancialYearFilter();

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            refreshCurrentView(btn.dataset.tab);
        });
    });

    // Import handlers
    initImport(onDataChanged);
    initGnuCashImport(onDataChanged);
    initGeneralLedgerExport();
    initHdfcImport(onDataChanged);

    document.getElementById('hdfc-refresh-accounts')?.addEventListener('click', () => {
        populateHdfcAccountDropdown();
    });

    // Initial render
    await refreshCurrentView('tab-dashboard');
}

async function refreshDashboard() {
    // Hide ledger panel when tree refreshes
    const panel = document.getElementById('ledger-panel');
    if (panel) panel.style.display = 'none';

    await renderAccountTree((shortCode) => {
        renderLedger(shortCode);
    });
}

async function initFinancialYearFilter() {
    const select = document.getElementById('fy-filter-select');
    if (!select) return;

    await refreshFinancialYearOptions();

    select.addEventListener('change', async () => {
        setSelectedFinancialYear(select.value);
        await refreshCurrentView(getActiveTabId());
    });
}

async function refreshFinancialYearOptions() {
    const select = document.getElementById('fy-filter-select');
    if (!select) return;

    const transactions = await getAll('transactions');
    const years = collectFinancialYears(transactions);
    const prev = getSelectedFinancialYear() || select.value || '';

    select.innerHTML = '<option value="">All</option>';
    years.forEach((fy) => {
        const opt = document.createElement('option');
        opt.value = fy;
        opt.textContent = `${fy} (01-Apr-${fy.slice(0, 4)} to 31-Mar-${fy.slice(5)})`;
        select.appendChild(opt);
    });

    if (prev && years.includes(prev)) {
        select.value = prev;
    } else {
        select.value = '';
    }
    setSelectedFinancialYear(select.value);
}

async function onDataChanged() {
    await refreshFinancialYearOptions();
    await refreshCurrentView(getActiveTabId());
}

async function refreshCurrentView(tabId) {
    switch (tabId) {
        case 'tab-dashboard':
            await refreshDashboard();
            break;
        case 'tab-reports':
            await renderReportsSafe();
            break;
        case 'tab-import':
            await populateHdfcAccountDropdown();
            break;
        case 'tab-update-coa':
            await renderUpdateCoaTab();
            break;
        case 'tab-update-transactions':
            await renderUpdateTransactionsTab();
            break;
        default:
            break;
    }
}

function getActiveTabId() {
    const activeBtn = document.querySelector('.tab-btn.active');
    return activeBtn ? activeBtn.dataset.tab : 'tab-dashboard';
}

async function renderReportsSafe() {
    const mod = await loadReportsModule(false);
    if (mod && typeof mod.renderReportsTab === 'function') {
        await mod.renderReportsTab();
        return;
    }

    const root = document.getElementById('reports-root');
    if (root) {
        root.innerHTML = `
            <p class="empty-state">Reports module did not load correctly.</p>
            <div class="button-row">
                <button id="btn-force-reload-reports" class="btn">Force Reload Reports Module</button>
            </div>
            <p class="hint">If needed, use Ctrl+F5 once after clicking this button.</p>
        `;

        document.getElementById('btn-force-reload-reports')?.addEventListener('click', async () => {
            const reloaded = await loadReportsModule(true);
            if (reloaded && typeof reloaded.renderReportsTab === 'function') {
                await reloaded.renderReportsTab();
            } else {
                const err = document.createElement('p');
                err.className = 'status-msg error';
                err.textContent = 'Reports module still failed to load. Please use Ctrl+F5 and reopen Reports.';
                root.appendChild(err);
            }
        });
    }
}

async function loadReportsModule(forceReload) {
    if (!forceReload && reportsModule) {
        return reportsModule;
    }

    try {
        // First attempt: regular module path.
        reportsModule = await import('./ui-reports.js');
        if (typeof reportsModule.renderReportsTab === 'function') {
            return reportsModule;
        }
    } catch (_e) {
        // Fallback attempt below.
    }

    try {
        // Force bypass cached module graph.
        reportsModule = await import(`./ui-reports.js?v=${Date.now()}`);
        return reportsModule;
    } catch (_e2) {
        return null;
    }
}

let initialized = false;

async function initOnce() {
    if (initialized) return;
    initialized = true;
    await init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnce);
} else {
    // Module may load after DOMContentLoaded; initialize immediately in that case.
    initOnce();
}


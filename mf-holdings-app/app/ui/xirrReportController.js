import { buildXirrReportRows } from '../application/services/xirrReportService.js';
import { clearAllTransactions, getAllTransactions, replaceTransactions } from '../infrastructure/db/transactionsIndexedDb.js';
import { formatNumber, formatPercent } from '../shared/formatters.js';

let allXirrRows = [];
let xirrSortState = { key: 'xirrPct', direction: 'desc' };

const XIRR_COLUMNS = [
    { key: 'amcName', type: 'text' },
    { key: 'schemeName', type: 'text' },
    { key: 'schemeCode', type: 'text' },
    { key: 'firstPurchaseDate', type: 'text' },
    { key: 'lastTransactionDate', type: 'text' },
    { key: 'transactionCount', type: 'number' },
    { key: 'investedInFlows', type: 'number' },
    { key: 'redeemedInFlows', type: 'number' },
    { key: 'currentValue', type: 'number' },
    { key: 'xirrPct', type: 'number' },
    { key: 'statusLabel', type: 'text' },
];

function getComparableValue(row, key, type) {
    const value = row[key];
    if (type === 'number') {
        return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
    }
    return String(value ?? '').toLowerCase();
}

function formatXirrCell(row, key) {
    if (key === 'investedInFlows' || key === 'redeemedInFlows' || key === 'currentValue') {
        return formatNumber(row[key]);
    }
    if (key === 'xirrPct') {
        return formatPercent(row[key]);
    }
    if (key === 'transactionCount') {
        return String(row[key] ?? 0);
    }
    return String(row[key] ?? '-');
}

function getVisibleXirrRows(rows) {
    let nextRows = [...rows];

    if (xirrSortState.key) {
        const column = XIRR_COLUMNS.find((item) => item.key === xirrSortState.key);
        const directionFactor = xirrSortState.direction === 'asc' ? 1 : -1;
        nextRows.sort((a, b) => {
            const aValue = getComparableValue(a, xirrSortState.key, column?.type || 'text');
            const bValue = getComparableValue(b, xirrSortState.key, column?.type || 'text');
            if (aValue < bValue) {
                return -1 * directionFactor;
            }
            if (aValue > bValue) {
                return 1 * directionFactor;
            }
            return 0;
        });
    }

    return nextRows;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderXirrTotals(rows) {
    const totalsEl = document.getElementById('xirr-report-totals');
    if (!totalsEl) {
        return;
    }

    const validRows = rows.filter((row) => Number.isFinite(row.xirrPct));
    const investedTotal = rows.reduce((sum, row) => sum + (Number.isFinite(row.investedInFlows) ? row.investedInFlows : 0), 0);
    const currentTotal = rows.reduce((sum, row) => sum + (Number.isFinite(row.currentValue) ? row.currentValue : 0), 0);

    totalsEl.innerHTML = `
        <div class="totals-card">
            <div class="totals-card-label">Schemes with Transactions</div>
            <div class="totals-card-value">${rows.length}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Schemes with XIRR</div>
            <div class="totals-card-value">${validRows.length}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Invested (Flows)</div>
            <div class="totals-card-value">${formatNumber(investedTotal)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Current Value</div>
            <div class="totals-card-value">${formatNumber(currentTotal)}</div>
        </div>
    `;
}

export function renderXirrReport() {
    const tableBody = document.getElementById('xirr-table-body');
    if (!tableBody) {
        return;
    }

    const visibleRows = getVisibleXirrRows(allXirrRows);
    tableBody.innerHTML = visibleRows
        .map((row) => `
            <tr>
                <td>${escapeHtml(row.amcName)}</td>
                <td>${escapeHtml(row.schemeName)}</td>
                <td>${escapeHtml(row.schemeCode)}</td>
                <td>${escapeHtml(row.firstPurchaseDate || '-')}</td>
                <td>${escapeHtml(row.lastTransactionDate || '-')}</td>
                <td class="numeric">${formatXirrCell(row, 'transactionCount')}</td>
                <td class="numeric">${formatXirrCell(row, 'investedInFlows')}</td>
                <td class="numeric">${formatXirrCell(row, 'redeemedInFlows')}</td>
                <td class="numeric">${formatXirrCell(row, 'currentValue')}</td>
                <td class="numeric">${formatXirrCell(row, 'xirrPct')}</td>
                <td title="${escapeHtml(row.periodWarning || '')}">${escapeHtml(row.statusLabel)}</td>
            </tr>
        `)
        .join('');

    renderXirrTotals(allXirrRows);
}

export async function refreshXirrReport() {
    allXirrRows = await buildXirrReportRows();
    renderXirrReport();
    return allXirrRows;
}

export function getXirrRowsForExport() {
    return getVisibleXirrRows(allXirrRows);
}

export async function getTransactionMetricCount() {
    const transactions = await getAllTransactions();
    return transactions.length;
}

export async function clearTransactionsData() {
    await clearAllTransactions();
    allXirrRows = [];
    renderXirrReport();
}


export async function readTransactionsForExport() {
    return getAllTransactions();
}

export async function restoreTransactionsFromDump(dump) {
    const transactions = Array.isArray(dump.transactions) ? dump.transactions : [];
    const metadata = dump.transactionMetadata || null;
    await replaceTransactions(
        transactions.map(({ id, importMetadata, ...rest }) => rest),
        metadata || { restoredAt: new Date().toISOString() }
    );
}

function setupXirrColumnControls() {
    const headerCells = Array.from(document.querySelectorAll('thead th[data-xirr-col]'));
    headerCells.forEach((th) => {
        if (th.dataset.enhanced === '1') {
            return;
        }

        const columnKey = th.dataset.xirrCol;
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        th.appendChild(indicator);

        th.addEventListener('click', () => {
            if (xirrSortState.key === columnKey) {
                xirrSortState.direction = xirrSortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                xirrSortState.key = columnKey;
                xirrSortState.direction = columnKey === 'schemeName' || columnKey === 'amcName' ? 'asc' : 'desc';
            }

            headerCells.forEach((cell) => {
                const cellIndicator = cell.querySelector('.sort-indicator');
                if (cellIndicator) {
                    cellIndicator.textContent = cell.dataset.xirrCol === xirrSortState.key
                        ? (xirrSortState.direction === 'asc' ? '↑' : '↓')
                        : '';
                }
            });

            renderXirrReport();
        });

        th.dataset.enhanced = '1';
    });
}

export function initXirrReportController({ activateReportView }) {
    const xirrButton = document.getElementById('report-view-xirr-btn');
    const xirrPanel = document.getElementById('xirr-report-panel');
    const refreshXirrButton = document.getElementById('refresh-xirr-btn');

    if (xirrButton && activateReportView) {
        xirrButton.addEventListener('click', () => {
            activateReportView('xirr');
            renderXirrReport();
        });
    }

    if (refreshXirrButton) {
        refreshXirrButton.addEventListener('click', async () => {
            await refreshXirrReport();
        });
    }

    if (xirrPanel) {
        setupXirrColumnControls();
    }
}

/**
 * ui-cashflow-report.js - Cashflow Summary Report renderer
 * Shows opening balance, incoming, outgoing, and closing balance per selected account
 * for a given date range.
 */

import { getAll } from './db.js';
import { formatCurrency, parseDate } from './models.js';
import { getSelectedFinancialYear } from './fiscal-year.js';
import * as reportsCore from './reports-core.js';

let selectedAccountCodes = new Set();
let startDateValue = '';
let endDateValue = '';

export async function renderCashflowReportTab() {
    const root = document.getElementById('cashflow-root');
    if (!root) return;

    const [accounts, transactions] = await Promise.all([
        getAll('accounts'),
        getAll('transactions'),
    ]);

    if (!accounts.length) {
        root.innerHTML = '<p class="empty-state">No accounts found. Import Chart of Accounts first.</p>';
        return;
    }

    // Initialize selected accounts to all on first load
    if (selectedAccountCodes.size === 0) {
        accounts.forEach(a => selectedAccountCodes.add(a.shortCode));
    }

    // Set default dates if not set
    if (!startDateValue) {
        startDateValue = getDefaultStartDate();
    }
    if (!endDateValue) {
        endDateValue = getDefaultEndDate();
    }

    const accountMap = Object.fromEntries(accounts.map(a => [a.shortCode, a]));

    root.innerHTML = `
        <div class="panel">
            <h2>Cashflow Summary Report</h2>
            <p class="hint">Select accounts and date range to view opening balance, incoming transactions, outgoing transactions, and closing balance.</p>
            
            <div class="cashflow-filters">
                <div class="filter-row">
                    <label>Start Date:
                        <input type="date" id="cashflow-start-date" class="cashflow-date-input" value="${startDateValue}">
                    </label>
                    <label>End Date:
                        <input type="date" id="cashflow-end-date" class="cashflow-date-input" value="${endDateValue}">
                    </label>
                </div>
                
                <div class="filter-row">
                    <button id="cashflow-select-all" class="btn btn-secondary" type="button">Select All Accounts</button>
                    <button id="cashflow-clear-all" class="btn btn-secondary" type="button">Clear All Accounts</button>
                </div>

                <div class="cashflow-account-selector">
                    <label><strong>Select Accounts:</strong></label>
                    <div id="cashflow-account-list"></div>
                </div>
            </div>

            <div class="button-row">
                <button id="cashflow-refresh-report" class="btn" type="button">Refresh Report</button>
                <button id="cashflow-export-xls" class="btn" type="button">Export (XLS)</button>
                <button id="cashflow-export-pdf" class="btn" type="button">Export (PDF)</button>
            </div>

            <div id="cashflow-status" class="status-msg"></div>
            <div id="cashflow-report-content"></div>
        </div>
    `;

    // Render account selector
    renderAccountSelector(root, accounts);

    // Bind event listeners
    bindCashflowEvents(root, accounts, transactions, accountMap);

    // Render initial report
    await renderReport(root, accounts, transactions, accountMap);
}

function renderAccountSelector(root, accounts) {
    const container = root.querySelector('#cashflow-account-list');
    if (!container) return;

    const html = accounts.map(acc => `
        <label class="cashflow-account-option">
            <input type="checkbox" data-code="${escHtml(acc.shortCode)}" ${selectedAccountCodes.has(acc.shortCode) ? 'checked' : ''}>
            <span><code>${escHtml(acc.shortCode)}</code> - ${escHtml(acc.name)}</span>
        </label>
    `).join('');

    container.innerHTML = html;
}

function bindCashflowEvents(root, accounts, transactions, accountMap) {
    // Account selector checkboxes
    root.querySelectorAll('.cashflow-account-option input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const code = e.target.dataset.code;
            if (e.target.checked) {
                selectedAccountCodes.add(code);
            } else {
                selectedAccountCodes.delete(code);
            }
        });
    });

    // Select All / Clear All
    root.querySelector('#cashflow-select-all')?.addEventListener('click', () => {
        accounts.forEach(a => selectedAccountCodes.add(a.shortCode));
        renderAccountSelector(root, accounts);
    });

    root.querySelector('#cashflow-clear-all')?.addEventListener('click', () => {
        selectedAccountCodes.clear();
        renderAccountSelector(root, accounts);
    });

    // Date inputs
    root.querySelector('#cashflow-start-date')?.addEventListener('change', (e) => {
        startDateValue = e.target.value;
    });

    root.querySelector('#cashflow-end-date')?.addEventListener('change', (e) => {
        endDateValue = e.target.value;
    });

    // Refresh Report
    root.querySelector('#cashflow-refresh-report')?.addEventListener('click', async () => {
        await renderReport(root, accounts, transactions, accountMap);
    });

    // Export XLS
    root.querySelector('#cashflow-export-xls')?.addEventListener('click', () => {
        try {
            exportCashflowAsXls();
            setCashflowStatus('success', 'XLS exported successfully.');
        } catch (err) {
            setCashflowStatus('error', `Export failed: ${err?.message || err}`);
        }
    });

    // Export PDF
    root.querySelector('#cashflow-export-pdf')?.addEventListener('click', () => {
        try {
            exportCashflowAsPdf();
            setCashflowStatus('success', 'PDF exported successfully.');
        } catch (err) {
            setCashflowStatus('error', `Export failed: ${err?.message || err}`);
        }
    });
}

async function renderReport(root, accounts, transactions, accountMap) {
    const contentDiv = root.querySelector('#cashflow-report-content');
    if (!contentDiv) return;

    if (selectedAccountCodes.size === 0) {
        contentDiv.innerHTML = '<p class="empty-state">No accounts selected. Select at least one account to view the report.</p>';
        return;
    }

    if (!startDateValue || !endDateValue) {
        contentDiv.innerHTML = '<p class="empty-state">Please set both start and end dates.</p>';
        return;
    }

    try {
        const startDate = parseISODate(startDateValue);
        const endDate = parseISODate(endDateValue);

        if (!startDate || !endDate) {
            contentDiv.innerHTML = '<p class="empty-state">Invalid date format. Please use YYYY-MM-DD.</p>';
            return;
        }

        if (startDate > endDate) {
            contentDiv.innerHTML = '<p class="empty-state">Start date must be before or equal to end date.</p>';
            return;
        }

        const report = reportsCore.buildCashflowReport({
            accountCodes: Array.from(selectedAccountCodes),
            startDate,
            endDate,
            accounts,
            transactions,
            financialYear: getSelectedFinancialYear(),
        });

        if (!report || !report.accountRows || report.accountRows.length === 0) {
            contentDiv.innerHTML = '<p class="empty-state">No data found for selected accounts and date range.</p>';
            return;
        }

        contentDiv.innerHTML = renderCashflowTable(report, accountMap);
    } catch (err) {
        contentDiv.innerHTML = `<p class="empty-state">Error generating report: ${escHtml(err?.message || 'Unknown error')}</p>`;
    }
}

function renderCashflowTable(report, accountMap) {
    const { reportPeriod, summary, accountRows } = report;

    const periodStr = `${formatDateForDisplay(reportPeriod.startDate)} to ${formatDateForDisplay(reportPeriod.endDate)}`;

    let html = `
        <p class="hint">Period: ${escHtml(periodStr)}</p>
        
        <div class="kpi-row" style="margin-bottom:16px">
            <div class="kpi-card">
                <h3>Total Incoming</h3>
                <p class="kpi-value">${formatCurrency(summary.totalIncoming)}</p>
            </div>
            <div class="kpi-card">
                <h3>Total Outgoing</h3>
                <p class="kpi-value">${formatCurrency(summary.totalOutgoing)}</p>
            </div>
            <div class="kpi-card">
                <h3>Net Cashflow</h3>
                <p class="kpi-value" style="color:${summary.netCashflow >= 0 ? '#10b981' : '#ef4444'}">${formatCurrency(summary.netCashflow)}</p>
            </div>
        </div>

        <div class="table-scroll">
            <table class="cashflow-table report-table">
                <thead>
                    <tr>
                        <th>Account</th>
                        <th>Short Code</th>
                        <th class="num">Opening Balance</th>
                        <th class="num">Incoming</th>
                        <th class="num">Outgoing</th>
                        <th class="num">Closing Balance</th>
                    </tr>
                </thead>
                <tbody>
    `;

    accountRows.forEach(row => {
        const account = accountMap[row.shortCode];
        const accountName = account ? escHtml(account.name) : escHtml(row.shortCode);
        
        html += `
            <tr>
                <td>${accountName}</td>
                <td><code>${escHtml(row.shortCode)}</code></td>
                <td class="num">${formatCurrency(row.openingBalance)}</td>
                <td class="num">${formatCurrency(row.incomingTotal)}</td>
                <td class="num">${formatCurrency(row.outgoingTotal)}</td>
                <td class="num"><strong>${formatCurrency(row.closingBalance)}</strong></td>
            </tr>
        `;
    });

    html += `
                </tbody>
                <tfoot>
                    <tr style="border-top: 2px solid #cfd8ea; font-weight: bold;">
                        <td colspan="2">TOTALS</td>
                        <td class="num">${formatCurrency(summary.totalOpeningBalance)}</td>
                        <td class="num">${formatCurrency(summary.totalIncoming)}</td>
                        <td class="num">${formatCurrency(summary.totalOutgoing)}</td>
                        <td class="num">${formatCurrency(summary.totalClosingBalance)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;

    return html;
}

function exportCashflowAsXls() {
    const contentDiv = document.getElementById('cashflow-report-content');
    if (!contentDiv) throw new Error('Report content not found.');

    const periodStart = startDateValue || 'N/A';
    const periodEnd = endDateValue || 'N/A';

    const html = `
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 16px; }
                h2 { margin-bottom: 4px; }
                p { margin: 4px 0; font-size: 12px; }
                table { border-collapse: collapse; width: 100%; margin-top: 12px; margin-bottom: 12px; }
                th, td { border: 1px solid #cfd8ea; padding: 8px; text-align: left; }
                th { background-color: #f3f4f6; font-weight: bold; }
                td.num { text-align: right; }
                tfoot tr { border-top: 2px solid #000; font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>Cashflow Summary Report</h2>
            <p><strong>Period:</strong> ${escHtml(periodStart)} to ${escHtml(periodEnd)}</p>
            <p><strong>Generated At:</strong> ${new Date().toLocaleString()}</p>
            ${contentDiv.innerHTML}
        </body>
        </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashflow-report-${startDateValue}-${endDateValue}.xls`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportCashflowAsPdf() {
    const contentDiv = document.getElementById('cashflow-report-content');
    if (!contentDiv) throw new Error('Report content not found.');

    const jspdfRef = window.jspdf;
    if (!jspdfRef || !jspdfRef.jsPDF) {
        throw new Error('jsPDF not loaded.');
    }

    const doc = new jspdfRef.jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = margin;

    // Title
    doc.setFontSize(14);
    doc.text('Cashflow Summary Report', margin, y);
    y += 18;

    // Period info
    doc.setFontSize(10);
    doc.text(`Period: ${startDateValue || 'N/A'} to ${endDateValue || 'N/A'}`, margin, y);
    y += 12;
    doc.text(`Generated At: ${new Date().toLocaleString()}`, margin, y);
    y += 16;

    // KPI cards
    const kpiContent = contentDiv.querySelector('.kpi-row');
    if (kpiContent) {
        doc.setFontSize(10);
        const kpis = kpiContent.querySelectorAll('.kpi-card');
        kpis.forEach((kpi, idx) => {
            const h3 = kpi.querySelector('h3')?.textContent || '';
            const p = kpi.querySelector('p')?.textContent || '';
            const xOffset = margin + (idx * 150);
            doc.text(h3, xOffset, y);
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text(p, xOffset, y + 12);
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);
        });
        y += 40;
    }

    // Table
    const table = contentDiv.querySelector('table');
    if (table) {
        const head = [Array.from(table.querySelectorAll('thead th')).map((th) => normalizeText(th.textContent || ''))];
        const body = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
            Array.from(tr.querySelectorAll('td')).map((td) => normalizeText(td.textContent || ''))
        );
        const foot = Array.from(table.querySelectorAll('tfoot tr')).map((tr) =>
            Array.from(tr.querySelectorAll('td')).map((td) => normalizeText(td.textContent || ''))
        );

        if (typeof doc.autoTable === 'function') {
            doc.autoTable({
                head,
                body: [...body, ...foot],
                startY: y,
                margin: { left: margin, right: margin },
                styles: { fontSize: 8, cellPadding: 4 },
                headStyles: { fillColor: [37, 99, 235] },
                footStyles: { fillColor: [243, 244, 246], fontStyle: 'bold' },
            });
        }
    }

    doc.save(`cashflow-report-${startDateValue}-${endDateValue}.pdf`);
}

function setCashflowStatus(type, message) {
    const el = document.getElementById('cashflow-status');
    if (!el) return;
    el.className = `status-msg ${type || ''}`;
    el.textContent = message || '';
    setTimeout(() => {
        el.textContent = '';
        el.className = 'status-msg';
    }, 4000);
}

function getDefaultStartDate() {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
    return toISODateString(firstDayOfYear);
}

function getDefaultEndDate() {
    return toISODateString(new Date());
}

function toISODateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseISODate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr + 'T00:00:00Z');
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateForDisplay(date) {
    if (!date) return 'N/A';
    const opts = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', opts);
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

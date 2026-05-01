/**
 * ui-reports.js - Unified Reports tab renderer.
 */

import { buildAccountTree } from './accounts.js';
import { getAll } from './db.js';
import { formatCurrency } from './models.js';
import { getSelectedFinancialYear } from './fiscal-year.js';
import * as reportsCore from './reports-core.js';

const REPORTS = [
    { key: 'trial', label: 'Trial Balance' },
    { key: 'pl', label: 'P & L Report' },
    { key: 'asset-class', label: 'Asset Classification' },
    { key: 'balance-sheet', label: 'Balance Sheet' },
    { key: 'income-statement', label: 'Income Statement' },
    { key: 'asset-pie', label: 'Asset Pie Chart' },
    { key: 'bank-summary', label: 'Bank Account Summary' },
];

let selectedReport = 'trial';
let selectedAccountCodes = new Set();
let selectedLevel = 'all';
let initializedSelection = false;

export async function renderReportsTab() {
    const root = document.getElementById('reports-root');
    if (!root) return;

    const { roots } = await buildAccountTree();
    if (!roots.length) {
        root.innerHTML = '<p class="empty-state">No data found. Import Chart of Accounts first.</p>';
        return;
    }

    const allCodes = collectAllCodes(roots);
    if (!initializedSelection) {
        selectedAccountCodes = new Set(allCodes);
        initializedSelection = true;
    }

    const maxDepth = getMaxDepth(roots);
    root.innerHTML = `
        <div class="reports-toolbar">
            ${REPORTS.map((r) => `<button class="btn report-btn ${selectedReport === r.key ? 'active' : ''}" data-report="${r.key}">${escHtml(r.label)}</button>`).join('')}
        </div>

        <div class="reports-export-bar">
            <button id="btn-export-report-xls" class="btn" type="button">Export Report (XLS)</button>
            <button id="btn-export-report-pdf" class="btn" type="button">Export Report (PDF)</button>
            <span id="report-export-status" class="status-msg"></span>
        </div>

        <div class="report-filters-wrap">
            <div class="report-filter-row">
                <label>Hierarchy Levels
                    <select id="report-level-select">
                        ${renderLevelOptions(maxDepth, selectedLevel)}
                    </select>
                </label>
                <div class="button-row">
                    <button id="report-select-all" class="btn btn-secondary" type="button">Select All Accounts</button>
                    <button id="report-clear-all" class="btn btn-secondary" type="button">Clear All Accounts</button>
                </div>
            </div>
            <div class="report-filter-tree" id="report-account-tree"></div>
            <p class="hint" id="report-selection-hint"></p>
        </div>

        <div id="reports-content"><p class="loading">Loading report...</p></div>
    `;

    bindReportToolbar(root);
    bindFilterControls(root, roots, allCodes);
    bindExportControls(root);
    renderAccountSelectorTree(root.querySelector('#report-account-tree'), roots);

    await renderSelectedReport(root.querySelector('#reports-content'), roots);
}

function bindExportControls(root) {
    root.querySelector('#btn-export-report-xls')?.addEventListener('click', () => {
        try {
            exportCurrentReportAsXls();
            setReportExportStatus('success', 'XLS exported.');
        } catch (err) {
            setReportExportStatus('error', `XLS export failed: ${err?.message || err}`);
        }
    });

    root.querySelector('#btn-export-report-pdf')?.addEventListener('click', () => {
        try {
            exportCurrentReportAsPdf();
            setReportExportStatus('success', 'PDF exported.');
        } catch (err) {
            setReportExportStatus('error', `PDF export failed: ${err?.message || err}`);
        }
    });
}

function bindReportToolbar(root) {
    root.querySelectorAll('.report-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            selectedReport = btn.dataset.report;
            if (selectedReport === 'bank-summary' && selectedAccountCodes.size !== 1) {
                const first = [...selectedAccountCodes][0];
                selectedAccountCodes = first ? new Set([first]) : new Set();
            }
            await renderReportsTab();
        });
    });
}

function bindFilterControls(root, roots, allCodes) {
    const levelSelect = root.querySelector('#report-level-select');
    levelSelect?.addEventListener('change', async () => {
        selectedLevel = levelSelect.value;
        await renderReportsTab();
    });

    root.querySelector('#report-select-all')?.addEventListener('click', async () => {
        if (selectedReport === 'bank-summary') {
            selectedAccountCodes = allCodes.length ? new Set([allCodes[0]]) : new Set();
        } else {
            selectedAccountCodes = new Set(allCodes);
        }
        await renderReportsTab();
    });

    root.querySelector('#report-clear-all')?.addEventListener('click', async () => {
        selectedAccountCodes = new Set();
        await renderReportsTab();
    });

    root.querySelector('#report-account-tree')?.addEventListener('change', async (e) => {
        const cb = e.target;
        if (!(cb instanceof HTMLInputElement) || (cb.type !== 'checkbox' && cb.type !== 'radio')) return;
        const code = cb.dataset.code;
        if (!code) return;

        if (selectedReport === 'bank-summary') {
            selectedAccountCodes = cb.checked ? new Set([code]) : new Set();
        } else {
            if (cb.checked) selectedAccountCodes.add(code);
            else selectedAccountCodes.delete(code);
        }

        await renderReportsTab();
    });

    const hint = root.querySelector('#report-selection-hint');
    if (hint) {
        if (selectedReport === 'bank-summary') {
            hint.textContent = selectedAccountCodes.size === 1
                ? `Selected account: ${[...selectedAccountCodes][0]}`
                : 'Select exactly one account for Bank Account Summary.';
        } else {
            hint.textContent = selectedAccountCodes.size
                ? `${selectedAccountCodes.size} account(s) selected.`
                : 'No accounts selected. Reports will be empty until at least one account is selected.';
        }
    }
}

function renderAccountSelectorTree(container, roots) {
    if (!container) return;

    let html = '';
    function walk(node, depth) {
        const checked = selectedAccountCodes.has(node.shortCode) ? 'checked' : '';
        const inputType = selectedReport === 'bank-summary' ? 'radio' : 'checkbox';
        const inputName = selectedReport === 'bank-summary' ? 'report-account-single' : '';
        html += `
            <label class="report-account-option" style="padding-left:${depth * 18}px">
                <input type="${inputType}" name="${inputName}" data-code="${escHtml(node.shortCode)}" ${checked}>
                <span><code>${escHtml(node.shortCode)}</code> - ${escHtml(node.name)}</span>
            </label>
        `;
        (node.children || []).forEach((c) => walk(c, depth + 1));
    }

    roots.forEach((r) => walk(r, 0));
    container.innerHTML = html;
}

async function renderSelectedReport(container, roots) {
    const getLeafAccounts = reportsCore.getLeafAccounts;
    if (typeof getLeafAccounts !== 'function') {
        container.innerHTML = '<p class="empty-state">Reports core module is outdated in cache. Use Force Reload Reports Module once.</p>';
        return;
    }

    const filteredRoots = applyFiltersToRoots(roots);
    if (!filteredRoots.length) {
        container.innerHTML = '<p class="empty-state">No accounts match current account selector/level filters.</p>';
        return;
    }

    const leaves = getLeafAccounts(filteredRoots);

    switch (selectedReport) {
        case 'trial':
            renderTrialBalance(container, leaves, filteredRoots);
            break;
        case 'pl':
            renderProfitLoss(container, leaves, filteredRoots);
            break;
        case 'asset-class':
            renderAssetClassification(container, leaves);
            break;
        case 'balance-sheet':
            renderBalanceSheet(container, filteredRoots);
            break;
        case 'income-statement':
            renderIncomeStatement(container, filteredRoots);
            break;
        case 'asset-pie':
            renderAssetPie(container, filteredRoots);
            break;
        case 'bank-summary':
            await renderBankAccountSummary(container);
            break;
        default:
            container.innerHTML = '<p class="empty-state">Unknown report.</p>';
            break;
    }
}

function applyFiltersToRoots(roots) {
    let out = filterBySelectedAccounts(roots);
    out = limitHierarchyLevels(out, selectedLevel);
    return out;
}

function filterBySelectedAccounts(roots) {
    if (!selectedAccountCodes.size) return [];

    function walk(node) {
        const isSelected = selectedAccountCodes.has(node.shortCode);
        if (isSelected) {
            return cloneNode(node);
        }

        const children = (node.children || []).map(walk).filter(Boolean);
        if (!children.length) return null;
        return { ...node, children };
    }

    return roots.map(walk).filter(Boolean);
}

function limitHierarchyLevels(roots, levelValue) {
    if (levelValue === 'all') return roots.map(cloneNode);
    const max = Math.max(0, Number(levelValue) || 0);

    function walk(node, depth) {
        if (depth >= max) {
            return { ...node, children: [] };
        }
        return {
            ...node,
            children: (node.children || []).map((c) => walk(c, depth + 1)),
        };
    }

    return roots.map((r) => walk(r, 0));
}

function cloneNode(node) {
    return {
        ...node,
        children: (node.children || []).map(cloneNode),
    };
}

function renderTrialBalance(container, leaves, roots) {
    if (typeof reportsCore.buildTrialBalance !== 'function') {
        container.innerHTML = '<p class="empty-state">Trial Balance renderer is unavailable in current cache.</p>';
        return;
    }
    const report = reportsCore.buildTrialBalance(leaves);
    const hierarchy = rootsToHierarchyRows(roots);

    let html = `<h2>Trial Balance</h2>${renderHierarchyTable(hierarchy, (row) => {
        const leaf = report.rows.find((r) => r.shortCode === row.shortCode);
        return `
            <td>${indent(row.depth)}${escHtml(row.name)}</td>
            <td><code>${escHtml(row.shortCode)}</code></td>
            <td>${escHtml(row.type || '')}</td>
            <td class="num">${leaf && leaf.debit ? formatCurrency(leaf.debit) : ''}</td>
            <td class="num">${leaf && leaf.credit ? formatCurrency(leaf.credit) : ''}</td>
        `;
    }, ['Account', 'Short Code', 'Type', 'Debit', 'Credit'])}`;

    html += `<p class="hint">Total Debit: ${formatCurrency(report.totalDebit)} | Total Credit: ${formatCurrency(report.totalCredit)} | Difference: ${formatCurrency(report.difference)}</p>`;
    container.innerHTML = html;
}

function renderProfitLoss(container, leaves, roots) {
    if (typeof reportsCore.buildProfitAndLoss !== 'function' || typeof reportsCore.buildIncomeStatement !== 'function') {
        container.innerHTML = '<p class="empty-state">P &amp; L renderer is unavailable in current cache.</p>';
        return;
    }
    const report = reportsCore.buildProfitAndLoss(leaves);
    const stmt = reportsCore.buildIncomeStatement(roots);

    const rows = stmt.rows.filter((r) => r.type === 'Income' || r.type === 'Expense');
    let html = `
        <h2>P &amp; L Report</h2>
        <p class="hint">Total Income: ${formatCurrency(report.totalIncome)} | Total Expense: ${formatCurrency(report.totalExpense)} | Net: ${formatCurrency(report.netProfit)}</p>
        ${renderHierarchyTable(rows, (row) => `
            <td>${indent(row.depth)}${escHtml(row.name)}</td>
            <td><code>${escHtml(row.shortCode)}</code></td>
            <td>${escHtml(row.type)}</td>
            <td class="num">${formatCurrency(row.balance)}</td>
        `, ['Account', 'Short Code', 'Type', 'Balance'])}
    `;
    container.innerHTML = html;
}

function renderAssetClassification(container, leaves) {
    if (typeof reportsCore.buildAssetClassification !== 'function') {
        container.innerHTML = '<p class="empty-state">Asset Classification renderer is unavailable in current cache.</p>';
        return;
    }
    const report = reportsCore.buildAssetClassification(leaves);

    let html = '<h2>Asset Classification</h2>';
    Object.entries(report.groups).forEach(([group, rows]) => {
        html += `<h3>${escHtml(group)}</h3>`;
        html += `
            <div class="table-scroll">
                <table class="report-table">
                    <thead><tr><th>Account</th><th>Short Code</th><th class="num">Balance</th></tr></thead>
                    <tbody>
                        ${rows.map((r) => `
                            <tr>
                                <td>${indent(Math.max((r.pathDepth || 1) - 1, 0))}${escHtml(r.name)}</td>
                                <td><code>${escHtml(r.shortCode)}</code></td>
                                <td class="num">${formatCurrency(r.balance)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <p class="hint">Subtotal: ${formatCurrency(report.totals[group])}</p>
        `;
    });
    html += `<p><strong>Total Assets:</strong> ${formatCurrency(report.grandTotal)}</p>`;
    container.innerHTML = html;
}

function renderBalanceSheet(container, roots) {
    if (typeof reportsCore.buildBalanceSheet !== 'function') {
        container.innerHTML = '<p class="empty-state">Balance Sheet renderer is unavailable in current cache.</p>';
        return;
    }
    const bs = reportsCore.buildBalanceSheet(roots);

    let html = `
        <h2>Balance Sheet</h2>
        <p class="hint">Assets: ${formatCurrency(bs.totals.asset)} | Liabilities: ${formatCurrency(bs.totals.liability)} | Equity: ${formatCurrency(bs.totals.equity)} | L+E: ${formatCurrency(bs.liabilitiesPlusEquity)} | Difference: ${formatCurrency(bs.difference)}</p>
        ${renderHierarchyTable(bs.rows, (row) => `
            <td>${indent(row.depth)}${escHtml(row.name)}</td>
            <td><code>${escHtml(row.shortCode)}</code></td>
            <td>${escHtml(row.type)}</td>
            <td class="num">${formatCurrency(row.balance)}</td>
        `, ['Account', 'Short Code', 'Type', 'Balance'])}
    `;
    container.innerHTML = html;
}

function renderIncomeStatement(container, roots) {
    if (typeof reportsCore.buildIncomeStatement !== 'function') {
        container.innerHTML = '<p class="empty-state">Income Statement renderer is unavailable in current cache.</p>';
        return;
    }
    const stmt = reportsCore.buildIncomeStatement(roots);

    container.innerHTML = `
        <h2>Income Statement</h2>
        <p class="hint">Total Income: ${formatCurrency(stmt.totalIncome)} | Total Expense: ${formatCurrency(stmt.totalExpense)} | Net Income: ${formatCurrency(stmt.netIncome)}</p>
        ${renderHierarchyTable(stmt.rows, (row) => `
            <td>${indent(row.depth)}${escHtml(row.name)}</td>
            <td><code>${escHtml(row.shortCode)}</code></td>
            <td>${escHtml(row.type)}</td>
            <td class="num">${formatCurrency(row.balance)}</td>
        `, ['Account', 'Short Code', 'Type', 'Balance'])}
    `;
}

function renderAssetPie(container, roots) {
    if (typeof reportsCore.buildAssetPieData !== 'function') {
        container.innerHTML = '<p class="empty-state">Asset Pie Chart renderer is unavailable in current cache.</p>';
        return;
    }
    const pie = reportsCore.buildAssetPieData(roots);
    const levels = pie.levels || [];
    if (!levels.length) {
        container.innerHTML = '<h2>Asset Pie Chart</h2><p class="empty-state">No positive asset balances available for charting.</p>';
        return;
    }

    const cx = 170;
    const cy = 170;
    const ringWidth = 24;
    const ringGap = 7;
    const ringCount = levels.length;
    const outerRadius = 40 + ringCount * (ringWidth + ringGap);
    const svgSize = Math.max(360, (outerRadius + 26) * 2);

    let svg = `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">`;
    levels.forEach((level, levelIdx) => {
        let current = 0;
        const levelTotal = level.total || 1;
        const ringOuter = outerRadius - levelIdx * (ringWidth + ringGap);
        const ringInner = Math.max(22, ringOuter - ringWidth);
        level.slices.forEach((slice, sliceIdx) => {
            const pct = slice.value / levelTotal;
            const start = current;
            const end = current + pct;
            current = end;
            const color = pieColor(levelIdx, sliceIdx);
            svg += `<path d="${ringArcPath(cx, cy, ringInner, ringOuter, start, end)}" fill="${color}" stroke="#fff" stroke-width="1"></path>`;
        });
    });
    svg += `<circle cx="${cx}" cy="${cy}" r="20" fill="#fff"></circle>`;
    svg += '</svg>';

    const legends = levels.map((level, levelIdx) => `
        <div style="margin-bottom:10px">
            <p class="hint" style="margin:0 0 4px"><strong>${escHtml(level.label)}</strong> (${formatCurrency(level.total)})</p>
            ${level.slices.map((slice, sliceIdx) => `
                <div class="pie-item">
                    <span class="pie-dot" style="background:${pieColor(levelIdx, sliceIdx)}"></span>
                    <span>${escHtml(slice.label)}: ${formatCurrency(slice.value)}</span>
                </div>
            `).join('')}
        </div>
    `).join('');

    container.innerHTML = `
        <h2>Asset Pie Chart</h2>
        <div class="pie-wrap">
            <div>${svg}</div>
            <div class="pie-legend">
                ${legends}
                <p class="hint">Total Assets: ${formatCurrency(pie.total)}</p>
            </div>
        </div>
    `;
}

async function renderBankAccountSummary(container) {
    if (typeof reportsCore.buildBankAccountSummaryReport !== 'function') {
        container.innerHTML = '<p class="empty-state">Bank Account Summary renderer is unavailable in current cache.</p>';
        return;
    }

    if (selectedAccountCodes.size !== 1) {
        container.innerHTML = '<p class="empty-state">Select exactly one account to view Bank Account Summary.</p>';
        return;
    }

    const accountCode = [...selectedAccountCodes][0];
    const [accounts, transactions] = await Promise.all([
        getAll('accounts'),
        getAll('transactions'),
    ]);
    const report = reportsCore.buildBankAccountSummaryReport({
        accountCode,
        accounts,
        transactions,
        financialYear: getSelectedFinancialYear(),
    });

    if (!report) {
        container.innerHTML = '<p class="empty-state">Selected account is unavailable.</p>';
        return;
    }

    container.innerHTML = `
        <h2>Bank Account Summary</h2>
        <p class="hint">Account: <code>${escHtml(report.account.shortCode || '')}</code> - ${escHtml(report.account.name || '')} ${report.financialYear ? `| Financial Year: ${escHtml(report.financialYear)}` : '| All Financial Years'}</p>
        <div class="kpi-row" style="margin-bottom:8px">
            <div class="kpi-card"><h3>Opening Balance</h3><p>${formatCurrency(report.openingBalance)}</p></div>
            <div class="kpi-card"><h3>Total Deposits</h3><p>${formatCurrency(report.depositTotal)}</p></div>
            <div class="kpi-card"><h3>Total Withdrawals</h3><p>${formatCurrency(report.withdrawalTotal)}</p></div>
        </div>
        <p class="hint">Opening Balance + Deposits - Withdrawals = Remaining Balance</p>
        <p><strong>${formatCurrency(report.openingBalance)}</strong> + <strong>${formatCurrency(report.depositTotal)}</strong> - <strong>${formatCurrency(report.withdrawalTotal)}</strong> = <strong>${formatCurrency(report.remainingBalance)}</strong></p>
        ${renderBankSection('Deposits', report.deposits)}
        ${renderBankSection('Withdrawals', report.withdrawals)}
    `;
}

function renderBankSection(title, groups) {
    if (!groups || groups.length === 0) {
        return `<h3>${escHtml(title)}</h3><p class="empty-state">No ${escHtml(title.toLowerCase())} found for selected range.</p>`;
    }

    const html = groups.map((group) => `
        <h4 style="margin:12px 0 4px">${escHtml(group.label)} (${formatCurrency(group.total)})</h4>
        <div class="table-scroll">
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Counter Account</th>
                        <th>Transaction Date</th>
                        <th>Description</th>
                        <th>Comments</th>
                        <th class="num">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${(group.counterGroups || []).map((counter) => `
                        <tr class="bank-subtotal">
                            <td colspan="4"><strong>${indent(counter.depth)}<code>${escHtml(counter.shortCode || '')}</code> - ${escHtml(counter.name || counter.path || '')}</strong></td>
                            <td class="num"><strong>${formatCurrency(counter.subtotal)}</strong></td>
                        </tr>
                        ${counter.rows.map((row) => `
                            <tr>
                                <td>${indent(counter.depth + 1)}${escHtml(row.path || '')}</td>
                                <td>${escHtml(row.valueDate || row.transactionDate || '')}</td>
                                <td>${escHtml(row.description || '')}</td>
                                <td>${escHtml([row.comments1, row.comments2].filter(Boolean).join(' | '))}</td>
                                <td class="num">${formatCurrency(row.amount)}</td>
                            </tr>
                        `).join('')}
                    `).join('')}
                </tbody>
            </table>
        </div>
    `).join('');

    return `<h3>${escHtml(title)}</h3>${html}`;
}

function collectAllCodes(roots) {
    const out = [];
    function walk(node) {
        out.push(node.shortCode);
        (node.children || []).forEach(walk);
    }
    roots.forEach(walk);
    return out;
}

function getMaxDepth(roots) {
    let max = 0;
    function walk(node, depth) {
        if (depth > max) max = depth;
        (node.children || []).forEach((c) => walk(c, depth + 1));
    }
    roots.forEach((r) => walk(r, 0));
    return max;
}

function rootsToHierarchyRows(roots) {
    const rows = [];
    function walk(node, depth) {
        rows.push({
            shortCode: node.shortCode,
            name: node.name,
            type: node.type,
            balance: node.aggregateBalance,
            depth,
        });
        (node.children || []).forEach((c) => walk(c, depth + 1));
    }
    roots.forEach((r) => walk(r, 0));
    return rows;
}

function renderLevelOptions(maxDepth, currentValue) {
    let html = `<option value="all" ${currentValue === 'all' ? 'selected' : ''}>All Levels</option>`;
    for (let i = 0; i <= maxDepth; i++) {
        const label = i === 0 ? 'Top Level Only' : `Top + ${i}`;
        html += `<option value="${i}" ${String(currentValue) === String(i) ? 'selected' : ''}>${label}</option>`;
    }
    return html;
}

function renderHierarchyTable(rows, rowRenderer, headers) {
    return `
        <div class="table-scroll">
            <table class="report-table">
                <thead>
                    <tr>${headers.map((h, i) => `<th${i >= headers.length - 2 ? ' class="num"' : ''}>${escHtml(h)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map((r) => `<tr>${rowRenderer(r)}</tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function indent(depth) {
    return `<span style="display:inline-block;width:${Math.max(0, depth) * 18}px"></span>`;
}

function arcPath(cx, cy, r, startRatio, endRatio) {
    const startAngle = startRatio * Math.PI * 2 - Math.PI / 2;
    const endAngle = endRatio * Math.PI * 2 - Math.PI / 2;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const largeArc = endRatio - startRatio > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function ringArcPath(cx, cy, innerR, outerR, startRatio, endRatio) {
    const startAngle = startRatio * Math.PI * 2 - Math.PI / 2;
    const endAngle = endRatio * Math.PI * 2 - Math.PI / 2;

    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy + outerR * Math.sin(endAngle);

    const x1i = cx + innerR * Math.cos(startAngle);
    const y1i = cy + innerR * Math.sin(startAngle);
    const x2i = cx + innerR * Math.cos(endAngle);
    const y2i = cy + innerR * Math.sin(endAngle);

    const largeArc = endRatio - startRatio > 0.5 ? 1 : 0;

    return [
        `M ${x1o} ${y1o}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
        `L ${x2i} ${y2i}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1i} ${y1i}`,
        'Z',
    ].join(' ');
}

function pieColor(levelIndex, sliceIndex) {
    const hue = (levelIndex * 67 + sliceIndex * 29) % 360;
    const sat = 70;
    const light = 48 + (sliceIndex % 3) * 8;
    return `hsl(${hue} ${sat}% ${light}%)`;
}

function exportCurrentReportAsXls() {
    const content = document.getElementById('reports-content');
    if (!content) throw new Error('Report content not found.');

    const reportLabel = getReportLabel(selectedReport);
    const html = `
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
                th, td { border: 1px solid #cfd8ea; padding: 6px; text-align: left; }
                th.num, td.num { text-align: right; }
            </style>
        </head>
        <body>
            <h2>${escHtml(reportLabel)}</h2>
            <p>Generated At: ${new Date().toLocaleString()}</p>
            ${content.innerHTML}
        </body>
        </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toFileToken(reportLabel)}-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportCurrentReportAsPdf() {
    const content = document.getElementById('reports-content');
    if (!content) throw new Error('Report content not found.');

    const jspdfRef = window.jspdf;
    if (!jspdfRef || !jspdfRef.jsPDF) {
        throw new Error('jsPDF not loaded.');
    }

    const doc = new jspdfRef.jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = margin;

    const reportLabel = getReportLabel(selectedReport);
    doc.setFontSize(14);
    doc.text(reportLabel, margin, y);
    y += 18;
    doc.setFontSize(10);
    doc.text(`Generated At: ${new Date().toLocaleString()}`, margin, y);
    y += 16;

    const headingNodes = content.querySelectorAll('h2, h3, h4, p.hint');
    headingNodes.forEach((node) => {
        const text = normalizeText(node.textContent || '');
        if (!text) return;
        if (y > 760) {
            doc.addPage();
            y = margin;
        }
        doc.setFontSize(node.tagName === 'H2' ? 12 : 10);
        const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 12 + 4;
    });

    const tables = content.querySelectorAll('table');
    tables.forEach((table) => {
        const head = [Array.from(table.querySelectorAll('thead th')).map((th) => normalizeText(th.textContent || ''))];
        const body = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
            Array.from(tr.querySelectorAll('td')).map((td) => normalizeText(td.textContent || ''))
        );

        if (typeof doc.autoTable === 'function') {
            doc.autoTable({
                head,
                body,
                startY: y,
                margin: { left: margin, right: margin },
                styles: { fontSize: 8, cellPadding: 4 },
                headStyles: { fillColor: [37, 99, 235] },
            });
            y = doc.lastAutoTable.finalY + 12;
        }
    });

    // For chart-like reports, include legend rows as text if no tables exist.
    if (!tables.length) {
        const legendItems = content.querySelectorAll('.pie-item');
        legendItems.forEach((item) => {
            const text = normalizeText(item.textContent || '');
            if (!text) return;
            if (y > 760) {
                doc.addPage();
                y = margin;
            }
            doc.text(`- ${text}`, margin, y);
            y += 12;
        });
    }

    doc.save(`${toFileToken(reportLabel)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function getReportLabel(reportKey) {
    return REPORTS.find((r) => r.key === reportKey)?.label || 'Report';
}

function toFileToken(value) {
    return String(value || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function setReportExportStatus(type, message) {
    const el = document.getElementById('report-export-status');
    if (!el) return;
    el.className = `status-msg ${type || ''}`;
    el.textContent = message || '';
}

function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

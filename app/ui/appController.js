import { importHoldingsFromFile } from '../application/services/holdingsImportService.js';
import { syncSchemeCodes } from '../application/services/schemeCodeSyncService.js';
import { refreshNavSnapshots } from '../application/services/navSnapshotService.js';
import { buildReportRows } from '../application/services/reportService.js';
import { buildAmcDistributionRows, buildAmcSummaryRows, filterAmcSummaryRows } from '../application/services/amcReportService.js';
import { formatNumber, formatPercent } from '../shared/formatters.js';
import { clearAllData, getAllHoldings, getAllNavSnapshots, getAllSchemeCodes, normalizeSchemeName, upsertSchemeCode } from '../infrastructure/db/indexedDb.js';
import { fetchSchemeHistory } from '../infrastructure/api/mfApiClient.js';

const REPORT_COLUMNS = [
    { key: 'amcName', type: 'text' },
    { key: 'schemeName', type: 'text' },
    { key: 'schemeCode', type: 'text' },
    { key: 'investedValue', type: 'number' },
    { key: 'units', type: 'number' },
    { key: 'latestNav', type: 'number' },
    { key: 'currentValue', type: 'number' },
    { key: 'oneDayNav', type: 'number' },
    { key: 'oneMonthNav', type: 'number' },
    { key: 'jan1Nav', type: 'number' },
    { key: 'oneYearNav', type: 'number' },
    { key: 'pctVs1Day', type: 'number' },
    { key: 'pctVs1Month', type: 'number' },
    { key: 'pctVsJan1', type: 'number' },
    { key: 'pctVs1Year', type: 'number' },
];

let allReportRows = [];
const filterByColumn = {};
let sortState = { key: null, direction: 'asc' };
let allAmcRows = [];
let amcSortState = { key: 'currentValue', direction: 'desc' };
const amcFilters = { query: '', returnMode: 'all', topN: 0 };
const PIE_COLORS = ['#45a6ff', '#8ed0ff', '#4bd37b', '#ffc857', '#ff8fab', '#b794f4', '#2dd4bf', '#f97316'];

function byId(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const node = byId(id);
    if (node) {
        node.textContent = value;
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatForDisplay(row, key) {
    if (key === 'investedValue' || key === 'units' || key === 'latestNav' || key === 'currentValue' || key === 'oneDayNav' || key === 'oneMonthNav' || key === 'jan1Nav' || key === 'oneYearNav') {
        return formatNumber(row[key]);
    }

    if (key === 'pctVs1Day' || key === 'pctVs1Month' || key === 'pctVsJan1' || key === 'pctVs1Year') {
        return formatPercent(row[key]);
    }

    return String(row[key] ?? '-');
}

function getComparableValue(row, key, type) {
    const value = row[key];
    if (type === 'number') {
        return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
    }
    return String(value ?? '').toLowerCase();
}

function getVisibleRows(rows) {
    let nextRows = [...rows];

    nextRows = nextRows.filter((row) =>
        REPORT_COLUMNS.every((column) => {
            const filterValue = (filterByColumn[column.key] || '').trim().toLowerCase();
            if (!filterValue) {
                return true;
            }
            const displayValue = formatForDisplay(row, column.key).toLowerCase();
            return displayValue.includes(filterValue);
        })
    );

    if (sortState.key) {
        const column = REPORT_COLUMNS.find((item) => item.key === sortState.key);
        const directionFactor = sortState.direction === 'asc' ? 1 : -1;
        nextRows.sort((a, b) => {
            const aValue = getComparableValue(a, sortState.key, column?.type || 'text');
            const bValue = getComparableValue(b, sortState.key, column?.type || 'text');
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

function renderReportRows(rows) {
    const tableBody = byId('report-table-body');
    const visibleRows = getVisibleRows(rows);

    tableBody.innerHTML = visibleRows
        .map(
            (row) => `
            <tr>
                <td>${row.amcName}</td>
                <td>${row.schemeName}</td>
                <td>${row.schemeCode}</td>
                <td class="numeric">${formatForDisplay(row, 'investedValue')}</td>
                <td class="numeric">${formatForDisplay(row, 'units')}</td>
                <td class="numeric">${formatForDisplay(row, 'latestNav')}</td>
                <td class="numeric">${formatForDisplay(row, 'currentValue')}</td>
                <td class="numeric">${formatForDisplay(row, 'oneDayNav')}</td>
                <td class="numeric">${formatForDisplay(row, 'oneMonthNav')}</td>
                <td class="numeric">${formatForDisplay(row, 'jan1Nav')}</td>
                <td class="numeric">${formatForDisplay(row, 'oneYearNav')}</td>
                <td class="numeric">${formatForDisplay(row, 'pctVs1Day')}</td>
                <td class="numeric">${formatForDisplay(row, 'pctVs1Month')}</td>
                <td class="numeric">${formatForDisplay(row, 'pctVsJan1')}</td>
                <td class="numeric">${formatForDisplay(row, 'pctVs1Year')}</td>
            </tr>`
        )
        .join('');

    setText('report-status', `Report refreshed: ${visibleRows.length}/${rows.length} row(s) visible.`);
}

function getVisibleAmcRows() {
    const filteredRows = filterAmcSummaryRows(allAmcRows, amcFilters);
    const direction = amcSortState.direction === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
        const aValue = a[amcSortState.key];
        const bValue = b[amcSortState.key];

        if (typeof aValue === 'number' || typeof bValue === 'number') {
            const safeA = Number.isFinite(aValue) ? aValue : Number.NEGATIVE_INFINITY;
            const safeB = Number.isFinite(bValue) ? bValue : Number.NEGATIVE_INFINITY;
            return safeA < safeB ? -1 * direction : safeA > safeB ? 1 * direction : 0;
        }

        const textA = String(aValue ?? '').toLowerCase();
        const textB = String(bValue ?? '').toLowerCase();
        return textA < textB ? -1 * direction : textA > textB ? 1 * direction : 0;
    });
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: cx + radius * Math.cos(angleInRadians),
        y: cy + radius * Math.sin(angleInRadians),
    };
}

function describePieSlice(cx, cy, radius, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

function renderPieChart(rootId, rows, valueKey, displayKey) {
    const root = byId(rootId);
    if (!root) {
        return;
    }

    const nonZeroRows = rows.filter((row) => Number.isFinite(row[valueKey]) && row[valueKey] > 0);
    const total = nonZeroRows.reduce((sum, row) => sum + row[valueKey], 0);
    if (total <= 0 || nonZeroRows.length === 0) {
        root.innerHTML = '<div class="chart-empty">No data for current filters.</div>';
        return;
    }

    let currentAngle = 0;
    const paths = nonZeroRows
        .map((row, index) => {
            const percentage = (row[valueKey] / total) * 100;
            const sweep = (percentage / 100) * 360;
            const path = describePieSlice(100, 100, 78, currentAngle, currentAngle + sweep);
            const color = PIE_COLORS[index % PIE_COLORS.length];
            currentAngle += sweep;
            return { path, color, row, percentage };
        })
        .map((slice) => `<path d="${slice.path}" fill="${slice.color}" stroke="#0f1420" stroke-width="1"></path>`)
        .join('');

    const legend = nonZeroRows
        .map((row, index) => {
            const color = PIE_COLORS[index % PIE_COLORS.length];
            const share = formatPercent((row[valueKey] / total) * 100);
            const value = displayKey === 'percent' ? formatPercent(row.returnsPct) : formatNumber(row[displayKey]);
            return `<div class="pie-legend-item"><span><i class="pie-dot" style="background:${color}"></i>${escapeHtml(row.amcName)}</span><span>${value} (${share})</span></div>`;
        })
        .join('');

    root.innerHTML = `<svg viewBox="0 0 200 200" role="img" aria-label="AMC distribution pie chart">${paths}</svg><div class="pie-legend">${legend}</div>`;
}

function renderAmcChart(rows) {
    const root = byId('amc-chart');
    if (!root) {
        return;
    }

    if (!rows.length) {
        root.innerHTML = '<div class="chart-empty">No AMC rows for current filters.</div>';
        return;
    }

    const maxValue = Math.max(
        ...rows.flatMap((row) => [
            Number.isFinite(row.investedValue) ? row.investedValue : 0,
            Number.isFinite(row.currentValue) ? row.currentValue : 0,
            Math.abs(Number.isFinite(row.returnsValue) ? row.returnsValue : 0),
        ]),
        1
    );

    const chartHeight = 220;
    const unitWidth = 80;
    const chartWidth = Math.max(640, rows.length * unitWidth);

    const bars = rows
        .map((row, index) => {
            const groupX = index * unitWidth + 8;
            const investedHeight = Math.max(2, (row.investedValue / maxValue) * chartHeight);
            const currentHeight = Math.max(2, (row.currentValue / maxValue) * chartHeight);
            const returnsHeight = Math.max(2, (Math.abs(row.returnsValue) / maxValue) * chartHeight);
            const returnsColor = row.returnsValue >= 0 ? '#4bd37b' : '#ff6b7a';

            return `
                <g>
                    <rect x="${groupX}" y="${chartHeight - investedHeight}" width="14" height="${investedHeight}" fill="#45a6ff"></rect>
                    <rect x="${groupX + 18}" y="${chartHeight - currentHeight}" width="14" height="${currentHeight}" fill="#8ed0ff"></rect>
                    <rect x="${groupX + 36}" y="${chartHeight - returnsHeight}" width="14" height="${returnsHeight}" fill="${returnsColor}"></rect>
                    <text x="${groupX + 25}" y="${chartHeight + 16}" font-size="10" text-anchor="middle" fill="#dce3ec">${escapeHtml(row.amcName.slice(0, 10))}</text>
                </g>`;
        })
        .join('');

    root.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} 250" preserveAspectRatio="xMinYMin meet" role="img" aria-label="AMC invested, current and returns bars">
            <rect x="0" y="0" width="${chartWidth}" height="250" fill="transparent"></rect>
            ${bars}
        </svg>
        <div class="chart-legend">
            <span><i class="legend-box invested"></i>Invested</span>
            <span><i class="legend-box current"></i>Current</span>
            <span><i class="legend-box returns"></i>Returns</span>
        </div>`;
}

function renderAmcTable() {
    const tableBody = byId('amc-table-body');
    const rows = getVisibleAmcRows();

    tableBody.innerHTML = rows
        .map(
            (row) => `
            <tr>
                <td>${escapeHtml(row.amcName)}</td>
                <td class="numeric">${formatNumber(row.investedValue)}</td>
                <td class="numeric">${formatNumber(row.currentValue)}</td>
                <td class="numeric">${formatNumber(row.returnsValue)}</td>
                <td class="numeric">${formatPercent(row.returnsPct)}</td>
                <td class="numeric">${row.schemeCount}</td>
            </tr>`
        )
        .join('');

    renderAmcChart(rows);
}

function renderAmcDistribution() {
    const rows = getVisibleAmcRows();
    const distribution = buildAmcDistributionRows(rows);
    renderPieChart('pie-invested', distribution, 'investedSharePct', 'investedValue');
    renderPieChart('pie-current', distribution, 'currentSharePct', 'currentValue');
    renderPieChart('pie-returns-pct', distribution, 'returnsPctShare', 'percent');
}

function downloadReportsExcel() {
    if (!window.XLSX) {
        setText('import-error', 'XLSX export library not available in browser.');
        return;
    }

    const schemeRows = getVisibleRows(allReportRows).map((row) => ({
        'AMC Name': row.amcName,
        'Scheme Name': row.schemeName,
        'Scheme Code': row.schemeCode,
        'Invested Value': row.investedValue,
        Units: row.units,
        'Latest NAV': row.latestNav,
        'Current Value': row.currentValue,
        '1 Day NAV': row.oneDayNav,
        '1 Month NAV': row.oneMonthNav,
        '1 Jan NAV': row.jan1Nav,
        '1 Year NAV': row.oneYearNav,
        'vs 1D %': row.pctVs1Day,
        'vs 1M %': row.pctVs1Month,
        'vs 1 Jan %': row.pctVsJan1,
        'vs 1Y %': row.pctVs1Year,
    }));

    const comparisonRows = getVisibleRows(allReportRows).map((row) => ({
        'AMC Name': row.amcName,
        'Scheme Name': row.schemeName,
        'Scheme Code': row.schemeCode,
        'Invested Value': row.investedValue,
        Units: row.units,
        'Current Value (XLS)': row.currentValueXls,
        'Current Value (Calc)': row.currentValue,
        'Difference': row.valueDelta,
        'Difference %': row.valueDeltaPct,
    }));

    const amcRows = getVisibleAmcRows();
    const amcSummaryRows = amcRows.map((row) => ({
        'AMC Name': row.amcName,
        'Invested Value': row.investedValue,
        'Current Value': row.currentValue,
        Returns: row.returnsValue,
        'Returns %': row.returnsPct,
        Schemes: row.schemeCount,
    }));

    const amcDistRows = buildAmcDistributionRows(amcRows).map((row) => ({
        'AMC Name': row.amcName,
        'Invested Share %': row.investedSharePct,
        'Current Share %': row.currentSharePct,
        'Return % Share': row.returnsPctShare,
        'Return % (Actual)': row.returnsPct,
    }));

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(schemeRows), 'Scheme Report');
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(comparisonRows), 'XLS vs Calc Comparison');
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(amcSummaryRows), 'AMC Summary');
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(amcDistRows), 'AMC Distribution');
    window.XLSX.writeFile(workbook, `mf-reports-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function setupColumnControls() {
    const headerCells = Array.from(document.querySelectorAll('thead th[data-col]'));
    headerCells.forEach((th) => {
        const columnKey = th.dataset.col;
        if (!columnKey || th.dataset.enhanced === '1') {
            return;
        }

        th.classList.add('sortable');

        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        indicator.textContent = '';
        th.appendChild(indicator);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'header-filter';
        input.placeholder = 'Filter';
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('input', (event) => {
            filterByColumn[columnKey] = event.target.value || '';
            renderReportRows(allReportRows);
        });
        th.appendChild(input);

        th.addEventListener('click', () => {
            if (sortState.key === columnKey) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState = { key: columnKey, direction: 'asc' };
            }

            headerCells.forEach((cell) => {
                const cellIndicator = cell.querySelector('.sort-indicator');
                if (!cellIndicator) {
                    return;
                }
                if (cell.dataset.col === sortState.key) {
                    cellIndicator.textContent = sortState.direction === 'asc' ? '↑' : '↓';
                } else {
                    cellIndicator.textContent = '';
                }
            });

            renderReportRows(allReportRows);
        });

        th.dataset.enhanced = '1';
    });
}

function setupAmcColumnControls() {
    const headerCells = Array.from(document.querySelectorAll('thead th[data-amc-col]'));
    headerCells.forEach((th) => {
        const columnKey = th.dataset.amcCol;
        if (!columnKey || th.dataset.enhanced === '1') {
            return;
        }

        th.classList.add('sortable');

        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        indicator.textContent = amcSortState.key === columnKey ? (amcSortState.direction === 'asc' ? '↑' : '↓') : '';
        th.appendChild(indicator);

        th.addEventListener('click', () => {
            if (amcSortState.key === columnKey) {
                amcSortState.direction = amcSortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                amcSortState = { key: columnKey, direction: 'asc' };
            }

            headerCells.forEach((cell) => {
                const cellIndicator = cell.querySelector('.sort-indicator');
                if (cellIndicator) {
                    cellIndicator.textContent = cell.dataset.amcCol === amcSortState.key ? (amcSortState.direction === 'asc' ? '↑' : '↓') : '';
                }
            });

            renderAmcTable();
        });

        th.dataset.enhanced = '1';
    });
}

function initReportSubtabs() {
    const schemeButton     = byId('report-view-scheme-btn');
    const amcButton        = byId('report-view-amc-btn');
    const amcDistButton    = byId('report-view-amc-dist-btn');
    const comparisonButton = byId('report-view-comparison-btn');
    const schemePanel      = byId('scheme-report-panel');
    const amcPanel         = byId('amc-report-panel');
    const amcDistPanel     = byId('amc-distribution-panel');
    const comparisonPanel  = byId('comparison-report-panel');

    if (!schemeButton || !amcButton || !amcDistButton || !comparisonButton) return;

    const activate = (view) => {
        const map = {
            scheme:     [schemeButton,     schemePanel],
            amc:        [amcButton,         amcPanel],
            amcDist:    [amcDistButton,    amcDistPanel],
            comparison: [comparisonButton, comparisonPanel],
        };

        Object.entries(map).forEach(([key, [btn, panel]]) => {
            const active = key === view;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
            if (panel) panel.classList.toggle('is-active', active);
        });
    };

    schemeButton.addEventListener('click', () => activate('scheme'));
    amcButton.addEventListener('click',    () => activate('amc'));
    amcDistButton.addEventListener('click',() => { activate('amcDist'); renderAmcDistribution(); });
    comparisonButton.addEventListener('click', () => activate('comparison'));
    activate('scheme');
}

async function refreshMetrics() {
    const [holdings, codes, navs] = await Promise.all([
        getAllHoldings(),
        getAllSchemeCodes(),
        getAllNavSnapshots(),
    ]);

    setText('metric-holdings', String(holdings.length));
    setText('metric-mapped', String(codes.length));
    setText('metric-nav', String(navs.length));
}

async function refreshReport() {
    const rows = await buildReportRows();
    allReportRows = rows;
    renderReportRows(allReportRows);
    allAmcRows = buildAmcSummaryRows(allReportRows);
    renderAmcTable();
    renderAmcDistribution();
    renderComparisonRows(allReportRows);
    renderReportTotals();
}

// ─── Report Totals Summary ────────────────────────────────────────────────────

function renderReportTotals() {
    // Scheme Report totals
    const schemeTotal = calculateSchemeTotals(allReportRows);
    const schemeTotalsHtml = `
        <div class="totals-card">
            <div class="totals-card-label">Total Invested Value</div>
            <div class="totals-card-value">${formatNumber(schemeTotal.investedValue)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Current Value</div>
            <div class="totals-card-value">${formatNumber(schemeTotal.currentValue)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Returns</div>
            <div class="totals-card-value" style="color:${schemeTotal.returns >= 0 ? '#4bd37b' : '#ff7a8a'}">${formatNumber(schemeTotal.returns)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Returns %</div>
            <div class="totals-card-value" style="color:${schemeTotal.returnsPct >= 0 ? '#4bd37b' : '#ff7a8a'}">${formatPercent(schemeTotal.returnsPct)}</div>
        </div>
    `;
    const schemeTotalsEl = byId('scheme-report-totals');
    if (schemeTotalsEl) schemeTotalsEl.innerHTML = schemeTotalsHtml;

    // AMC Summary totals
    const amcTotal = calculateAmcTotals(allAmcRows);
    const amcTotalsHtml = `
        <div class="totals-card">
            <div class="totals-card-label">Total Invested Value</div>
            <div class="totals-card-value">${formatNumber(amcTotal.investedValue)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Current Value</div>
            <div class="totals-card-value">${formatNumber(amcTotal.currentValue)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Returns</div>
            <div class="totals-card-value" style="color:${amcTotal.returns >= 0 ? '#4bd37b' : '#ff7a8a'}">${formatNumber(amcTotal.returns)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Returns %</div>
            <div class="totals-card-value" style="color:${amcTotal.returnsPct >= 0 ? '#4bd37b' : '#ff7a8a'}">${formatPercent(amcTotal.returnsPct)}</div>
        </div>
    `;
    const amcTotalsEl = byId('amc-report-totals');
    if (amcTotalsEl) amcTotalsEl.innerHTML = amcTotalsHtml;

    // Comparison Report totals
    const comparisonTotal = calculateComparisonTotals(allReportRows);
    const comparisonTotalsHtml = `
        <div class="totals-card">
            <div class="totals-card-label">Total Invested Value</div>
            <div class="totals-card-value">${formatNumber(comparisonTotal.investedValue)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total XLS Current Value</div>
            <div class="totals-card-value">${formatNumber(comparisonTotal.currentValueXls)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Calc Current Value</div>
            <div class="totals-card-value">${formatNumber(comparisonTotal.currentValue)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Total Delta</div>
            <div class="totals-card-value" style="color:${comparisonTotal.valueDelta >= 0 ? '#4bd37b' : '#ff7a8a'}">${formatNumber(comparisonTotal.valueDelta)}</div>
        </div>
        <div class="totals-card">
            <div class="totals-card-label">Delta %</div>
            <div class="totals-card-value" style="color:${comparisonTotal.valueDeltaPct >= 0 ? '#4bd37b' : '#ff7a8a'}">${formatPercent(comparisonTotal.valueDeltaPct)}</div>
        </div>
    `;
    const comparisonTotalsEl = byId('comparison-report-totals');
    if (comparisonTotalsEl) comparisonTotalsEl.innerHTML = comparisonTotalsHtml;
}

function calculateSchemeTotals(rows) {
    let investedValue = 0, currentValue = 0;
    rows.forEach(row => {
        if (Number.isFinite(row.investedValue)) investedValue += row.investedValue;
        if (Number.isFinite(row.currentValue)) currentValue += row.currentValue;
    });
    const returns = currentValue - investedValue;
    const returnsPct = investedValue ? (returns / investedValue) * 100 : 0;
    return { investedValue, currentValue, returns, returnsPct };
}

function calculateAmcTotals(rows) {
    let investedValue = 0, currentValue = 0, returnsValue = 0;
    rows.forEach(row => {
        if (Number.isFinite(row.investedValue)) investedValue += row.investedValue;
        if (Number.isFinite(row.currentValue)) currentValue += row.currentValue;
        if (Number.isFinite(row.returnsValue)) returnsValue += row.returnsValue;
    });
    const returnsPct = investedValue ? (returnsValue / investedValue) * 100 : 0;
    return { investedValue, currentValue, returns: returnsValue, returnsPct };
}

function calculateComparisonTotals(rows) {
    let investedValue = 0, currentValueXls = 0, currentValue = 0;
    rows.forEach(row => {
        if (Number.isFinite(row.investedValue)) investedValue += row.investedValue;
        if (Number.isFinite(row.currentValueXls)) currentValueXls += row.currentValueXls;
        if (Number.isFinite(row.currentValue)) currentValue += row.currentValue;
    });
    const valueDelta = currentValue - currentValueXls;
    const valueDeltaPct = currentValueXls ? (valueDelta / currentValueXls) * 100 : 0;
    return { investedValue, currentValueXls, currentValue, valueDelta, valueDeltaPct };
}

// ─── Comparison Report ────────────────────────────────────────────────────────

function renderComparisonRows(rows) {
    const tbody = byId('comparison-table-body');
    if (!tbody) return;

    const totals = { investedValue: 0, currentValueXls: 0, currentValue: 0 };

    tbody.innerHTML = rows
        .map((row) => {
            if (Number.isFinite(row.investedValue))  totals.investedValue  += row.investedValue;
            if (Number.isFinite(row.currentValueXls)) totals.currentValueXls += row.currentValueXls;
            if (Number.isFinite(row.currentValue))    totals.currentValue    += row.currentValue;

            const delta    = row.valueDelta;
            const deltaPct = row.valueDeltaPct;
            const deltaClass = !Number.isFinite(delta) ? '' : delta > 0.005 ? 'delta-positive' : delta < -0.005 ? 'delta-negative' : 'delta-zero';

            return `<tr>
                <td>${escapeHtml(row.amcName)}</td>
                <td>${escapeHtml(row.schemeName)}</td>
                <td>${escapeHtml(row.schemeCode)}</td>
                <td class="numeric">${formatNumber(row.investedValue)}</td>
                <td class="numeric">${formatNumber(row.units)}</td>
                <td class="numeric">${Number.isFinite(row.currentValueXls) ? formatNumber(row.currentValueXls) : '<span style="color:var(--muted)">—</span>'}</td>
                <td class="numeric">${Number.isFinite(row.currentValue) ? formatNumber(row.currentValue) : '<span style="color:var(--muted)">—</span>'}</td>
                <td class="numeric ${deltaClass}">${Number.isFinite(delta) ? formatNumber(delta) : '<span style="color:var(--muted)">—</span>'}</td>
                <td class="numeric ${deltaClass}">${Number.isFinite(deltaPct) ? formatPercent(deltaPct) : '<span style="color:var(--muted)">—</span>'}</td>
            </tr>`;
        })
        .join('');

    // Totals footer row
    const totalDelta = totals.currentValue - totals.currentValueXls;
    const totalDeltaPct = totals.currentValueXls ? (totalDelta / totals.currentValueXls) * 100 : null;
    const tClass = totalDelta > 0.005 ? 'delta-positive' : totalDelta < -0.005 ? 'delta-negative' : 'delta-zero';
    tbody.insertAdjacentHTML('beforeend', `
        <tr style="font-weight:600;background:#1f2a3d">
            <td colspan="3">Total</td>
            <td class="numeric">${formatNumber(totals.investedValue)}</td>
            <td></td>
            <td class="numeric">${formatNumber(totals.currentValueXls)}</td>
            <td class="numeric">${formatNumber(totals.currentValue)}</td>
            <td class="numeric ${tClass}">${formatNumber(totalDelta)}</td>
            <td class="numeric ${tClass}">${Number.isFinite(totalDeltaPct) ? formatPercent(totalDeltaPct) : '—'}</td>
        </tr>`);

    const visibleCount = rows.length;
    const mismatchCount = rows.filter(r => Number.isFinite(r.valueDelta) && Math.abs(r.valueDelta) > 1).length;
    setText('comparison-status', `${visibleCount} scheme(s) | ${mismatchCount} with delta > ₹1`);
}

// ─── Scheme Code Manager ─────────────────────────────────────────────────────

async function renderSchemeCodeManager() {
    const tbody = byId('scheme-manager-body');
    const statusEl = byId('scheme-manager-status');
    const errorEl  = byId('scheme-manager-error');
    if (!tbody) return;

    setText('scheme-manager-status', 'Loading…');
    setText('scheme-manager-error', '');

    const [holdings, schemeCodes] = await Promise.all([getAllHoldings(), getAllSchemeCodes()]);
    const codeMap = new Map(schemeCodes.map(item => [item.schemeNameNormalized, item]));

    tbody.innerHTML = holdings.map((holding) => {
        const normalized = normalizeSchemeName(holding.schemeName);
        const codeItem   = codeMap.get(normalized);
        const code       = codeItem?.schemeCode || '';
        const apiName    = codeItem?.apiSchemeName || '—';
        const score      = codeItem?.score != null ? Number(codeItem.score).toFixed(2) : '—';
        const safeId     = CSS.escape(normalized);

        return `<tr data-normalized="${escapeHtml(normalized)}">
            <td>${escapeHtml(holding.amcName || '—')}</td>
            <td>${escapeHtml(holding.schemeName)}</td>
            <td>
                <input class="scheme-code-input" type="text" value="${escapeHtml(code)}"
                    placeholder="e.g. 100377" aria-label="Scheme code for ${escapeHtml(holding.schemeName)}" />
            </td>
            <td class="api-scheme-name-cell">${escapeHtml(apiName)}</td>
            <td class="numeric">${score}</td>
            <td>
                <button class="apply-scheme-code-btn button-primary" type="button">Apply</button>
                <span class="row-status"></span>
            </td>
        </tr>`;
    }).join('');

    setText('scheme-manager-status', `${holdings.length} holding(s) loaded.`);
}

async function applySchemeCodeForRow(trEl) {
    const normalized = trEl.dataset.normalized;
    const input      = trEl.querySelector('.scheme-code-input');
    const statusSpan = trEl.querySelector('.row-status');
    const apiNameCell = trEl.querySelector('.api-scheme-name-cell');

    const newCode = (input?.value || '').trim();
    if (!newCode) {
        statusSpan.textContent = 'Enter a code.';
        statusSpan.className = 'row-status error';
        return;
    }

    statusSpan.textContent = 'Fetching…';
    statusSpan.className = 'row-status busy';

    try {
        const history = await fetchSchemeHistory(newCode);
        const apiSchemeName = history.schemeName || '';
        const holding = (await getAllHoldings()).find(h => normalizeSchemeName(h.schemeName) === normalized);
        await upsertSchemeCode({
            schemeNameNormalized: normalized,
            originalSchemeName: holding?.schemeName || normalized,
            schemeCode: newCode,
            apiSchemeName,
            score: 1.0,
            updatedAt: new Date().toISOString(),
        });
        apiNameCell.textContent = apiSchemeName || '—';
        statusSpan.textContent = '✓ Saved';
        statusSpan.className = 'row-status ok';
    } catch (error) {
        statusSpan.textContent = `✗ ${error.message || 'Failed'}`;
        statusSpan.className = 'row-status error';
    }
}

// ─── IndexedDB Backup/Restore ─────────────────────────────────────────────

async function downloadSchemeCodesCsv() {
    try {
        setText('scheme-manager-error', '');
        const [holdings, schemeCodes] = await Promise.all([getAllHoldings(), getAllSchemeCodes()]);
        const codeMap = new Map(schemeCodes.map(item => [item.schemeNameNormalized, item]));

        const rows = [['Scheme Name', 'Scheme Code', 'API Scheme Name']];
        holdings.forEach(holding => {
            const normalized = normalizeSchemeName(holding.schemeName);
            const codeItem = codeMap.get(normalized);
            rows.push([
                holding.schemeName,
                codeItem?.schemeCode || '',
                codeItem?.apiSchemeName || '',
            ]);
        });

        const csv = rows.map(row => row.map(cell => {
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(cell).replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
        }).join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `scheme-codes-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setText('scheme-manager-status', `Exported ${holdings.length} scheme code mapping(s).`);
    } catch (error) {
        setText('scheme-manager-error', `Download failed: ${error.message}`);
    }
}

async function bulkOverrideCodesFromCsv(file) {
    if (!file) {
        setText('scheme-manager-error', 'Please select a CSV file.');
        return;
    }

    try {
        setText('scheme-manager-error', '');
        setText('scheme-manager-status', 'Parsing CSV and validating codes...');

        const csv = await file.text();
        const lines = csv.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV file must have header row and at least one data row.');
        }

        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const schemeNameIdx = header.indexOf('scheme name');
        const schemeCodeIdx = header.indexOf('scheme code');

        if (schemeNameIdx === -1 || schemeCodeIdx === -1) {
            throw new Error('CSV must have "Scheme Name" and "Scheme Code" columns.');
        }

        const holdings = await getAllHoldings();
        const holdingsByName = new Map(holdings.map(h => [normalizeSchemeName(h.schemeName), h]));

        let successCount = 0;
        let skipCount = 0;
        const failures = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = [];
            let current = '';
            let inQuotes = false;
            for (const char of lines[i]) {
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) { parts.push(current); current = ''; }
                else current += char;
            }
            parts.push(current);

            const schemeName = parts[schemeNameIdx]?.trim().replace(/^"|"$/g, '') || '';
            const schemeCode = parts[schemeCodeIdx]?.trim().replace(/^"|"$/g, '') || '';

            if (!schemeName || !schemeCode) {
                skipCount++;
                continue;
            }

            const normalized = normalizeSchemeName(schemeName);
            const holding = holdingsByName.get(normalized);
            if (!holding) {
                failures.push({ line: i + 1, scheme: schemeName, reason: 'Not found in current holdings' });
                continue;
            }

            try {
                const history = await fetchSchemeHistory(schemeCode);
                const apiSchemeName = history.schemeName || '';
                await upsertSchemeCode({
                    schemeNameNormalized: normalized,
                    originalSchemeName: holding.schemeName,
                    schemeCode,
                    apiSchemeName,
                    score: 1.0,
                    updatedAt: new Date().toISOString(),
                });
                successCount++;
            } catch (error) {
                failures.push({ line: i + 1, scheme: schemeName, reason: error.message });
            }
        }

        let message = `Bulk override: ${successCount} code(s) saved.`;
        if (skipCount) message += ` Skipped: ${skipCount} row(s).`;
        if (failures.length) message += ` Failed: ${failures.length} row(s).`;
        setText('scheme-manager-status', message);

        if (failures.length) {
            const sampleFailures = failures.slice(0, 3).map(f => `Line ${f.line}: ${f.scheme} (${f.reason})`).join(' | ');
            setText('scheme-manager-error', `Failures: ${sampleFailures}`);
        }

        await renderSchemeCodeManager();
    } catch (error) {
        setText('scheme-manager-error', `Bulk override failed: ${error.message}`);
    }
}

// ─── IndexedDB Backup/Restore ─────────────────────────────────────────────

async function exportIndexedDbDump() {
    try {
        setText('import-error', '');
        setText('import-status', 'Exporting IndexedDB dump...');

        const [holdings, schemeCodes, navSnapshots] = await Promise.all([
            getAllHoldings(),
            getAllSchemeCodes(),
            getAllNavSnapshots(),
        ]);

        const dump = {
            version: 1,
            exportedAt: new Date().toISOString(),
            holdings,
            schemeCodes,
            navSnapshots,
        };

        const json = JSON.stringify(dump, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mf-holdings-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setText('import-status', `Exported ${holdings.length} holding(s), ${schemeCodes.length} code mapping(s), ${navSnapshots.length} NAV snapshot(s).`);
    } catch (error) {
        setText('import-error', `Export failed: ${error.message}`);
    }
}

async function importIndexedDbDump(file) {
    if (!file) {
        setText('import-error', 'Please select a backup JSON file.');
        return;
    }

    try {
        setText('import-error', '');
        setText('import-status', 'Importing IndexedDB dump...');

        const json = await file.text();
        const dump = JSON.parse(json);

        if (dump.version !== 1) {
            throw new Error(`Unsupported backup version: ${dump.version}`);
        }

        if (!Array.isArray(dump.holdings) || !Array.isArray(dump.schemeCodes) || !Array.isArray(dump.navSnapshots)) {
            throw new Error('Invalid backup file structure.');
        }

        // Import holdings
        await (async () => {
            const { replaceHoldings } = await import('../infrastructure/db/indexedDb.js');
            await replaceHoldings(dump.holdings);
        })();

        // Import scheme codes
        for (const code of dump.schemeCodes) {
            await upsertSchemeCode(code);
        }

        // Import NAV snapshots
        const { upsertNavSnapshot } = await import('../infrastructure/db/indexedDb.js');
        for (const snapshot of dump.navSnapshots) {
            await upsertNavSnapshot(snapshot);
        }

        setText('import-status', `Imported ${dump.holdings.length} holding(s), ${dump.schemeCodes.length} code mapping(s), ${dump.navSnapshots.length} NAV snapshot(s).`);
        await refreshMetrics();
        await refreshReport();
        await renderSchemeCodeManager();
    } catch (error) {
        setText('import-error', `Import failed: ${error.message}`);
    }
}

export function initAppController() {
    initReportSubtabs();
    setupColumnControls();
    setupAmcColumnControls();

    const fileInput             = byId('cas-file');
    const importButton          = byId('import-btn');
    const syncCodesButton       = byId('sync-codes-btn');
    const fetchNavButton        = byId('fetch-nav-btn');
    const clearDbButton         = byId('clear-db-btn');
    const refreshReportButton   = byId('refresh-report-btn');
    const downloadReportsButton = byId('download-reports-btn');
    const amcFilterText         = byId('amc-filter-text');
    const amcFilterReturn       = byId('amc-filter-return');
    const amcFilterTop          = byId('amc-filter-top');
    const refreshSchemeManager  = byId('refresh-scheme-manager-btn');
    const schemeManagerBody     = byId('scheme-manager-body');
    const refreshComparison     = byId('refresh-comparison-btn');
    const exportDbBtn           = byId('export-db-btn');
    const importDbBtn           = byId('import-db-btn');
    const importDbFile          = byId('import-db-file');
    const downloadCodesCsvBtn   = byId('download-codes-csv-btn');
    const bulkOverrideCodesBtn  = byId('bulk-override-codes-btn');
    const bulkCodesFile         = byId('bulk-codes-file');

    // Export/Import IndexedDB
    if (exportDbBtn) {
        exportDbBtn.addEventListener('click', () => exportIndexedDbDump());
    }

    if (importDbBtn && importDbFile) {
        importDbBtn.addEventListener('click', () => importDbFile.click());
        importDbFile.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                importIndexedDbDump(file);
                event.target.value = '';
            }
        });
    }

    amcFilterText.addEventListener('input', (event) => {
        amcFilters.query = event.target.value || '';
        renderAmcTable();
        renderAmcDistribution();
    });

    amcFilterReturn.addEventListener('change', (event) => {
        amcFilters.returnMode = event.target.value || 'all';
        renderAmcTable();
        renderAmcDistribution();
    });

    amcFilterTop.addEventListener('change', (event) => {
        amcFilters.topN = Number(event.target.value || 0);
        renderAmcTable();
        renderAmcDistribution();
    });

    downloadReportsButton.addEventListener('click', () => {
        downloadReportsExcel();
    });

    importButton.addEventListener('click', async () => {
        setText('import-error', '');
        try {
            const file = fileInput.files?.[0] || null;
            const holdings = await importHoldingsFromFile(file);
            setText('import-status', `Loaded ${holdings.length} holding(s) into IndexedDB.`);
            await refreshMetrics();
            await refreshReport();
        } catch (error) {
            setText('import-error', error.message);
        }
    });

    syncCodesButton.addEventListener('click', async () => {
        setText('import-error', '');
        try {
            setText('import-status', 'Mapping scheme codes from MFAPI...');
            const result = await syncSchemeCodes();
            const unmatchedPart = result.unmatched.length ? ` Unmatched: ${result.unmatched.length}.` : '';
            setText('import-status', `Mapped codes for ${result.mapped} holding(s).${unmatchedPart}`);
            if (result.unmatched.length) {
                const sample = result.unmatched.slice(0, 8).join(' | ');
                setText('import-error', `Unmatched sample: ${sample}`);
            }
            await refreshMetrics();
            await refreshReport();
        } catch (error) {
            setText('import-error', error.message);
        }
    });

    fetchNavButton.addEventListener('click', async () => {
        setText('import-error', '');
        try {
            setText('import-status', 'Fetching NAV snapshots from MFAPI...');
            const result = await refreshNavSnapshots();
            setText('import-status', `NAV snapshots updated for ${result.successCount}/${result.requested} scheme(s).`);
            if (result.failures.length) {
                const sample = result.failures.slice(0, 5).map((item) => `${item.schemeCode}: ${item.reason}`).join(' | ');
                setText('import-error', `NAV failures for ${result.failures.length} scheme(s). ${sample}`);
            }
            await refreshMetrics();
            await refreshReport();
        } catch (error) {
            setText('import-error', error.message);
        }
    });

    clearDbButton.addEventListener('click', async () => {
        setText('import-error', '');
        const confirmed = window.confirm('This will clear holdings, scheme codes, and NAV snapshots from IndexedDB. Continue?');
        if (!confirmed) {
            return;
        }

        try {
            await clearAllData();
            setText('import-status', 'IndexedDB cleared. You can now do a clean import.');
            await refreshMetrics();
            await refreshReport();
        } catch (error) {
            setText('import-error', error.message || 'Failed to clear IndexedDB data.');
        }
    });

    refreshReportButton.addEventListener('click', async () => {
        setText('import-error', '');
        await refreshReport();
    });

    // ── Scheme Code Manager ────────────────────────────────────────────────
    if (refreshSchemeManager) {
        refreshSchemeManager.addEventListener('click', () => renderSchemeCodeManager());
    }

    if (downloadCodesCsvBtn) {
        downloadCodesCsvBtn.addEventListener('click', () => downloadSchemeCodesCsv());
    }

    if (bulkOverrideCodesBtn && bulkCodesFile) {
        bulkOverrideCodesBtn.addEventListener('click', () => bulkCodesFile.click());
        bulkCodesFile.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) {
                bulkOverrideCodesFromCsv(file);
                event.target.value = '';
            }
        });
    }

    if (schemeManagerBody) {
        // Event delegation: one listener for all "Apply" buttons in the table
        schemeManagerBody.addEventListener('click', async (event) => {
            const btn = event.target.closest('.apply-scheme-code-btn');
            if (!btn) return;
            const tr = btn.closest('tr[data-normalized]');
            if (!tr) return;
            await applySchemeCodeForRow(tr);
        });
    }

    // ── Comparison refresh ─────────────────────────────────────────────────
    if (refreshComparison) {
        refreshComparison.addEventListener('click', async () => {
            await refreshReport();
        });
    }

    refreshMetrics();
    refreshReport();
    renderSchemeCodeManager();
}


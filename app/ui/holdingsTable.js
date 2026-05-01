import { EVENTS } from '../shared/events.js';

function formatNumber(value) {
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function createCell(value, className = '') {
    const cell = document.createElement('td');
    cell.textContent = value;
    if (className) {
        cell.className = className;
    }
    return cell;
}

function renderRows(tableBodyElement, holdings, navByCode) {
    tableBodyElement.innerHTML = '';

    for (const holding of holdings) {
        const navQuote = navByCode[holding.schemeCode] || null;
        const latestNav = navQuote && !navQuote.error ? navQuote.nav : null;
        const currentValue = latestNav === null ? null : latestNav * holding.units;
        const investedValue = holding.avgCost * holding.units;
        const unrealized = currentValue === null ? null : currentValue - investedValue;

        const row = document.createElement('tr');
        row.appendChild(createCell(holding.schemeName || navQuote?.schemeName || '-'));
        row.appendChild(createCell(holding.schemeCode));
        row.appendChild(createCell(formatNumber(holding.units), 'numeric'));
        row.appendChild(createCell(formatNumber(holding.avgCost), 'numeric'));
        row.appendChild(createCell(latestNav === null ? '-' : formatNumber(latestNav), 'numeric'));
        row.appendChild(createCell(navQuote?.navDate || '-'));
        row.appendChild(createCell(currentValue === null ? '-' : formatNumber(currentValue), 'numeric'));
        row.appendChild(createCell(unrealized === null ? '-' : formatNumber(unrealized), 'numeric'));

        tableBodyElement.appendChild(row);
    }
}

export function initHoldingsTable({
    tableBodyElement,
    refreshButtonElement,
    statusElement,
    holdingsService,
    navService,
    eventBus,
}) {
    if (!tableBodyElement || !statusElement || !refreshButtonElement) {
        return;
    }

    let navByCode = {};

    const refreshTable = () => {
        renderRows(tableBodyElement, holdingsService.listHoldings(), navByCode);
    };

    const refreshNav = async () => {
        const holdings = holdingsService.listHoldings();
        if (holdings.length === 0) {
            statusElement.textContent = 'Add holdings first, then fetch NAV.';
            navByCode = {};
            refreshTable();
            return;
        }

        statusElement.textContent = 'Fetching latest NAV...';
        refreshButtonElement.disabled = true;

        navByCode = await navService.fetchLatestForHoldings(holdings);
        refreshTable();

        const failed = Object.values(navByCode).filter((item) => item.error).length;
        statusElement.textContent =
            failed === 0
                ? `NAV updated for ${holdings.length} holding(s).`
                : `NAV updated with ${failed} failure(s). Check missing rows.`;

        refreshButtonElement.disabled = false;
        eventBus.publish(EVENTS.NAV_REFRESHED, { source: 'UI', failed });
    };

    refreshButtonElement.addEventListener('click', () => {
        refreshNav();
    });

    eventBus.subscribe(EVENTS.HOLDING_CREATED, refreshTable);
    eventBus.subscribe(EVENTS.NAV_REFRESHED, refreshTable);

    refreshTable();
}


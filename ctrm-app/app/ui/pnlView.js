import { EVENTS } from '../shared/events.js';

export function initPnlView({ tableBodyElement, riskService, eventBus }) {
    if (!tableBodyElement) throw new Error('pnlView requires a tableBodyElement.');
    if (!riskService) throw new Error('pnlView requires a riskService.');
    if (!eventBus) throw new Error('pnlView requires an eventBus.');

    const refresh = async () => {
        const pnlRows = await riskService.calculatePnL();
        renderPnL(tableBodyElement, pnlRows);
    };

    eventBus.subscribe(EVENTS.TRADE_CREATED, refresh);
    eventBus.subscribe(EVENTS.MARKET_PRICE_UPDATED, refresh);
    refresh();

    return { refresh };
}

function renderPnL(tableBodyElement, pnlRows) {
    tableBodyElement.innerHTML = '';

    if (!pnlRows.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="2">No PnL data yet</td>';
        tableBodyElement.appendChild(tr);
        return;
    }

    pnlRows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(row.commodity)}</td>
            <td>${formatNumber(row.unrealizedPnL)}</td>
        `;
        tableBodyElement.appendChild(tr);
    });
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


import { EVENTS } from '../shared/events.js';

export function initPositionsDashboard({ tableBodyElement, riskService, eventBus }) {
    if (!tableBodyElement) throw new Error('positionsDashboard requires a tableBodyElement.');
    if (!riskService) throw new Error('positionsDashboard requires a riskService.');
    if (!eventBus) throw new Error('positionsDashboard requires an eventBus.');

    const refresh = async () => {
        const positions = await riskService.calculatePositions();
        renderPositions(tableBodyElement, positions);
    };

    eventBus.subscribe(EVENTS.TRADE_CREATED, refresh);
    refresh();

    return { refresh };
}

function renderPositions(tableBodyElement, positions) {
    tableBodyElement.innerHTML = '';

    if (!positions.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="3">No positions yet</td>';
        tableBodyElement.appendChild(tr);
        return;
    }

    positions.forEach((position) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(position.commodity)}</td>
            <td>${formatNumber(position.netQuantity)}</td>
            <td>${formatNumber(position.avgPrice)}</td>
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


import { createTable } from '../../ui/components/table.js';
import { validateFulfilmentQty } from '../../services/validationService.js';
import { nowIso, toNumber } from '../../core/utils.js';

export function initFulfilmentModule(ctx) {
    const { container, repos, bus, toast } = ctx;

    container.innerHTML = `
        <div class="card">
            <h2>Fulfilment</h2>
            <div class="form-grid">
                <label>
                    Order
                    <select id="ful-order"></select>
                </label>
                <label>
                    Pending Qty
                    <input id="ful-pending" type="number" readonly />
                </label>
                <label>
                    Shipped Qty
                    <input id="ful-shipped" type="number" min="0.0001" step="any" />
                </label>
            </div>
            <div class="inline">
                <button type="button" class="primary" id="ful-save">Record Shipment</button>
            </div>
            <div id="ful-error" class="error-text"></div>
        </div>
        <div class="card">
            <h3>Fulfilment Records</h3>
            <div id="ful-table"></div>
        </div>
    `;

    const orderSelect = container.querySelector('#ful-order');
    const pendingInput = container.querySelector('#ful-pending');
    const shippedInput = container.querySelector('#ful-shipped');
    const errorEl = container.querySelector('#ful-error');

    const table = createTable({
        container: container.querySelector('#ful-table'),
        columns: [
            { key: 'fulfilmentId', label: 'Fulfilment ID' },
            { key: 'orderId', label: 'Order ID' },
            { key: 'shippedQty', label: 'Shipped Qty' },
            { key: 'status', label: 'Status' },
            { key: 'date', label: 'Date' },
        ],
    });

    container.querySelector('#ful-save').addEventListener('click', recordFulfilment);
    orderSelect.addEventListener('change', refreshPending);

    bus.on('orders:changed', refreshOrderOptions);
    bus.on('fulfilments:changed', refreshTable);

    async function refreshOrderOptions() {
        const orders = await repos.orders.getAll();
        orderSelect.innerHTML = orders.map((o) => `<option value="${o.orderId}">${o.orderId} (${o.status})</option>`).join('');
        await refreshPending();
    }

    async function refreshPending() {
        const orderId = orderSelect.value;
        if (!orderId) {
            pendingInput.value = '';
            return;
        }

        const order = await repos.orders.get(orderId);
        const fulfilments = await repos.fulfilments.findByOrder(orderId);

        const orderedQty = (order?.items || []).reduce((sum, item) => sum + toNumber(item.quantity), 0);
        const shippedQty = fulfilments.reduce((sum, f) => sum + toNumber(f.shippedQty), 0);
        pendingInput.value = Math.max(0, orderedQty - shippedQty).toString();
    }

    async function recordFulfilment() {
        try {
            const orderId = orderSelect.value;
            const shippedQty = toNumber(shippedInput.value);
            const pending = toNumber(pendingInput.value);

            if (!orderId) throw new Error('Select an order.');
            validateFulfilmentQty({ orderPendingQty: pending, shippedQty });

            await repos.fulfilments.create({
                fulfilmentId: '',
                orderId,
                shippedQty,
                date: nowIso(),
                status: 'SHIPPED',
            });

            const remaining = pending - shippedQty;
            const order = await repos.orders.get(orderId);
            await repos.orders.update({
                ...order,
                status: remaining <= 0 ? 'SHIPPED' : 'PARTIAL',
            });

            shippedInput.value = '';
            bus.emit('orders:changed');
            bus.emit('fulfilments:changed');
            toast.show('Fulfilment recorded.');
        } catch (error) {
            errorEl.textContent = error.message;
        }
    }

    async function refreshTable() {
        const rows = await repos.fulfilments.getAll(true);
        table.render(rows);
        await refreshPending();
    }

    refreshOrderOptions();
    refreshTable();

    return { refresh: refreshTable };
}


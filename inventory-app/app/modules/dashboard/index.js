import { toNumber } from '../../core/utils.js';

export function initDashboardModule(ctx) {
    const { container, repos, bus } = ctx;

    container.innerHTML = `
        <div class="card">
            <h2>Dashboard</h2>
            <div class="summary-grid">
                <div class="metric">
                    <div class="small">Total Inventory Qty</div>
                    <div class="value" id="m-inv">0</div>
                </div>
                <div class="metric">
                    <div class="small">Total Orders</div>
                    <div class="value" id="m-orders">0</div>
                </div>
                <div class="metric">
                    <div class="small">Pending Fulfilments</div>
                    <div class="value" id="m-pending">0</div>
                </div>
            </div>
        </div>
    `;

    const invEl = container.querySelector('#m-inv');
    const ordersEl = container.querySelector('#m-orders');
    const pendingEl = container.querySelector('#m-pending');

    bus.on('commodityMaster:changed', refresh);
    bus.on('orders:changed', refresh);
    bus.on('fulfilments:changed', refresh);

    async function refresh() {
        const [inventory, orders, fulfilments] = await Promise.all([
            repos.commodityMaster.getAll(),
            repos.orders.getAll(),
            repos.fulfilments.getAll(),
        ]);

        const totalInv = inventory.reduce((sum, row) => sum + toNumber(row.quantity), 0);
        const totalOrders = orders.length;

        let pendingCount = 0;
        for (const order of orders) {
            const orderedQty = (order.items || []).reduce((sum, item) => sum + toNumber(item.quantity), 0);
            const fulfilled = fulfilments
                .filter((f) => f.orderId === order.orderId)
                .reduce((sum, f) => sum + toNumber(f.shippedQty), 0);
            if (orderedQty > fulfilled) {
                pendingCount += 1;
            }
        }

        invEl.textContent = totalInv.toFixed(2);
        ordersEl.textContent = String(totalOrders);
        pendingEl.textContent = String(pendingCount);
    }

    refresh();
    return { refresh };
}


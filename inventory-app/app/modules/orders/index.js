import { createTable } from '../../ui/components/table.js';
import { validateRequired, validatePositiveNumber } from '../../services/validationService.js';
import { nowIso, normalizeText, toNumber } from '../../core/utils.js';

export function initOrdersModule(ctx) {
    const { container, repos, bus, toast } = ctx;

    container.innerHTML = `
        <div class="card">
            <h2>Order Booking</h2>
            <div class="form-grid">
                <label>
                    Buyer
                    <select id="order-buyer"></select>
                </label>
            </div>
            <div class="toolbar">
                <div class="inline">
                    <button type="button" class="ghost" id="add-order-item">Add Item</button>
                    <button type="button" class="primary" id="save-order">Save Order</button>
                </div>
                <div id="order-total" class="small">Total: 0</div>
            </div>
            <div id="order-items" class="card"></div>
            <div id="order-error" class="error-text"></div>
        </div>
        <div class="card">
            <h3>Orders</h3>
            <div id="orders-table"></div>
        </div>
    `;

    const buyerSelect = container.querySelector('#order-buyer');
    const itemsHost = container.querySelector('#order-items');
    const errorEl = container.querySelector('#order-error');
    const totalEl = container.querySelector('#order-total');

    const table = createTable({
        container: container.querySelector('#orders-table'),
        columns: [
            { key: 'orderId', label: 'Order ID' },
            { key: 'buyerId', label: 'Buyer' },
            { key: 'status', label: 'Status' },
            { key: 'createdAt', label: 'Created' },
            { key: 'total', label: 'Total', formatter: (v) => Number(v || 0).toFixed(2) },
        ],
    });

    const lineItems = [];

    container.querySelector('#add-order-item').addEventListener('click', addLineItem);
    container.querySelector('#save-order').addEventListener('click', saveOrder);

    bus.on('buyers:changed', refreshBuyerOptions);
    bus.on('commodityMaster:changed', () => {
        renderLineItems();
    });
    bus.on('orders:changed', refreshOrders);

    async function refreshBuyerOptions() {
        const buyers = await repos.buyers.getAll();
        buyerSelect.innerHTML = buyers.map((b) => `<option value="${b.buyerId}">${b.buyerId} - ${b.name}</option>`).join('');
    }

    async function addLineItem() {
        const masterRows = await repos.commodityMaster.getAll();
        const defaultCommodity = masterRows[0]?.commodityId || '';
        const defaultPrice = masterRows[0]?.price || 0;
        lineItems.push({ commodityId: defaultCommodity, quantity: 1, price: defaultPrice });
        renderLineItems();
    }

    async function renderLineItems() {
        const masterRows = await repos.commodityMaster.getAll();
        itemsHost.innerHTML = '';

        lineItems.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'form-grid';

            const commodityLabel = document.createElement('label');
            commodityLabel.textContent = 'Commodity';
            const commoditySelect = document.createElement('select');
            commoditySelect.innerHTML = masterRows.map((m) => `<option value="${m.commodityId}" ${m.commodityId === item.commodityId ? 'selected' : ''}>${m.commodityId} (${m.price})</option>`).join('');
            commoditySelect.addEventListener('change', () => {
                item.commodityId = commoditySelect.value;
                const selected = masterRows.find((m) => m.commodityId === item.commodityId);
                item.price = Number(selected?.price || item.price || 0);
                renderLineItems();
            });
            commodityLabel.appendChild(commoditySelect);

            const qtyLabel = document.createElement('label');
            qtyLabel.textContent = 'Quantity';
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '0.0001';
            qtyInput.step = 'any';
            qtyInput.value = item.quantity;
            qtyInput.addEventListener('input', () => {
                item.quantity = toNumber(qtyInput.value);
                refreshTotals();
            });
            qtyLabel.appendChild(qtyInput);

            const priceLabel = document.createElement('label');
            priceLabel.textContent = 'Price';
            const priceInput = document.createElement('input');
            priceInput.type = 'number';
            priceInput.min = '0.0001';
            priceInput.step = 'any';
            priceInput.value = item.price;
            priceInput.addEventListener('input', () => {
                item.price = toNumber(priceInput.value);
                refreshTotals();
            });
            priceLabel.appendChild(priceInput);

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'danger';
            deleteBtn.textContent = 'Remove';
            deleteBtn.addEventListener('click', () => {
                lineItems.splice(index, 1);
                renderLineItems();
            });

            row.append(commodityLabel, qtyLabel, priceLabel, deleteBtn);
            itemsHost.appendChild(row);
        });

        refreshTotals();
    }

    function refreshTotals() {
        const total = lineItems.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.price), 0);
        totalEl.textContent = `Total: ${total.toFixed(2)}`;
    }

    async function saveOrder() {
        try {
            setError('');
            validateRequired(['value'], { value: buyerSelect.value });
            if (!lineItems.length) {
                throw new Error('Add at least one order item.');
            }

            lineItems.forEach((item) => {
                validateRequired(['commodityId', 'quantity', 'price'], item);
                validatePositiveNumber('Quantity', item.quantity);
                validatePositiveNumber('Price', item.price);
            });

            const payload = {
                orderId: '',
                buyerId: normalizeText(buyerSelect.value).toUpperCase(),
                items: lineItems.map((item) => ({
                    commodityId: normalizeText(item.commodityId).toUpperCase(),
                    quantity: toNumber(item.quantity),
                    price: toNumber(item.price),
                })),
                status: 'BOOKED',
                createdAt: nowIso(),
                total: lineItems.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.price), 0),
            };

            await repos.orders.create(payload);
            lineItems.splice(0, lineItems.length);
            renderLineItems();
            bus.emit('orders:changed');
            toast.show('Order created.');
        } catch (error) {
            setError(error.message);
        }
    }

    async function refreshOrders() {
        const rows = await repos.orders.getAll(true);
        table.render(rows);
    }

    function setError(message) {
        errorEl.textContent = message || '';
    }

    refreshBuyerOptions();
    refreshOrders();
    addLineItem();

    return { refresh: refreshOrders };
}


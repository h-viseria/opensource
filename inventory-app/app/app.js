import { IndexedDbClient, STORE_SCHEMAS } from './core/db.js';
import { createRepository } from './core/repository.js';
import { createEventBus } from './core/eventBus.js';
import { initNavbar } from './ui/components/navbar.js';
import { createToastManager } from './ui/components/modal.js';
import { exportStoresToExcel } from './services/excelService.js';

import { initDashboardModule } from './modules/dashboard/index.js';
import { initSuppliersModule } from './modules/suppliers/index.js';
import { initBuyersModule } from './modules/buyers/index.js';
import { initCommoditiesModule } from './modules/commodities/index.js';
import { initCommodityMasterModule } from './modules/commodityMaster/index.js';
import { initOrdersModule } from './modules/orders/index.js';
import { initFulfilmentModule } from './modules/fulfilment/index.js';

const db = new IndexedDbClient();
await db.open();

const repos = {
    suppliers: createRepository({ db, storeName: 'suppliers', idKey: 'supplierId', idPrefix: 'SUP' }),
    buyers: createRepository({ db, storeName: 'buyers', idKey: 'buyerId', idPrefix: 'BUY' }),
    commodities: createRepository({ db, storeName: 'commodities', idKey: 'commodityId', idPrefix: 'CMD' }),
    commodityMaster: createRepository({ db, storeName: 'commodityMaster', idKey: 'id', idPrefix: 'CM' }),
    orders: createRepository({ db, storeName: 'orders', idKey: 'orderId', idPrefix: 'ORD' }),
    fulfilments: createRepository({ db, storeName: 'fulfilments', idKey: 'fulfilmentId', idPrefix: 'FUL' }),
};

repos.orders.findByBuyer = (buyerId) => repos.orders.queryByIndex('buyerId', buyerId);
repos.fulfilments.findByOrder = (orderId) => repos.fulfilments.queryByIndex('orderId', orderId);

const bus = createEventBus();
const toast = createToastManager({ hostElement: document.getElementById('toast-host') });

await seedDataIfEmpty(repos);

const modulesContext = {
    repos,
    bus,
    toast,
};

const moduleMap = {
    dashboard: initDashboardModule({ ...modulesContext, container: document.getElementById('tab-dashboard') }),
    suppliers: initSuppliersModule({ ...modulesContext, container: document.getElementById('tab-suppliers') }),
    buyers: initBuyersModule({ ...modulesContext, container: document.getElementById('tab-buyers') }),
    commodities: initCommoditiesModule({ ...modulesContext, container: document.getElementById('tab-commodities') }),
    commodityMaster: initCommodityMasterModule({ ...modulesContext, container: document.getElementById('tab-commodityMaster') }),
    orders: initOrdersModule({ ...modulesContext, container: document.getElementById('tab-orders') }),
    fulfilment: initFulfilmentModule({ ...modulesContext, container: document.getElementById('tab-fulfilment') }),
};

const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'buyers', label: 'Buyers' },
    { id: 'commodities', label: 'Commodities' },
    { id: 'commodityMaster', label: 'Commodity Master' },
    { id: 'orders', label: 'Orders' },
    { id: 'fulfilment', label: 'Fulfilment' },
];

initNavbar({
    container: document.getElementById('nav-root'),
    tabs,
    initialTab: 'dashboard',
    onChange: (tabId) => {
        tabs.forEach((tab) => {
            const panel = document.getElementById(`tab-${tab.id}`);
            panel.classList.toggle('active', tab.id === tabId);
        });
    },
});

wireGlobalExport();
emitInitialEvents();

function emitInitialEvents() {
    bus.emit('suppliers:changed');
    bus.emit('buyers:changed');
    bus.emit('commodities:changed');
    bus.emit('commodityMaster:changed');
    bus.emit('orders:changed');
    bus.emit('fulfilments:changed');
}

function wireGlobalExport() {
    const topbar = document.querySelector('.topbar');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost';
    btn.textContent = 'Export All Excel';
    btn.addEventListener('click', async () => {
        const stores = Object.keys(STORE_SCHEMAS);
        const output = {};
        for (const store of stores) {
            output[store] = await repos[store].getAll();
        }
        exportStoresToExcel(output, 'inventory-all.xlsx');
    });
    topbar.appendChild(btn);
}

async function seedDataIfEmpty(repositories) {
    const [suppliers, buyers, commodities, cmRows, orders] = await Promise.all([
        repositories.suppliers.getAll(),
        repositories.buyers.getAll(),
        repositories.commodities.getAll(),
        repositories.commodityMaster.getAll(),
        repositories.orders.getAll(),
    ]);

    if (!suppliers.length) {
        await repositories.suppliers.create({ supplierId: 'SUP001', name: 'ABC Traders', contact: 'John +1 555-0100', address: 'Houston' });
        await repositories.suppliers.create({ supplierId: 'SUP002', name: 'Global Energy Ltd', contact: 'Mira +1 555-0101', address: 'Dubai' });
    }

    if (!buyers.length) {
        await repositories.buyers.create({ buyerId: 'BUY001', name: 'Metro Refinery', contact: 'Ops +1 555-0120', address: 'Singapore' });
        await repositories.buyers.create({ buyerId: 'BUY002', name: 'North Grid', contact: 'Desk +1 555-0121', address: 'Rotterdam' });
    }

    if (!commodities.length) {
        await repositories.commodities.create({ commodityId: 'CMD001', name: 'Crude Oil', unit: 'Barrels', category: 'Energy' });
        await repositories.commodities.create({ commodityId: 'CMD002', name: 'Natural Gas', unit: 'MMBtu', category: 'Energy' });
    }

    if (!cmRows.length) {
        await repositories.commodityMaster.create({ id: 'CM001', commodityId: 'CMD001', supplierId: 'SUP001', price: 85.5, quantity: 10000, lastUpdated: new Date().toISOString() });
        await repositories.commodityMaster.create({ id: 'CM002', commodityId: 'CMD002', supplierId: 'SUP002', price: 3.2, quantity: 50000, lastUpdated: new Date().toISOString() });
    }

    if (!orders.length) {
        await repositories.orders.create({
            orderId: 'ORD001',
            buyerId: 'BUY001',
            items: [{ commodityId: 'CMD001', quantity: 500, price: 86 }],
            status: 'BOOKED',
            total: 43000,
            createdAt: new Date().toISOString(),
        });
    }
}


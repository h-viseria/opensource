import { createForm } from '../../ui/components/form.js';
import { createTable } from '../../ui/components/table.js';
import { createFileUpload } from '../../ui/components/fileUpload.js';
import { importExcelRows, exportRowsToExcel } from '../../services/excelService.js';
import { validatePositiveNumber, validateRequired } from '../../services/validationService.js';
import { nowIso, normalizeText, toNumber } from '../../core/utils.js';

export function initCommodityMasterModule(ctx) {
    const { container, repos, bus, toast } = ctx;

    container.innerHTML = `
        <div class="card">
            <h2>Commodity Master (Inventory)</h2>
            <div data-role="error" class="error-text"></div>
            <div data-role="upload" class="inline"></div>
            <div data-role="form"></div>
        </div>
        <div class="card">
            <button type="button" class="ghost" data-role="export">Export Excel</button>
            <div data-role="table"></div>
        </div>
    `;

    const errorEl = container.querySelector('[data-role="error"]');
    const formHost = container.querySelector('[data-role="form"]');
    const tableHost = container.querySelector('[data-role="table"]');

    const form = createForm({
        container: formHost,
        fields: [
            { name: 'id', label: 'Commodity Master ID (optional)', type: 'text' },
            { name: 'commodityId', label: 'Commodity', type: 'select', required: true, options: [] },
            { name: 'supplierId', label: 'Supplier', type: 'select', required: true, options: [] },
            { name: 'price', label: 'Price', type: 'number', min: 0.0001, step: 'any', required: true },
            { name: 'quantity', label: 'Quantity', type: 'number', min: 0.0001, step: 'any', required: true },
        ],
        submitLabel: 'Add Inventory',
        onSubmit: async (payload, nativeForm) => {
            try {
                setError('');
                validateRequired(['commodityId', 'supplierId', 'price', 'quantity'], payload);
                validatePositiveNumber('Price', payload.price);
                validatePositiveNumber('Quantity', payload.quantity);
                await repos.commodityMaster.create({
                    id: normalizeText(payload.id).toUpperCase(),
                    commodityId: normalizeText(payload.commodityId).toUpperCase(),
                    supplierId: normalizeText(payload.supplierId).toUpperCase(),
                    price: toNumber(payload.price),
                    quantity: toNumber(payload.quantity),
                    lastUpdated: nowIso(),
                });
                nativeForm.reset();
                toast.show('Commodity master row added.');
                bus.emit('commodityMaster:changed');
            } catch (error) {
                setError(error.message);
            }
        },
    });

    const table = createTable({
        container: tableHost,
        columns: [
            { key: 'id', label: 'ID' },
            { key: 'commodityId', label: 'Commodity' },
            { key: 'supplierId', label: 'Supplier' },
            { key: 'price', label: 'Price' },
            { key: 'quantity', label: 'Qty' },
            { key: 'lastUpdated', label: 'Last Updated' },
        ],
        rowActions: [
            {
                label: 'Delete',
                className: 'danger',
                handler: async (row) => {
                    await repos.commodityMaster.delete(row.id);
                    bus.emit('commodityMaster:changed');
                    toast.show('Commodity master row deleted.');
                },
            },
        ],
    });

    createFileUpload({
        container: container.querySelector('[data-role="upload"]'),
        label: 'Import Excel',
        onFileSelected: async (file) => {
            try {
                const rows = await importExcelRows(file);
                for (const row of rows) {
                    await repos.commodityMaster.create({
                        id: normalizeText(row.id).toUpperCase(),
                        commodityId: normalizeText(row.commodityId).toUpperCase(),
                        supplierId: normalizeText(row.supplierId).toUpperCase(),
                        price: toNumber(row.price),
                        quantity: toNumber(row.quantity),
                        lastUpdated: row.lastUpdated || nowIso(),
                    });
                }
                bus.emit('commodityMaster:changed');
                toast.show(`Imported ${rows.length} row(s).`);
            } catch (error) {
                setError(error.message);
            }
        },
    });

    container.querySelector('[data-role="export"]').addEventListener('click', async () => {
        const rows = await repos.commodityMaster.getAll();
        exportRowsToExcel(rows, 'CommodityMaster', 'commodityMaster-export.xlsx');
    });

    bus.on('commodities:changed', refreshOptions);
    bus.on('suppliers:changed', refreshOptions);
    bus.on('commodityMaster:changed', refreshTable);

    async function refreshOptions() {
        const commodities = await repos.commodities.getAll();
        const suppliers = await repos.suppliers.getAll();

        form.setOptions('commodityId', commodities.map((c) => ({ value: c.commodityId, label: `${c.commodityId} - ${c.name}` })));
        form.setOptions('supplierId', suppliers.map((s) => ({ value: s.supplierId, label: `${s.supplierId} - ${s.name}` })));
    }

    async function refreshTable() {
        const rows = await repos.commodityMaster.getAll(true);
        table.render(rows);
    }

    function setError(message) {
        errorEl.textContent = message || '';
    }

    refreshOptions();
    refreshTable();

    return { refresh: refreshTable };
}


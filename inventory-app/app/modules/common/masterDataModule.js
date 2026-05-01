import { createForm } from '../../ui/components/form.js';
import { createTable } from '../../ui/components/table.js';
import { createModal } from '../../ui/components/modal.js';
import { createFileUpload } from '../../ui/components/fileUpload.js';
import { importExcelRows, exportRowsToExcel } from '../../services/excelService.js';
import { validateRequired, validatePositiveNumber, validateUniqueId } from '../../services/validationService.js';
import { nowIso, toNumber } from '../../core/utils.js';

export function createMasterDataModule({
    container,
    title,
    repo,
    idKey,
    requiredFields,
    fields,
    tableColumns,
    bus,
    eventPrefix,
    normalize,
    numericPositiveFields = [],
    toast,
}) {
    const modal = createModal();

    container.innerHTML = `
        <div class="card">
            <h2>${title}</h2>
            <div data-role="error" class="error-text"></div>
            <div data-role="upload" class="inline"></div>
            <div data-role="form"></div>
        </div>
        <div class="card">
            <div class="toolbar">
                <div class="inline">
                    <button type="button" class="ghost" data-role="export">Export Excel</button>
                </div>
            </div>
            <div data-role="table"></div>
        </div>
    `;

    const errorEl = container.querySelector('[data-role="error"]');
    const formHost = container.querySelector('[data-role="form"]');
    const tableHost = container.querySelector('[data-role="table"]');
    const uploadHost = container.querySelector('[data-role="upload"]');
    const exportBtn = container.querySelector('[data-role="export"]');

    const table = createTable({
        container: tableHost,
        columns: tableColumns,
        rowActions: [
            {
                label: 'Edit',
                className: 'ghost',
                handler: (row) => openEdit(row),
            },
            {
                label: 'Delete',
                className: 'danger',
                handler: async (row) => {
                    await repo.delete(row[idKey]);
                    bus.emit(`${eventPrefix}:changed`, row);
                    toast.show(`${title} deleted.`);
                    await refresh();
                },
            },
        ],
    });

    const form = createForm({
        container: formHost,
        fields,
        submitLabel: `Add ${title}`,
        onSubmit: async (payload, nativeForm) => {
            await saveNew(payload);
            nativeForm.reset();
        },
    });

    createFileUpload({
        container: uploadHost,
        label: 'Import Excel',
        onFileSelected: async (file) => {
            try {
                const rows = await importExcelRows(file);
                for (const row of rows) {
                    await saveNew(row, { quiet: true });
                }
                await refresh();
                toast.show(`Imported ${rows.length} row(s).`);
            } catch (error) {
                setError(error.message);
            }
        },
    });

    exportBtn.addEventListener('click', async () => {
        const rows = await repo.getAll();
        exportRowsToExcel(rows, title, `${eventPrefix}-export.xlsx`);
    });

    bus.on(`${eventPrefix}:changed`, refresh);

    async function saveNew(payload, { quiet = false } = {}) {
        try {
            setError('');
            const rows = await repo.getAll();
            const merged = normalize ? normalize(payload) : payload;
            validateRequired(requiredFields, merged);

            if (merged[idKey]) {
                validateUniqueId(rows, idKey, merged[idKey]);
            }

            numericPositiveFields.forEach((field) => validatePositiveNumber(field, merged[field]));

            if (!merged.lastUpdated && fields.some((f) => f.name === 'lastUpdated')) {
                merged.lastUpdated = nowIso();
            }

            await repo.create(merged);
            bus.emit(`${eventPrefix}:changed`, merged);
            if (!quiet) toast.show(`${title} added.`);
        } catch (error) {
            setError(error.message);
            if (!quiet) throw error;
        }
    }

    function openEdit(row) {
        const holder = document.createElement('div');
        const editFields = fields.map((field) => ({ ...field }));
        const editForm = createForm({
            container: holder,
            fields: editFields,
            submitLabel: `Update ${title}`,
            onSubmit: async (payload) => {
                const merged = {
                    ...row,
                    ...payload,
                };
                const normalized = normalize ? normalize(merged) : merged;
                validateRequired(requiredFields, normalized);
                numericPositiveFields.forEach((field) => validatePositiveNumber(field, normalized[field]));
                if (normalized.lastUpdated !== undefined) {
                    normalized.lastUpdated = nowIso();
                }
                await repo.update(normalized);
                bus.emit(`${eventPrefix}:changed`, normalized);
                toast.show(`${title} updated.`);
                await refresh();
            },
        });
        editForm.setValues(row);

        modal.show({
            title: `Edit ${title}`,
            bodyNode: holder,
            confirmLabel: 'Close',
        });
    }

    function setError(message) {
        errorEl.textContent = message || '';
    }

    async function refresh() {
        const rows = await repo.getAll(true);
        table.render(rows.map((row) => ({
            ...row,
            quantity: row.quantity !== undefined ? toNumber(row.quantity) : row.quantity,
            price: row.price !== undefined ? toNumber(row.price) : row.price,
        })));
    }

    refresh();
    return { refresh, form };
}


import { createMasterDataModule } from '../common/masterDataModule.js';
import { normalizeText } from '../../core/utils.js';

export function initSuppliersModule(ctx) {
    return createMasterDataModule({
        container: ctx.container,
        title: 'Suppliers',
        repo: ctx.repos.suppliers,
        idKey: 'supplierId',
        requiredFields: ['name'],
        eventPrefix: 'suppliers',
        toast: ctx.toast,
        bus: ctx.bus,
        fields: [
            { name: 'supplierId', label: 'Supplier ID (optional)', type: 'text' },
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'contact', label: 'Contact', type: 'text' },
            { name: 'address', label: 'Address', type: 'text' },
        ],
        tableColumns: [
            { key: 'supplierId', label: 'Supplier ID' },
            { key: 'name', label: 'Name' },
            { key: 'contact', label: 'Contact' },
            { key: 'address', label: 'Address' },
        ],
        normalize: (payload) => ({
            supplierId: normalizeText(payload.supplierId).toUpperCase(),
            name: normalizeText(payload.name),
            contact: normalizeText(payload.contact),
            address: normalizeText(payload.address),
        }),
    });
}


import { createMasterDataModule } from '../common/masterDataModule.js';
import { normalizeText } from '../../core/utils.js';

export function initBuyersModule(ctx) {
    return createMasterDataModule({
        container: ctx.container,
        title: 'Buyers',
        repo: ctx.repos.buyers,
        idKey: 'buyerId',
        requiredFields: ['name'],
        eventPrefix: 'buyers',
        toast: ctx.toast,
        bus: ctx.bus,
        fields: [
            { name: 'buyerId', label: 'Buyer ID (optional)', type: 'text' },
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'contact', label: 'Contact', type: 'text' },
            { name: 'address', label: 'Address', type: 'text' },
        ],
        tableColumns: [
            { key: 'buyerId', label: 'Buyer ID' },
            { key: 'name', label: 'Name' },
            { key: 'contact', label: 'Contact' },
            { key: 'address', label: 'Address' },
        ],
        normalize: (payload) => ({
            buyerId: normalizeText(payload.buyerId).toUpperCase(),
            name: normalizeText(payload.name),
            contact: normalizeText(payload.contact),
            address: normalizeText(payload.address),
        }),
    });
}


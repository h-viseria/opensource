import { createMasterDataModule } from '../common/masterDataModule.js';
import { normalizeText } from '../../core/utils.js';

export function initCommoditiesModule(ctx) {
    return createMasterDataModule({
        container: ctx.container,
        title: 'Commodities',
        repo: ctx.repos.commodities,
        idKey: 'commodityId',
        requiredFields: ['name', 'unit', 'category'],
        eventPrefix: 'commodities',
        toast: ctx.toast,
        bus: ctx.bus,
        fields: [
            { name: 'commodityId', label: 'Commodity ID (optional)', type: 'text' },
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'unit', label: 'Unit', type: 'text', required: true },
            { name: 'category', label: 'Category', type: 'text', required: true },
        ],
        tableColumns: [
            { key: 'commodityId', label: 'Commodity ID' },
            { key: 'name', label: 'Name' },
            { key: 'unit', label: 'Unit' },
            { key: 'category', label: 'Category' },
        ],
        normalize: (payload) => ({
            commodityId: normalizeText(payload.commodityId).toUpperCase(),
            name: normalizeText(payload.name),
            unit: normalizeText(payload.unit),
            category: normalizeText(payload.category),
        }),
    });
}


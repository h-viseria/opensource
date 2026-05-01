import { toNumber } from '../core/utils.js';

export function validateRequired(fields, payload) {
    const missing = fields.filter((field) => !String(payload[field] ?? '').trim());
    if (missing.length) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
}

export function validatePositiveNumber(fieldName, value) {
    if (toNumber(value) <= 0) {
        throw new Error(`${fieldName} must be greater than 0.`);
    }
}

export function validateUniqueId(existingRows, idKey, idValue, ignoreId = null) {
    const exists = existingRows.some((row) => row[idKey] === idValue && row[idKey] !== ignoreId);
    if (exists) {
        throw new Error(`${idKey} ${idValue} already exists.`);
    }
}

export function validateFulfilmentQty({ orderPendingQty, shippedQty }) {
    if (toNumber(shippedQty) <= 0) {
        throw new Error('Shipped quantity must be greater than 0.');
    }
    if (toNumber(shippedQty) > toNumber(orderPendingQty)) {
        throw new Error('Cannot fulfil more than pending quantity.');
    }
}


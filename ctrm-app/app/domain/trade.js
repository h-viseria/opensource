const VALID_SIDES = new Set(['BUY', 'SELL']);

export function createTrade(tradeData) {
    const normalized = normalizeTrade(tradeData);
    validateTrade(normalized);
    return normalized;
}

export function normalizeTrade(tradeData = {}) {
    return {
        id: String(tradeData.id || '').trim(),
        commodity: String(tradeData.commodity || '').trim().toUpperCase(),
        buySell: String(tradeData.buySell || '').trim().toUpperCase(),
        quantity: Number(tradeData.quantity),
        price: Number(tradeData.price),
        tradeDate: String(tradeData.tradeDate || '').trim(),
        counterparty: String(tradeData.counterparty || '').trim(),
    };
}

export function validateTrade(trade) {
    if (!trade.id) throw new Error('Trade id is required.');
    if (!trade.commodity) throw new Error('Commodity is required.');
    if (!VALID_SIDES.has(trade.buySell)) throw new Error('buySell must be BUY or SELL.');
    if (!Number.isFinite(trade.quantity) || trade.quantity <= 0) throw new Error('Quantity must be a positive number.');
    if (!Number.isFinite(trade.price) || trade.price <= 0) throw new Error('Price must be a positive number.');
    if (!trade.tradeDate) throw new Error('tradeDate is required.');
    if (!trade.counterparty) throw new Error('Counterparty is required.');
    return true;
}

export function getSignedQuantity(trade) {
    return trade.buySell === 'BUY' ? trade.quantity : -trade.quantity;
}


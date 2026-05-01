import { getSignedQuantity } from './trade.js';

export function calculatePositionsByCommodity(trades = []) {
    const byCommodity = new Map();

    trades.forEach((trade) => {
        const commodity = trade.commodity;
        if (!byCommodity.has(commodity)) {
            byCommodity.set(commodity, {
                commodity,
                netQuantity: 0,
                totalAbsoluteQuantity: 0,
                totalNotional: 0,
                avgPrice: 0,
            });
        }

        const row = byCommodity.get(commodity);
        const signedQuantity = getSignedQuantity(trade);
        const absoluteQuantity = Math.abs(Number(trade.quantity) || 0);
        const tradePrice = Number(trade.price) || 0;

        row.netQuantity += signedQuantity;
        row.totalAbsoluteQuantity += absoluteQuantity;
        row.totalNotional += absoluteQuantity * tradePrice;
        row.avgPrice = row.totalAbsoluteQuantity > 0 ? row.totalNotional / row.totalAbsoluteQuantity : 0;
    });

    return Array.from(byCommodity.values()).sort((a, b) => a.commodity.localeCompare(b.commodity));
}


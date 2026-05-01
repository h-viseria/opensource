export function calculateUnrealizedPnL(positions = [], marketPrices = {}) {
    const priceMap = toPriceMap(marketPrices);

    return positions.map((position) => {
        const marketPrice = Number(priceMap.get(position.commodity) || 0);
        const avgPrice = Number(position.avgPrice || 0);
        const netQuantity = Number(position.netQuantity || 0);
        const unrealizedPnL = (marketPrice - avgPrice) * netQuantity;

        return {
            commodity: position.commodity,
            netQuantity,
            avgPrice,
            marketPrice,
            unrealizedPnL,
        };
    });
}

function toPriceMap(marketPrices) {
    if (marketPrices instanceof Map) return marketPrices;

    if (Array.isArray(marketPrices)) {
        const map = new Map();
        marketPrices.forEach((item) => {
            if (!item || !item.commodity) return;
            map.set(String(item.commodity).toUpperCase(), Number(item.marketPrice));
        });
        return map;
    }

    const map = new Map();
    Object.entries(marketPrices || {}).forEach(([commodity, price]) => {
        map.set(String(commodity).toUpperCase(), Number(price));
    });
    return map;
}


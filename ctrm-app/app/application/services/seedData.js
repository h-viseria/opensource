const SAMPLE_TRADES = [
    {
        commodity: 'GOLD',
        buySell: 'BUY',
        quantity: 10,
        price: 100,
        counterparty: 'ALPHA_METALS',
        tradeDate: '2026-04-20T09:00:00.000Z',
    },
    {
        commodity: 'GOLD',
        buySell: 'SELL',
        quantity: 2,
        price: 105,
        counterparty: 'BETA_TRADING',
        tradeDate: '2026-04-21T11:15:00.000Z',
    },
    {
        commodity: 'OIL',
        buySell: 'SELL',
        quantity: 5,
        price: 70,
        counterparty: 'DELTA_ENERGY',
        tradeDate: '2026-04-20T10:30:00.000Z',
    },
    {
        commodity: 'OIL',
        buySell: 'BUY',
        quantity: 1,
        price: 68,
        counterparty: 'GAMMA_SUPPLY',
        tradeDate: '2026-04-22T14:45:00.000Z',
    },
];

const SAMPLE_MARKET_PRICES = {
    GOLD: 110,
    OIL: 65,
};

export async function seedInitialData({ tradeService, marketPriceService }) {
    if (!tradeService) throw new Error('seedInitialData requires tradeService.');
    if (!marketPriceService) throw new Error('seedInitialData requires marketPriceService.');

    const [existingTrades, existingPrices] = await Promise.all([
        tradeService.getAllTrades(),
        marketPriceService.getLatestPrices(),
    ]);

    let seededTrades = false;
    let seededPrices = false;

    if (!existingTrades.length) {
        for (const trade of SAMPLE_TRADES) {
            await tradeService.createTrade(trade);
        }
        seededTrades = true;
    }

    if (!Object.keys(existingPrices || {}).length) {
        for (const [commodity, marketPrice] of Object.entries(SAMPLE_MARKET_PRICES)) {
            await marketPriceService.updateMarketPrice({ commodity, marketPrice });
        }
        seededPrices = true;
    }

    return {
        seededTrades,
        seededPrices,
    };
}


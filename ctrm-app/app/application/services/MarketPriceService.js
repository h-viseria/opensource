export class MarketPriceService {
    constructor(marketPriceRepository) {
        if (!marketPriceRepository) {
            throw new Error('MarketPriceService requires a marketPriceRepository.');
        }
        this.marketPriceRepository = marketPriceRepository;
    }

    async updateMarketPrice({ commodity, marketPrice }) {
        const normalizedCommodity = normalizeCommodity(commodity);
        const normalizedPrice = normalizePrice(marketPrice);

        await this.marketPriceRepository.setPrice(normalizedCommodity, normalizedPrice);

        return {
            commodity: normalizedCommodity,
            marketPrice: normalizedPrice,
        };
    }

    async getLatestPrices() {
        return this.marketPriceRepository.getLatestPrices();
    }
}

function normalizeCommodity(value) {
    const commodity = String(value || '').trim().toUpperCase();
    if (!commodity) {
        throw new Error('Commodity is required for market price update.');
    }
    return commodity;
}

function normalizePrice(value) {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) {
        throw new Error('Market price must be a positive number.');
    }
    return price;
}


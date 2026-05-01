import { MarketPriceRepository } from '../../application/repositories/MarketPriceRepository.js';

export class InMemoryMarketPriceRepository extends MarketPriceRepository {
    constructor(initialPrices = {}) {
        super();
        this.marketPrices = { ...initialPrices };
    }

    async getLatestPrices() {
        return { ...this.marketPrices };
    }

    async setPrice(commodity, marketPrice) {
        this.marketPrices[String(commodity).toUpperCase()] = Number(marketPrice);
    }
}


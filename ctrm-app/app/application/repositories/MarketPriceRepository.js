export class MarketPriceRepository {
    async setPrice(_commodity, _marketPrice) {
        throw new Error('MarketPriceRepository.setPrice must be implemented by infrastructure layer.');
    }

    async getLatestPrices() {
        throw new Error('MarketPriceRepository.getLatestPrices must be implemented by infrastructure layer.');
    }
}


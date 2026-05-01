import { calculatePositionsByCommodity } from '../../domain/position.js';
import { calculateUnrealizedPnL } from '../../domain/pnl.js';

export class RiskService {
    constructor(tradeRepository, marketPriceRepository = null) {
        if (!tradeRepository) {
            throw new Error('RiskService requires a tradeRepository.');
        }

        this.tradeRepository = tradeRepository;
        this.marketPriceRepository = marketPriceRepository;
    }

    async calculatePositions() {
        const trades = await this.tradeRepository.getAll();
        return calculatePositionsByCommodity(trades);
    }

    async calculatePnL(marketPrices) {
        const positions = await this.calculatePositions();
        const resolvedMarketPrices = marketPrices || await this.#getRepositoryMarketPrices();
        return calculateUnrealizedPnL(positions, resolvedMarketPrices);
    }

    async getExposureByCommodity() {
        const positions = await this.calculatePositions();
        return positions.map((position) => {
            const notionalExposure = position.netQuantity * position.avgPrice;
            return {
                commodity: position.commodity,
                netQuantity: position.netQuantity,
                avgPrice: position.avgPrice,
                notionalExposure,
                absoluteNotionalExposure: Math.abs(notionalExposure),
            };
        });
    }

    async #getRepositoryMarketPrices() {
        if (!this.marketPriceRepository || typeof this.marketPriceRepository.getLatestPrices !== 'function') {
            return {};
        }
        return this.marketPriceRepository.getLatestPrices();
    }
}


import { createTrade } from '../../domain/trade.js';

export class TradeService {
    constructor(tradeRepository, options = {}) {
        if (!tradeRepository) {
            throw new Error('TradeService requires a tradeRepository.');
        }

        this.tradeRepository = tradeRepository;
        this.idFactory = options.idFactory || defaultIdFactory;
        this.clock = options.clock || defaultClock;
    }

    async createTrade(tradeData) {
        const trade = createTrade({
            ...tradeData,
            id: tradeData.id || this.idFactory(),
            tradeDate: tradeData.tradeDate || this.clock(),
        });

        await this.tradeRepository.save(trade);
        return trade;
    }

    async getAllTrades() {
        return this.tradeRepository.getAll();
    }
}

function defaultClock() {
    return new Date().toISOString();
}

function defaultIdFactory() {
    const random = Math.random().toString(36).slice(2, 10);
    return `TRD-${Date.now()}-${random}`;
}


import { TradeRepository } from '../../application/repositories/TradeRepository.js';

export class InMemoryTradeRepository extends TradeRepository {
    constructor(initialTrades = []) {
        super();
        this.trades = [...initialTrades];
    }

    async save(trade) {
        this.trades.push(structuredClone(trade));
    }

    async getAll() {
        return this.trades.map((trade) => structuredClone(trade));
    }
}


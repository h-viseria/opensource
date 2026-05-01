export class TradeRepository {
    async save(_trade) {
        throw new Error('TradeRepository.save must be implemented by infrastructure layer.');
    }

    async getAll() {
        throw new Error('TradeRepository.getAll must be implemented by infrastructure layer.');
    }
}


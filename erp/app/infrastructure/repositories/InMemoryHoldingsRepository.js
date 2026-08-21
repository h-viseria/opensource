export class InMemoryHoldingsRepository {
    constructor() {
        this.holdings = [];
        this.lastId = 0;
    }

    nextId() {
        this.lastId += 1;
        return this.lastId;
    }

    save(holding) {
        this.holdings.push(holding);
    }

    findAll() {
        return [...this.holdings];
    }
}


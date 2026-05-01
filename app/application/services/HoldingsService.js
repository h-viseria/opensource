import { Holding } from '../../domain/Holding.js';

export class HoldingsService {
    constructor(holdingsRepository) {
        this.holdingsRepository = holdingsRepository;
    }

    createHolding(input) {
        const schemeCode = String(input.schemeCode || '').trim();
        const schemeName = String(input.schemeName || '').trim();
        const units = Number(input.units);
        const avgCost = Number(input.avgCost);

        if (!/^\d{4,12}$/.test(schemeCode)) {
            throw new Error('Scheme code must be 4-12 digits.');
        }
        if (!Number.isFinite(units) || units <= 0) {
            throw new Error('Units must be a positive number.');
        }
        if (!Number.isFinite(avgCost) || avgCost <= 0) {
            throw new Error('Average cost must be a positive number.');
        }

        const holding = new Holding({
            id: this.holdingsRepository.nextId(),
            schemeCode,
            schemeName,
            units,
            avgCost,
        });

        this.holdingsRepository.save(holding);
        return holding;
    }

    listHoldings() {
        return this.holdingsRepository.findAll();
    }
}


import { classifyTransactionDirection } from '../app/infrastructure/parsers/mfcCasTransactionParser.js';

const cases = [
    ['Switch Out', 'skip'],
    ['Switch In', 'outflow'],
    ['Switch Over Out', 'skip'],
    ['Switch Over In', 'outflow'],
    ['Switch-Over-Out', 'skip'],
    ['Switch-Over-In', 'outflow'],
    ['SWITCH OVER OUT', 'skip'],
    ['SWITCH OVER IN', 'outflow'],
    ['Switched Out', 'skip'],
    ['Switched In', 'outflow'],
    ['Purchase', 'outflow'],
    ['Redemption', 'inflow'],
    ['Dividend Payout', 'skip'],
];

function main() {
    cases.forEach(([label, expected]) => {
        const actual = classifyTransactionDirection(label);
        if (actual !== expected) {
            throw new Error(`"${label}": expected ${expected}, got ${actual}`);
        }
    });

    console.log(`Switch transaction classifier tests passed (${cases.length} cases).`);
}

main();

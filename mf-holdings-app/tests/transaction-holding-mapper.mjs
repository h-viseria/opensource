import { findHoldingForTransaction } from '../app/application/services/transactionHoldingMapper.js';
import { normalizeSchemeName } from '../app/infrastructure/db/indexedDb.js';

const holdings = [
    {
        amcName: 'DSP Mutual Fund',
        schemeName: 'DSP Mid Cap Fund - Regular Plan - Growth (formerly DSP Small and Mid Cap Fund)',
        units: 5342.233,
    },
    {
        amcName: 'Aditya Birla Sun Life Mutual Fund',
        schemeName: 'Aditya Birla Sun Life Flexi Cap Fund - Growth-Regular Plan',
        units: 685.715,
    },
];

function assertMatch(transactionSchemeName, transactionAmcName, expectedHoldingScheme) {
    const match = findHoldingForTransaction(transactionSchemeName, transactionAmcName, holdings);
    if (!match?.holding) {
        throw new Error(`Expected match for "${transactionSchemeName}", got none`);
    }

    const actual = normalizeSchemeName(match.holding.schemeName);
    const expected = normalizeSchemeName(expectedHoldingScheme);
    if (actual !== expected) {
        throw new Error(`Expected "${expectedHoldingScheme}", matched "${match.holding.schemeName}"`);
    }
}

function main() {
    assertMatch(
        'DSP Mid Cap Fund - Regular Plan - Growth',
        'DSP Mutual Fund',
        holdings[0].schemeName
    );

    assertMatch(
        'Aditya Birla Sun Life Flexi Cap Fund - Growth - Regular Plan',
        'Aditya Birla Sun Life Mutual Fund',
        holdings[1].schemeName
    );

    const noMatch = findHoldingForTransaction('Totally Unknown Fund', 'Unknown AMC', holdings);
    if (noMatch) {
        throw new Error('Expected no match for unknown fund');
    }

    console.log('Transaction holding mapper tests passed.');
}

main();

import { classifyPnlDirection, classifyTransactionDirection } from '../app/infrastructure/parsers/mfcCasTransactionParser.js';
import { computePeriodPnl } from '../app/application/services/periodPnlService.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertClose(actual, expected, label) {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.01) {
        throw new Error(`${label}: expected ~${expected}, got ${actual}`);
    }
}

function main() {
    const cases = [
        ['Switch Out', 'inflow'],
        ['Switch In', 'outflow'],
        ['Purchase', 'outflow'],
        ['Redemption', 'inflow'],
        ['Dividend Payout', 'skip'],
    ];
    cases.forEach(([label, expected]) => {
        const actual = classifyPnlDirection(label);
        if (actual !== expected) {
            throw new Error(`P&L "${label}": expected ${expected}, got ${actual}`);
        }
    });

    if (classifyTransactionDirection('Switch Out') !== 'skip') {
        throw new Error('XIRR classifier should still skip switch-out');
    }

    const heldThroughout = computePeriodPnl({
        currentUnits: 100,
        latestNav: 12,
        periodNav: 10,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [],
    });
    assertClose(heldThroughout, 200, 'held throughout should match NAV delta');

    const sipInPeriod = computePeriodPnl({
        currentUnits: 10,
        latestNav: 102,
        periodNav: 80,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [
            { transactionDate: '2026-07-15', transactionType: 'SIP', amount: 1000, units: 10, nav: 100 },
        ],
    });
    assertClose(sipInPeriod, 20, 'SIP in period should use purchase amount not old NAV');

    const navOnlyWouldBe = (102 - 80) * 10;
    assert(Math.abs(sipInPeriod - navOnlyWouldBe) > 1, 'SIP P&L must differ from NAV-only on current units');

    const withRedemption = computePeriodPnl({
        currentUnits: 60,
        latestNav: 120,
        periodNav: 100,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [
            { transactionDate: '2026-07-01', transactionType: 'Redemption', amount: 4400, units: 40, nav: 110 },
        ],
    });
    assertClose(withRedemption, 1600, 'redemption should include gain on sold units');

    const switchOut = computePeriodPnl({
        currentUnits: 60,
        latestNav: 120,
        periodNav: 100,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [
            { transactionDate: '2026-07-01', transactionType: 'Switch Out', amount: 4400, units: 40, nav: 110 },
        ],
    });
    assertClose(switchOut, 1600, 'switch-out should count as redemption for P&L');

    const txnBeforeWindow = computePeriodPnl({
        currentUnits: 10,
        latestNav: 102,
        periodNav: 80,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [
            { transactionDate: '2026-05-20', transactionType: 'Purchase', amount: 800, units: 10, nav: 80 },
        ],
    });
    assertClose(txnBeforeWindow, 220, 'txn on period start date is already in opening units');

    const negativeUnits = computePeriodPnl({
        currentUnits: 5,
        latestNav: 100,
        periodNav: 90,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [
            { transactionDate: '2026-06-01', transactionType: 'Purchase', amount: 2000, units: 20, nav: 100 },
        ],
    });
    assert(negativeUnits === null, 'impossible opening units should return null');

    const newBuyNoPeriodNav = computePeriodPnl({
        currentUnits: 10,
        latestNav: 102,
        periodNav: null,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [
            { transactionDate: '2026-07-15', transactionType: 'Purchase', amount: 1000, units: 10, nav: 100 },
        ],
    });
    assertClose(newBuyNoPeriodNav, 20, 'new position in period does not need period NAV');

    const exitedCurrentUnits = computePeriodPnl({
        currentUnits: 0,
        latestNav: 120,
        periodNav: 100,
        periodStartIso: '2026-05-20',
        periodEndIso: '2026-08-20',
        transactions: [
            { transactionDate: '2026-07-01', transactionType: 'Redemption', amount: 5000, units: 50, nav: 100 },
        ],
    });
    assert(exitedCurrentUnits === null, 'fully exited schemes must be excluded');

    console.log('Period P&L tests passed.');
}

main();

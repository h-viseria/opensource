import { calculateXirr } from '../app/shared/xirr.js';

function assertClose(actual, expected, tolerance, label) {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        throw new Error(`${label}: expected ~${expected}, got ${actual}`);
    }
}

function main() {
    const simple = calculateXirr([
        { date: '2024-01-01', amount: -100000 },
        { date: '2025-01-01', amount: 110000 },
    ]);
    assertClose(simple, 10, 0.2, 'simple one-year return');

    const sipLike = calculateXirr([
        { date: '2024-01-01', amount: -10000 },
        { date: '2024-07-01', amount: -10000 },
        { date: '2025-01-01', amount: 23000 },
    ]);
    if (!Number.isFinite(sipLike)) {
        throw new Error('sip-like flows should produce a finite XIRR');
    }

    const invalid = calculateXirr([
        { date: '2024-01-01', amount: -1000 },
        { date: '2024-06-01', amount: -500 },
    ]);
    if (invalid !== null) {
        throw new Error('all-negative flows should return null');
    }

    const mfApiDate = calculateXirr([
        { date: '2024-01-15', amount: -100000 },
        { date: '30-06-2026', amount: 150000 },
    ]);
    if (!Number.isFinite(mfApiDate)) {
        throw new Error('MFAPI DD-MM-YYYY terminal date should produce a finite XIRR');
    }

    console.log('XIRR tests passed.');
}

main();

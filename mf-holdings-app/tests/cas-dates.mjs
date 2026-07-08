import { normalizeCasDateToIso, maxIsoDate, resolveXirrTerminalDate } from '../app/shared/casDates.js';

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
}

function main() {
    assertEqual(normalizeCasDateToIso('30-06-2026'), '2026-06-30', 'MFAPI DD-MM-YYYY');
    assertEqual(normalizeCasDateToIso('2024-01-15'), '2024-01-15', 'ISO passthrough');
    assertEqual(normalizeCasDateToIso('15-01-2024'), '2024-01-15', 'DD-MM-YYYY');
    assertEqual(maxIsoDate('2024-01-01', '30-06-2026', '2025-12-31'), '2026-06-30', 'max date');
    assertEqual(resolveXirrTerminalDate('2026-06-30', '30-06-2026'), '2026-07-01', 'terminal after last tx');

    console.log('CAS date tests passed.');
}

main();

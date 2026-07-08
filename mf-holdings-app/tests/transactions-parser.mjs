import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { parseMfcCasTransactions, classifyTransactionDirection } from '../app/infrastructure/parsers/mfcCasTransactionParser.js';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');

const candidatePaths = [
    process.argv[2],
    'C:/Users/hitesh.viseria/Downloads/cas_detailed_report_2026_06_30_094532.xlsx',
    path.join(rootDir, 'tests', 'fixtures', 'cas_detailed_report_2026_04_25_113826.xlsx'),
].filter(Boolean);

const fixturePath = candidatePaths.find((candidate) => existsSync(candidate));

function main() {
    if (!fixturePath) {
        console.log('Transaction parser test skipped: no CAS fixture file found.');
        return;
    }

    const buffer = readFileSync(fixturePath);
    const result = parseMfcCasTransactions(buffer, { xlsxLib: XLSX, withDiagnostics: true });

    if (!result.diagnostics.sheetFound) {
        throw new Error('Expected a transaction sheet in CAS fixture.');
    }

    if (result.transactions.length < 1) {
        throw new Error(`Expected transactions to be parsed, got ${result.transactions.length}.`);
    }

    const hasPurchase = result.transactions.some((transaction) => transaction.cashFlowDirection === 'outflow');
    if (!hasPurchase) {
        throw new Error('Expected at least one purchase/outflow transaction.');
    }

    const hasDividendRow = result.transactions.some((transaction) =>
        /dividend|idcw/i.test(transaction.transactionType)
    );
    if (hasDividendRow) {
        throw new Error('Dividend payout rows should be excluded from parsed transactions.');
    }

    if (classifyTransactionDirection('Dividend Payout') !== 'skip') {
        throw new Error('Dividend payout classification should be skip.');
    }

    if (classifyTransactionDirection('Purchase') !== 'outflow') {
        throw new Error('Purchase classification should be outflow.');
    }

    if (classifyTransactionDirection('Redemption') !== 'inflow') {
        throw new Error('Redemption classification should be inflow.');
    }

    if (classifyTransactionDirection('Switch Out') !== 'skip') {
        throw new Error('Switch Out should be ignored for XIRR.');
    }

    if (classifyTransactionDirection('Switch In') !== 'outflow') {
        throw new Error('Switch In should be treated as a buy (outflow).');
    }

    if (classifyTransactionDirection('Switch Over Out') !== 'skip') {
        throw new Error('Switch Over Out should be ignored for XIRR.');
    }

    if (classifyTransactionDirection('Switch Over In') !== 'outflow') {
        throw new Error('Switch Over In should be treated as a buy (outflow).');
    }

    const hasSwitchOut = result.transactions.some((transaction) =>
        /switch\s*(over\s*)?out/i.test(transaction.transactionType)
    );
    if (hasSwitchOut) {
        throw new Error('Switch Out rows should be excluded from parsed transactions.');
    }

    console.log('Transaction parser diagnostics:', result.diagnostics);
    console.log(`Transaction parser test passed: ${result.transactions.length} transaction(s) from ${fixturePath}.`);
}

main();

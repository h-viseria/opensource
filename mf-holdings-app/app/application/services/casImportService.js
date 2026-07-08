import { parseMfcCasWorkbook } from '../../infrastructure/parsers/mfcCasParser.js';
import { parseMfcCasTransactions } from '../../infrastructure/parsers/mfcCasTransactionParser.js';
import { replaceHoldings } from '../../infrastructure/db/indexedDb.js';
import { replaceTransactions } from '../../infrastructure/db/transactionsIndexedDb.js';
import { enrichTransactionsWithHoldingMapping } from './transactionHoldingMapper.js';

export async function importCasFromFile(file) {
    if (!file) {
        throw new Error('Please select a CAS XLSX file.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const holdings = parseMfcCasWorkbook(arrayBuffer);

    if (!holdings.length) {
        throw new Error('No holdings found in uploaded file.');
    }

    const transactionResult = parseMfcCasTransactions(arrayBuffer, { withDiagnostics: true });
    const transactions = enrichTransactionsWithHoldingMapping(transactionResult.transactions, holdings);
    const metadata = {
        importedAt: new Date().toISOString(),
        statementPeriod: transactionResult.statementPeriod,
        sheetName: transactionResult.sheetName,
        diagnostics: transactionResult.diagnostics,
    };

    await replaceHoldings(holdings);
    await replaceTransactions(transactions, metadata);

    return {
        holdings,
        transactions,
        transactionDiagnostics: transactionResult.diagnostics,
        statementPeriod: transactionResult.statementPeriod,
    };
}
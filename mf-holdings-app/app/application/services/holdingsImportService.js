import { parseMfcCasWorkbook } from '../../infrastructure/parsers/mfcCasParser.js';
import { replaceHoldings } from '../../infrastructure/db/indexedDb.js';

export async function importHoldingsFromFile(file) {
    if (!file) {
        throw new Error('Please select a CAS XLSX file.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const holdings = parseMfcCasWorkbook(arrayBuffer);

    if (!holdings.length) {
        throw new Error('No holdings found in uploaded file.');
    }

    await replaceHoldings(holdings);
    return holdings;
}


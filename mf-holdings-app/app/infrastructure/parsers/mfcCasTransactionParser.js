import { normalizeSchemeName } from '../db/indexedDb.js';

function toNumber(value) {
    const cleaned = String(value ?? '')
        .replace(/,/g, '')
        .replace(/[^0-9.-]/g, '')
        .trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
}

function normalizeHeader(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const MONTHS = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
};

function parseCasDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return null;
    }

    const dmyText = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (dmyText) {
        const month = MONTHS[dmyText[2].toLowerCase()];
        if (month !== undefined) {
            const date = new Date(Date.UTC(Number(dmyText[3]), month, Number(dmyText[1])));
            if (!Number.isNaN(date.getTime())) {
                return date.toISOString().slice(0, 10);
            }
        }
    }

    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const date = new Date(Date.UTC(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1])));
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString().slice(0, 10);
        }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return null;
}

function findHeaderIndex(headers, candidates) {
    for (let i = 0; i < headers.length; i += 1) {
        const header = headers[i];
        if (candidates.some((candidate) => header.includes(candidate))) {
            return i;
        }
    }
    return -1;
}

function pickTransactionHeaderRow(rows) {
    const maxScan = Math.min(rows.length, 150);
    for (let i = 0; i < maxScan; i += 1) {
        const rowText = rows[i].map(normalizeHeader).join(' ');
        if (
            rowText.includes('scheme') &&
            rowText.includes('date') &&
            (rowText.includes('amount') || rowText.includes('transaction') || rowText.includes('units'))
        ) {
            return i;
        }
    }
    return -1;
}

function isHoldingsHeaderRow(rows, headerRowIndex) {
    const headerText = rows[headerRowIndex].map(normalizeHeader).join(' ');
    return (
        headerText.includes('current value') ||
        headerText.includes('invested value') ||
        (headerText.includes('units') && !headerText.includes('transaction'))
    );
}

function findTransactionSheet(workbook, xlsxLib) {
    const candidates = [];

    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const rows = xlsxLib.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            defval: '',
            raw: false,
        });

        if (!rows.length) {
            return;
        }

        const headerRowIndex = pickTransactionHeaderRow(rows);
        if (headerRowIndex < 0 || isHoldingsHeaderRow(rows, headerRowIndex)) {
            return;
        }

        const headerText = rows[headerRowIndex].map(normalizeHeader).join(' ');
        if (!headerText.includes('transaction') && !headerText.includes('amount')) {
            return;
        }

        candidates.push({ sheetName, rows, headerRowIndex, sheetIndex });
    });

    if (!candidates.length) {
        return null;
    }

    return candidates.sort((a, b) => b.sheetIndex - a.sheetIndex)[0];
}

function findHeaderMap(headers) {
    return {
        amcNameIndex: findHeaderIndex(headers, ['amc', 'fund house', 'asset management company']),
        schemeNameIndex: findHeaderIndex(headers, ['scheme name', 'scheme']),
        folioIndex: findHeaderIndex(headers, ['folio']),
        dateIndex: findHeaderIndex(headers, ['transaction date', 'txn date', 'date']),
        typeIndex: findHeaderIndex(headers, [
            'transaction type',
            'transaction description',
            'txn type',
            'txn description',
            'description',
            'particulars',
            'transaction nature',
        ]),
        amountIndex: findHeaderIndex(headers, ['amount', 'transaction amount', 'txn amount']),
        unitsIndex: findHeaderIndex(headers, ['units', 'unit']),
        navIndex: findHeaderIndex(headers, ['nav', 'price', 'purchase nav']),
        balanceUnitsIndex: findHeaderIndex(headers, ['balance units', 'unit balance', 'balance', 'closing units']),
    };
}

function isDividendPayout(text) {
    const value = String(text || '').toLowerCase();
    if (!value) {
        return false;
    }
    if (value.includes('reinvest')) {
        return false;
    }

    return (
        value.includes('dividend payout') ||
        value.includes('dividend paid') ||
        value.includes('idcw paid') ||
        value.includes('idcw payout') ||
        (value.includes('idcw') && value.includes('paid')) ||
        (value.includes('dividend') && value.includes('payout'))
    );
}

function isIgnorableNonCashRow(text) {
    const value = String(text || '').toLowerCase();
    if (!value) {
        return true;
    }

    if (isDividendPayout(value)) {
        return true;
    }

    return (
        value.includes('stamp duty') ||
        value.includes('stt tax') ||
        value === 'stt' ||
        value.includes('tds tax') ||
        (value.includes('tax') && !value.includes('purchase') && !value.includes('redemption'))
    );
}

function normalizeTransactionType(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isSwitchOutTransaction(text) {
    const value = normalizeTransactionType(text);
    if (!value) {
        return false;
    }

    return (
        value.includes('switch over out') ||
        value.includes('switchover out') ||
        value.includes('switch out') ||
        value.includes('switchout') ||
        value.includes('switched out') ||
        value.includes('switch over redemption') ||
        value === 'swo'
    );
}

function isSwitchInTransaction(text) {
    const value = normalizeTransactionType(text);
    if (!value) {
        return false;
    }

    if (isSwitchOutTransaction(text)) {
        return false;
    }

    return (
        value.includes('switch over in') ||
        value.includes('switchover in') ||
        value.includes('switch in') ||
        value.includes('switchin') ||
        value.includes('switched in') ||
        value.includes('switch over purchase') ||
        value === 'swi'
    );
}

export function classifyTransactionDirection(text) {
    const value = String(text || '').toLowerCase();
    if (!value || isIgnorableNonCashRow(value)) {
        return 'skip';
    }

    if (isSwitchOutTransaction(value)) {
        return 'skip';
    }
    if (isSwitchInTransaction(value)) {
        return 'outflow';
    }
    if (/redemption|redeem|swp|systematic withdrawal|withdrawal/.test(value)) {
        return 'inflow';
    }
    if (/purchase|sip|systematic investment|allotment|fresh purchase|additional purchase|buy/.test(value)) {
        return 'outflow';
    }

    return 'unknown';
}

function detectStatementPeriod(rows, headerRowIndex) {
    const scanLimit = Math.min(headerRowIndex, 20);
    let periodFrom = null;
    let periodTo = null;

    for (let i = 0; i < scanLimit; i += 1) {
        const text = rows[i].map((cell) => String(cell || '')).join(' ');
        const range = text.match(/(\d{1,2}-[A-Za-z]{3}-\d{4}).*?(\d{1,2}-[A-Za-z]{3}-\d{4})/);
        if (range) {
            periodFrom = parseCasDate(range[1]);
            periodTo = parseCasDate(range[2]);
        }
    }

    return { periodFrom, periodTo };
}

export function parseMfcCasTransactions(arrayBuffer, options = {}) {
    const xlsxLib = options.xlsxLib || globalThis.XLSX;
    if (!xlsxLib) {
        throw new Error('XLSX parser not loaded in browser.');
    }

    const workbook = xlsxLib.read(arrayBuffer, { type: 'array' });
    const sheet = findTransactionSheet(workbook, xlsxLib);

    if (!sheet) {
        const emptyResult = {
            transactions: [],
            diagnostics: {
                sheetFound: false,
                totalRowsScanned: 0,
                rowsImported: 0,
                droppedDividendPayout: 0,
                droppedMissingFields: 0,
                droppedUnknownType: 0,
                droppedIgnorable: 0,
            },
            statementPeriod: { periodFrom: null, periodTo: null },
            sheetName: null,
        };

        return options.withDiagnostics ? emptyResult : [];
    }

    const { rows, headerRowIndex, sheetName } = sheet;
    const headers = rows[headerRowIndex].map(normalizeHeader);
    const headerMap = findHeaderMap(headers);
    const statementPeriod = detectStatementPeriod(rows, headerRowIndex);

    if (headerMap.schemeNameIndex === -1 || headerMap.dateIndex === -1 || headerMap.amountIndex === -1) {
        throw new Error('Could not identify Scheme Name, Transaction Date, and Amount columns in transaction sheet.');
    }

    const diagnostics = {
        sheetFound: true,
        sheetName,
        headerRowIndex,
        totalRowsScanned: 0,
        rowsImported: 0,
        droppedDividendPayout: 0,
        droppedMissingFields: 0,
        droppedUnknownType: 0,
        droppedIgnorable: 0,
    };

    const transactions = [];
    let lastAmcName = '';
    let lastSchemeName = '';

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        diagnostics.totalRowsScanned += 1;
        const row = rows[i];
        const rawSchemeName = String(row[headerMap.schemeNameIndex] || '').trim();
        const rawAmcName = headerMap.amcNameIndex === -1 ? '' : String(row[headerMap.amcNameIndex] || '').trim();
        if (rawSchemeName) {
            lastSchemeName = rawSchemeName;
        }
        if (rawAmcName) {
            lastAmcName = rawAmcName;
        }

        const schemeName = lastSchemeName;
        const amcName = lastAmcName;
        const transactionDate = parseCasDate(row[headerMap.dateIndex]);
        const amount = toNumber(row[headerMap.amountIndex]);
        const typeText = headerMap.typeIndex === -1
            ? row.map((cell) => String(cell || '').trim()).find((cell) => {
                const direction = classifyTransactionDirection(cell);
                return direction !== 'unknown' && direction !== 'skip';
            }) || ''
            : String(row[headerMap.typeIndex] || '').trim();

        if (!schemeName || !transactionDate || !Number.isFinite(amount) || amount === 0) {
            diagnostics.droppedMissingFields += 1;
            continue;
        }

        if (isDividendPayout(typeText)) {
            diagnostics.droppedDividendPayout += 1;
            continue;
        }

        const direction = classifyTransactionDirection(typeText);
        if (direction === 'skip') {
            diagnostics.droppedIgnorable += 1;
            continue;
        }
        if (direction === 'unknown') {
            diagnostics.droppedUnknownType += 1;
            continue;
        }

        transactions.push({
            amcName: amcName || null,
            schemeName,
            schemeNameNormalized: normalizeSchemeName(schemeName),
            folioNumber: headerMap.folioIndex === -1 ? null : String(row[headerMap.folioIndex] || '').trim() || null,
            transactionDate,
            transactionType: typeText,
            cashFlowDirection: direction,
            amount: Math.abs(amount),
            units: headerMap.unitsIndex === -1 ? null : toNumber(row[headerMap.unitsIndex]),
            nav: headerMap.navIndex === -1 ? null : toNumber(row[headerMap.navIndex]),
            balanceUnits: headerMap.balanceUnitsIndex === -1 ? null : toNumber(row[headerMap.balanceUnitsIndex]),
        });
        diagnostics.rowsImported += 1;
    }

    const result = {
        transactions,
        diagnostics,
        statementPeriod,
        sheetName,
    };

    return options.withDiagnostics ? result : transactions;
}

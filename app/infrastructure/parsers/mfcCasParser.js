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

function normalizeSchemeKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function looksLikeSummaryRow(name) {
    const key = normalizeSchemeKey(name);
    if (!key) {
        return true;
    }

    return (
        key.includes('total') ||
        key.includes('grand total') ||
        key.includes('sub total') ||
        key.includes('opening balance') ||
        key.includes('closing balance') ||
        key.includes('valuation')
    );
}

function pickHeaderRow(rows) {
    const maxScan = Math.min(rows.length, 120);
    for (let i = 0; i < maxScan; i += 1) {
        const cells = rows[i].map(normalizeHeader);
        const rowText = cells.join(' ');
        if (
            rowText.includes('scheme') &&
            (rowText.includes('unit') || rowText.includes('balance') || rowText.includes('invested') || rowText.includes('value'))
        ) {
            return i;
        }
    }
    return 0;
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

function findHeaderMap(headers) {
    return {
        amcNameIndex: findHeaderIndex(headers, ['amc', 'fund house', 'asset management company']),
        schemeNameIndex: findHeaderIndex(headers, ['scheme name', 'scheme']),
        unitsIndex: findHeaderIndex(headers, ['units', 'unit balance', 'balance units', 'closing units', 'available units']),
        investedValueIndex: findHeaderIndex(headers, [
            'invested value',
            'cost value',
            'amount invested',
            'purchase value',
            'invested amount',
            'buy value',
        ]),
        currentValueIndex: findHeaderIndex(headers, ['current value', 'current nav value', 'market value']),
    };
}

export function parseMfcCasWorkbook(arrayBuffer, options = {}) {
    const xlsxLib = options.xlsxLib || globalThis.XLSX;
    if (!xlsxLib) {
        throw new Error('XLSX parser not loaded in browser.');
    }

    const workbook = xlsxLib.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
        throw new Error('No sheet found in selected file.');
    }

    const rows = xlsxLib.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
    });

    if (!rows.length) {
        throw new Error('Sheet is empty.');
    }

    const headerRowIndex = pickHeaderRow(rows);
    const headers = rows[headerRowIndex].map(normalizeHeader);
    const { amcNameIndex, schemeNameIndex, unitsIndex, investedValueIndex, currentValueIndex } = findHeaderMap(headers);

    if (schemeNameIndex === -1 || unitsIndex === -1) {
        throw new Error('Could not identify Scheme Name and Units columns in the file.');
    }

    const byScheme = new Map();
    const diagnostics = {
        totalRowsScanned: 0,
        rowsImported: 0,
        droppedMissingScheme: 0,
        droppedSummary: 0,
        droppedInvalidUnits: 0,
    };

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        diagnostics.totalRowsScanned += 1;
        const row = rows[i];
        const amcName = amcNameIndex === -1 ? '' : String(row[amcNameIndex] || '').trim();
        const schemeName = String(row[schemeNameIndex] || '').trim();
        if (!schemeName) {
            diagnostics.droppedMissingScheme += 1;
            continue;
        }

        if (looksLikeSummaryRow(schemeName)) {
            diagnostics.droppedSummary += 1;
            continue;
        }

        const units = toNumber(row[unitsIndex]);
        if (!Number.isFinite(units) || units <= 0) {
            diagnostics.droppedInvalidUnits += 1;
            continue;
        }

        const investedValue = investedValueIndex === -1 ? null : toNumber(row[investedValueIndex]);
        const currentValueXls = currentValueIndex === -1 ? null : toNumber(row[currentValueIndex]);
        const key = normalizeSchemeKey(schemeName);

        const existing = byScheme.get(key) || {
            amcName: '',
            schemeName,
            units: 0,
            investedValue: 0,
            investedValueKnown: false,
            currentValueXls: 0,
            currentValueXlsKnown: false,
        };

        if (!existing.amcName && amcName) {
            existing.amcName = amcName;
        }

        existing.units += units;
        if (Number.isFinite(investedValue)) {
            existing.investedValue += investedValue;
            existing.investedValueKnown = true;
        }
        if (Number.isFinite(currentValueXls)) {
            existing.currentValueXls += currentValueXls;
            existing.currentValueXlsKnown = true;
        }

        byScheme.set(key, existing);
        diagnostics.rowsImported += 1;
    }

    const holdings = Array.from(byScheme.values()).map((item) => ({
        amcName: item.amcName || null,
        schemeName: item.schemeName,
        units: item.units,
        investedValue: item.investedValueKnown ? item.investedValue : null,
        currentValueXls: item.currentValueXlsKnown ? item.currentValueXls : null,
    }));

    if (options.withDiagnostics) {
        return { holdings, diagnostics, headerRowIndex };
    }

    return holdings;
}


/**
 * csv-parser.js — Parse CSV text into arrays of objects
 * Handles quoted fields, trims whitespace, normalises headers.
 */

import { toFloat, MONTH_MAP, MONTH_ABBR, normalizeAccountTypeLabel } from './models.js';

/**
 * Parse raw CSV text into an array of row objects keyed by normalised header names.
 * Headers are lower-cased and spaces replaced with underscores.
 */
export function parseCsv(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const nonEmpty = lines.filter(l => l.trim() !== '');
    if (nonEmpty.length < 2) return [];

    const headers = splitCsvLine(nonEmpty[0]).map(normalizeHeaderName);

    const rows = [];
    for (let i = 1; i < nonEmpty.length; i++) {
        const vals = splitCsvLine(nonEmpty[i]);
        if (vals.every(v => v.trim() === '')) continue;
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = (vals[idx] || '').trim();
        });
        rows.push(obj);
    }
    return rows;
}

function splitCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

/**
 * Parse Chart of Accounts CSV rows into account objects.
 * Expected CSV headers (case-insensitive, spaces ok):
 *   Opening Date, Account Name, Description, Account ShortCode,
 *   Full Account Name, Account Type, Opening Balance
 */
export function parseAccounts(text) {
    const headers = extractNormalizedHeaders(text);
    validateRequiredHeaders(headers, [
        ['account_shortcode', 'account_short_code'],
        ['full_account_name', 'full_accountname', 'account_full_name', 'fullname'],
        ['account_type', 'type'],
    ]);

    const rows = parseCsv(text);
    const base = rows.map((r, idx) => {
        const openingDate = normalizeDate(r['opening_date'] || '', 'Opening Date', idx + 2);
        const type = normalizeAccountType(r['account_type'] || r['type'] || '', idx + 2);
        const shortCode = pickValue(r, ['account_shortcode', 'account_short_code']).toUpperCase();
        const accountName = (r['account_name'] || '').trim();
        const fullAccountName = normalizeFullAccountName(
            pickValue(r, ['full_account_name', 'full_accountname', 'account_full_name', 'fullname']),
            idx + 2
        );

        return {
            rowNo: idx + 2,
            openingDate,
            name:             accountName,
            description:      r['description'] || '',
            shortCode,
            parentShortCode:  (r['parent_account_shortcode'] || r['parent_account_short_code'] || r['parent_shortcode'] || '').toUpperCase(),
            fullAccountName,
            type,
            openingBalance:   toFloat(r['opening_balance']),
        };
    }).filter(a => a.shortCode);

    const withPath = base.filter((a) => !!a.fullAccountName);
    if (withPath.length === 0) {
        // Backward compatibility fallback for older files.
        return base.map(stripRowNo);
    }

    const pathToCode = new Map();
    const codeSeen = new Set();

    withPath.forEach((a) => {
        if (codeSeen.has(a.shortCode)) {
            throw new Error(`Duplicate Account ShortCode found in row ${a.rowNo}: ${a.shortCode}`);
        }
        codeSeen.add(a.shortCode);

        if (pathToCode.has(a.fullAccountName)) {
            throw new Error(`Duplicate Full Account Name found in row ${a.rowNo}: ${a.fullAccountName}`);
        }
        pathToCode.set(a.fullAccountName, a.shortCode);
    });

    withPath.forEach((a) => {
        const parts = a.fullAccountName.split(':').map((p) => p.trim());
        const leaf = parts[parts.length - 1];
        if (!a.name) {
            a.name = leaf;
        }

        if (parts.length > 1) {
            const parentPath = parts.slice(0, -1).join(':');
            const parentCode = pathToCode.get(parentPath);
            if (!parentCode) {
                throw new Error(`Parent hierarchy missing for row ${a.rowNo}: ${parentPath}`);
            }
            a.parentShortCode = parentCode;
        } else {
            a.parentShortCode = '';
        }
    });

    return withPath.map(stripRowNo);
}

/**
 * Parse Transactions CSV rows into transaction objects.
 * Expected CSV headers (case-insensitive):
 *   Main Account, Transaction Date, Value Date, Description,
 *   Comments1, Comments2, Deposit Amount, Withdrawal Amount, Target Account
 */
export function parseTransactions(text) {
    const rows = parseCsv(text);
    const parsed = rows.map((r, idx) => ({
        mainAccount:      (r['main_account'] || '').toUpperCase(),
        transactionDate:  normalizeDate(r['transaction_date'] || '', 'Transaction Date', idx + 2),
        valueDate:        normalizeDate(r['value_date'] || '', 'Value Date', idx + 2),
        description:      r['description'] || '',
        comments1:        r['comments1'] || r['comments_1'] || '',
        comments2:        r['comments2'] || r['comments_2'] || '',
        depositAmount:    Math.abs(toFloat(r['deposit_amount'])),
        withdrawalAmount: Math.abs(toFloat(r['withdrawal_amount'])),
        targetAccount:    (r['target_account'] || '').toUpperCase(),
    })).filter(t => t.mainAccount);

    return dedupeMirroredTransactions(parsed);
}

/**
 * Removes exact duplicates and mirrored duplicates:
 * A->B (deposit X, withdrawal Y) and B->A (deposit Y, withdrawal X) are treated as one transaction.
 */
export function dedupeMirroredTransactions(transactions) {
    const kept = [];
    const seenExact = new Set();
    const waitingForMirror = new Map();

    transactions.forEach((tx) => {
        const exactKey = buildExactKey(tx);
        if (seenExact.has(exactKey)) {
            return;
        }

        const matchCount = waitingForMirror.get(exactKey) || 0;
        if (matchCount > 0) {
            waitingForMirror.set(exactKey, matchCount - 1);
            return;
        }

        kept.push(tx);
        seenExact.add(exactKey);
        const mirrorKey = buildMirrorKey(tx);
        waitingForMirror.set(mirrorKey, (waitingForMirror.get(mirrorKey) || 0) + 1);
    });

    return kept;
}

function buildExactKey(tx) {
    return [
        tx.mainAccount,
        tx.targetAccount,
        tx.transactionDate,
        tx.valueDate,
        normalizeText(tx.description),
        normalizeText(tx.comments1),
        normalizeText(tx.comments2),
        toAmountKey(tx.depositAmount),
        toAmountKey(tx.withdrawalAmount),
    ].join('|');
}

function buildMirrorKey(tx) {
    return [
        tx.targetAccount,
        tx.mainAccount,
        tx.transactionDate,
        tx.valueDate,
        normalizeText(tx.description),
        normalizeText(tx.comments1),
        normalizeText(tx.comments2),
        toAmountKey(tx.withdrawalAmount),
        toAmountKey(tx.depositAmount),
    ].join('|');
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function toAmountKey(value) {
    return Number(value || 0).toFixed(2);
}

function normalizeDate(value, fieldName, rowNo) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!m) {
        throw new Error(`${fieldName} in row ${rowNo} must be in dd-mmm-yyyy format.`);
    }
    const dd = m[1].padStart(2, '0');
    const monthKey = m[2].toLowerCase();
    const mm = MONTH_MAP[monthKey];
    if (!mm) {
        throw new Error(`${fieldName} in row ${rowNo} has an invalid month.`);
    }
    const yyyy = m[3];
    const date = new Date(`${yyyy}-${mm}-${dd}`);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} in row ${rowNo} is not a valid date.`);
    }
    const canonicalMonth = MONTH_ABBR[Number(mm) - 1];
    return `${dd}-${canonicalMonth}-${yyyy}`;
}

function normalizeAccountType(value, rowNo) {
    const raw = String(value || '').trim();
    if (!raw) {
        throw new Error(`Account Type is required in row ${rowNo}.`);
    }
    const normalized = normalizeAccountTypeLabel(raw);
    if (!normalized) {
        throw new Error(`Account Type in row ${rowNo} is invalid: ${raw}`);
    }
    return normalized;
}

function normalizeHeaderName(header) {
    return String(header || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function extractNormalizedHeaders(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const first = lines.find((l) => l.trim() !== '');
    if (!first) return [];
    return splitCsvLine(first).map(normalizeHeaderName);
}

function validateRequiredHeaders(headers, groups) {
    const set = new Set(headers);
    const missing = groups.filter((aliases) => !aliases.some((a) => set.has(a)));
    if (missing.length > 0) {
        const names = missing.map((g) => g[0]).join(', ');
        throw new Error(`Missing required Chart of Accounts column(s): ${names}`);
    }
}

function pickValue(row, aliases) {
    for (const key of aliases) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
            return String(row[key]).trim();
        }
    }
    return '';
}

function normalizeFullAccountName(value, rowNo) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.split(':').map((p) => p.trim());
    if (parts.some((p) => !p)) {
        throw new Error(`Full Account Name in row ${rowNo} is invalid.`);
    }
    return parts.join(':');
}

function stripRowNo(account) {
    const { rowNo, ...clean } = account;
    return clean;
}


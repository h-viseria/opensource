/**
 * import-gnucash.js - GNUCash Transaction Export import logic.
 */

import { getAll, clearAndBulkInsert } from './db.js';
import { dedupeMirroredTransactions } from './csv-parser.js';
import { toFloat, MONTH_ABBR } from './models.js';

let pendingImport = null;

export function initGnuCashImport(onImportDone) {
    const input = document.getElementById('gnucash-file');
    if (!input) return;

    const modal = document.getElementById('gnucash-preview-modal');
    const body = document.getElementById('gnucash-preview-body');
    const summary = document.getElementById('gnucash-preview-summary');
    const confirmBtn = document.getElementById('gnucash-preview-confirm');

    function closePreview() {
        pendingImport = null;
        if (modal) modal.hidden = true;
    }

    document.getElementById('gnucash-preview-close')?.addEventListener('click', closePreview);
    document.getElementById('gnucash-preview-cancel')?.addEventListener('click', closePreview);

    confirmBtn?.addEventListener('click', async () => {
        if (!pendingImport) return;
        const mode = pendingImport.mode;
        const transactions = pendingImport.transactions;

        if (transactions.length === 0) {
            showStatus('gnucash-status', 'error', 'No valid transactions to import.');
            closePreview();
            return;
        }

        if (mode === 'append') {
            const existing = await getAll('transactions');
            const merged = dedupeMirroredTransactions([...existing, ...transactions]);
            await clearAndBulkInsert('transactions', merged);
            const removed = existing.length + transactions.length - merged.length;
            showStatus('gnucash-status', 'success', `Imported ${transactions.length} row(s). Duplicates removed: ${removed}.`);
        } else {
            await clearAndBulkInsert('transactions', transactions);
            showStatus('gnucash-status', 'success', `Imported ${transactions.length} row(s) successfully.`);
        }

        closePreview();
        onImportDone();
    });

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showStatus('gnucash-status', 'info', 'Parsing GNUCash export...');

        try {
            const text = await file.text();
            const parsedRows = parseGnuCashCsv(text);
            if (parsedRows.length === 0) {
                showStatus('gnucash-status', 'error', 'No usable GNUCash rows found.');
                e.target.value = '';
                return;
            }

            const accounts = await getAll('accounts');
            const fullNameMap = buildFullNameToShortCodeMap(accounts);
            const { previewRows, transactions } = buildPreviewAndTransactions(parsedRows, fullNameMap);

            pendingImport = {
                mode: getImportMode('gnucash-import-mode'),
                transactions,
                previewRows,
            };

            const errorCount = previewRows.filter((r) => r.errors.length > 0).length;
            const okCount = previewRows.length - errorCount;
            summary.textContent = `Rows: ${previewRows.length} | Valid: ${okCount} | Errors: ${errorCount}`;

            body.innerHTML = previewRows.map((r) => {
                const cls = r.errors.length > 0 ? 'row-error' : 'row-ok';
                const status = r.errors.length > 0 ? escHtml(r.errors.join('; ')) : 'OK';
                return `
                    <tr class="${cls}">
                        <td>${r.rowNo}</td>
                        <td>${escHtml(r.transactionId)}</td>
                        <td>${escHtml(r.transactionDate)}</td>
                        <td>${escHtml(r.description)}</td>
                        <td>${escHtml(r.fullAccount)}</td>
                        <td class="num">${fmt(r.amount)}</td>
                        <td>${status}</td>
                    </tr>
                `;
            }).join('');

            confirmBtn.textContent = `Confirm Import (${transactions.length} tx)`;
            if (modal) modal.hidden = false;
            showStatus('gnucash-status', 'info', 'Preview ready. Confirm to load into IndexedDB.');
        } catch (err) {
            showStatus('gnucash-status', 'error', 'Error: ' + err.message);
        }

        e.target.value = '';
    });
}

export function parseGnuCashCsv(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    if (nonEmpty.length < 2) return [];

    const header = splitCsvLine(nonEmpty[0]).map(normalizeHeader);
    const set = new Set(header);

    const required = [
        ['date'],
        ['transaction_unique_id', 'transaction_id', 'unique_id'],
        ['full_account', 'full_account_name', 'account'],
        ['amount_num', 'amount_num_', 'amount'],
    ];

    const missing = required.filter((aliases) => !aliases.some((a) => set.has(a)));
    if (missing.length > 0) {
        const names = missing.map((m) => m[0]).join(', ');
        throw new Error(`Missing required GNUCash columns: ${names}`);
    }

    const rows = [];
    for (let i = 1; i < nonEmpty.length; i++) {
        const vals = splitCsvLine(nonEmpty[i]);
        const row = {};
        header.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });

        const transactionId = pick(row, ['transaction_unique_id', 'transaction_id', 'unique_id']);
        const fullAccount = pick(row, ['full_account', 'full_account_name', 'account']);

        const out = {
            rowNo: i + 1,
            transactionId,
            fullAccount,
            description: pick(row, ['description']),
            notes: pick(row, ['notes']),
            memo: pick(row, ['memo']),
            amount: parseGnuAmount(pick(row, ['amount_num', 'amount_num_', 'amount'])),
            transactionDate: '',
            errors: [],
        };

        try {
            out.transactionDate = normalizeAnyDate(pick(row, ['date']), i + 1);
        } catch (err) {
            out.errors.push(err.message);
        }

        if (!transactionId) out.errors.push('Missing Transaction Unique ID');
        if (!fullAccount) out.errors.push('Missing Full Account');

        rows.push(out);
    }

    return rows;
}

function buildPreviewAndTransactions(rows, fullNameMap) {
    const previewRows = rows.map((r) => ({ ...r, errors: [...r.errors] }));

    // Account resolution checks
    previewRows.forEach((r) => {
        const resolved = resolveAccount(r.fullAccount, fullNameMap);
        if (!resolved.found) {
            r.errors.push(`Account not found in COA: ${r.fullAccount}`);
        }
    });

    // Group by transaction ID for dual-entry pairing
    const groups = new Map();
    previewRows.forEach((r) => {
        if (!groups.has(r.transactionId)) groups.set(r.transactionId, []);
        groups.get(r.transactionId).push(r);
    });

    const transactions = [];

    groups.forEach((groupRows, txId) => {
        const validRows = groupRows.filter((r) => r.errors.length === 0);
        if (validRows.length < 2) {
            groupRows.forEach((r) => r.errors.push('Need at least 2 valid entries for dual-entry pairing'));
            return;
        }

        const positives = validRows
            .filter((r) => r.amount > 0)
            .map((r) => ({ ...r, remaining: Math.abs(r.amount) }));
        const negatives = validRows
            .filter((r) => r.amount < 0)
            .map((r) => ({ ...r, remaining: Math.abs(r.amount) }));

        if (positives.length === 0 || negatives.length === 0) {
            groupRows.forEach((r) => r.errors.push('Need both positive and negative entries in a transaction group'));
            return;
        }

        const totalPos = positives.reduce((s, r) => s + r.remaining, 0);
        const totalNeg = negatives.reduce((s, r) => s + r.remaining, 0);
        const epsilon = 0.005;
        if (Math.abs(totalPos - totalNeg) > epsilon) {
            groupRows.forEach((r) => r.errors.push(`Unbalanced split for TxnID:${txId} (debit ${totalPos.toFixed(2)} vs credit ${totalNeg.toFixed(2)})`));
            return;
        }

        let i = 0;
        let j = 0;
        while (i < positives.length && j < negatives.length) {
            const p = positives[i];
            const n = negatives[j];
            const amount = Math.min(p.remaining, n.remaining);

            if (amount > epsilon) {
                const mainResolved = resolveAccount(p.fullAccount, fullNameMap);
                const targetResolved = resolveAccount(n.fullAccount, fullNameMap);
                transactions.push({
                    mainAccount: mainResolved.code,
                    transactionDate: p.transactionDate || n.transactionDate,
                    valueDate: p.transactionDate || n.transactionDate,
                    description: p.description || n.description || '',
                    comments1: [p.notes, `TxnID:${txId}`].filter(Boolean).join(' | '),
                    comments2: p.memo || n.memo || '',
                    depositAmount: amount,
                    withdrawalAmount: 0,
                    targetAccount: targetResolved.code,
                });
            }

            p.remaining -= amount;
            n.remaining -= amount;

            if (p.remaining <= epsilon) i++;
            if (n.remaining <= epsilon) j++;
        }
    });

    return { previewRows, transactions };
}

function resolveAccount(fullName, fullNameMap) {
    const key = String(fullName || '').trim().toLowerCase();
    const code = fullNameMap.get(key);
    if (code) return { code, found: true };
    return { code: String(fullName || '').trim().toUpperCase(), found: false };
}

function buildFullNameToShortCodeMap(accounts) {
    const map = new Map();
    accounts.forEach((a) => {
        if (a.fullAccountName) map.set(String(a.fullAccountName).trim().toLowerCase(), a.shortCode);
        if (a.shortCode) map.set(String(a.shortCode).trim().toLowerCase(), a.shortCode);
    });
    return map;
}

function normalizeAnyDate(raw, rowNo) {
    const s = String(raw || '').trim();
    if (!s) throw new Error(`Missing date in row ${rowNo}`);

    // mm/dd/yyyy or mm/dd/yy
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
        const mmNum = Number(m[1]);
        const dd = m[2].padStart(2, '0');
        let yyyy = m[3];
        if (yyyy.length === 2) yyyy = (Number(yyyy) >= 50 ? '19' : '20') + yyyy;
        if (mmNum < 1 || mmNum > 12) throw new Error(`Invalid date month in row ${rowNo}: ${s}`);
        return `${dd}-${MONTH_ABBR[mmNum - 1]}-${yyyy}`;
    }

    // yyyy-mm-dd fallback
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
        const yyyy = m[1];
        const mmNum = Number(m[2]);
        const dd = m[3].padStart(2, '0');
        if (mmNum < 1 || mmNum > 12) throw new Error(`Invalid date month in row ${rowNo}: ${s}`);
        return `${dd}-${MONTH_ABBR[mmNum - 1]}-${yyyy}`;
    }

    throw new Error(`Invalid GNUCash date format in row ${rowNo}: ${s}`);
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

function normalizeHeader(h) {
    return String(h || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function pick(obj, aliases) {
    for (const a of aliases) {
        if (obj[a] !== undefined && obj[a] !== null && String(obj[a]).trim() !== '') return String(obj[a]).trim();
    }
    return '';
}

function getImportMode(groupName) {
    const selected = document.querySelector(`input[name="${groupName}"]:checked`);
    return selected ? selected.value : 'replace';
}

function showStatus(id, type, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'status-msg ' + (type || '');
    el.textContent = message || '';
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '';
}

/**
 * Parse a GNUCash amount string. Handles:
 *   "1,234.56"  -> 1234.56
 *   "-1,234.56" -> -1234.56
 *   "(1,234.56)"-> -1234.56  (accounting bracket notation)
 *   "(100)"     -> -100
 */
function parseGnuAmount(raw) {
    const s = String(raw || '').trim();
    if (!s) return 0;
    // Detect bracket notation (value) => negative
    const bracket = s.match(/^\(([^)]+)\)$/);
    const isNeg = bracket || s.startsWith('-');
    const inner = bracket ? bracket[1] : s;
    // Remove thousand separators, then parse
    const cleaned = inner.replace(/,/g, '').replace(/^-/, '');
    const n = parseFloat(cleaned);
    if (Number.isNaN(n)) return 0;
    return isNeg ? -Math.abs(n) : Math.abs(n);
}


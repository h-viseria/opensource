/**
 * import-hdfc.js — HDFC Bank Statement import logic.
 *
 * HDFC CSV columns (any order, extra columns ignored):
 *   Date           → Transaction Date
 *   Narration      → Description
 *   Chq./Ref.No.   → Comments1
 *   Value Dt       → Value Date
 *   Withdrawal Amt.→ Withdrawal Amount
 *   Deposit Amt.   → Deposit Amount
 *   Account        → Target Account (colon-separated Full Account Name)
 *
 * The Main Account must be selected by the user from a dropdown populated
 * from the Chart of Accounts stored in IndexedDB.
 */

import { getAll, clearAndBulkInsert } from './db.js';
import { dedupeMirroredTransactions } from './csv-parser.js';
import { toFloat, MONTH_ABBR } from './models.js';

// ─── HDFC CSV HEADER ALIASES ────────────────────────────────────────────────

/** Normalize a header cell to a plain lower-snake_case key (handles BOM, spaces, punctuation) */
function normalizeHeader(h) {
    return String(h || '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

const REQUIRED_HDFC_HEADERS = [
    ['date'],
    ['narration'],
    ['value_dt', 'value_date'],
    ['withdrawal_amt', 'withdrawal_amount', 'withdrawal_amt_'],
    ['deposit_amt', 'deposit_amount', 'deposit_amt_'],
];

/** Pick first matching key from an alias list out of a row object */
function pick(row, aliases) {
    for (const key of aliases) {
        if (row[key] !== undefined && row[key] !== null) {
            const v = String(row[key]).trim();
            if (v !== '') return v;
        }
    }
    return '';
}

// ─── DATE PARSING ────────────────────────────────────────────────────────────

/**
 * HDFC dates are typically DD/MM/YY or DD/MM/YYYY.
 * Returns canonical dd-mmm-yyyy or throws.
 */
function parseHdfcDate(raw, fieldName, rowNo) {
    const str = String(raw || '').trim();
    if (!str) return '';

    // Try DD/MM/YY or DD/MM/YYYY
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) throw new Error(`${fieldName} in row ${rowNo} has invalid HDFC date format: "${str}"`);

    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (parseInt(yyyy, 10) >= 50 ? '19' : '20') + yyyy;

    const idx = parseInt(mm, 10) - 1;
    if (idx < 0 || idx > 11) throw new Error(`${fieldName} in row ${rowNo} has invalid month: "${str}"`);

    const mmm = MONTH_ABBR[idx];
    const date = new Date(`${yyyy}-${mm}-${dd}`);
    if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} in row ${rowNo} is not a valid date: "${str}"`);

    return `${dd}-${mmm}-${yyyy}`;
}

// ─── PARSER ──────────────────────────────────────────────────────────────────

/**
 * Parse raw HDFC CSV/TSV text and return an array of partial transaction objects.
 * The mainAccount field is NOT set here — it's injected after parsing.
 * targetAccount is the colon-separated Full Account Name resolved to shortCode by the caller.
 */
export function parseHdfcCsv(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const nonEmpty = lines.filter(l => l.trim() !== '');
    if (nonEmpty.length < 2) return [];

    // Find the header row — skip any preamble rows that lack the 'date' column
    let headerIdx = -1;
    let headers = [];
    for (let i = 0; i < nonEmpty.length; i++) {
        const candidates = splitLine(nonEmpty[i]).map(normalizeHeader);
        if (candidates.includes('date') || candidates.includes('narration')) {
            headers = candidates;
            headerIdx = i;
            break;
        }
    }

    if (headerIdx === -1) {
        throw new Error('Could not find HDFC header row (expected "Date" and "Narration" columns).');
    }

    // Validate required headers
    const headerSet = new Set(headers);
    const missing = REQUIRED_HDFC_HEADERS.filter(aliases => !aliases.some(a => headerSet.has(a)));
    if (missing.length > 0) {
        const names = missing.map(g => g[0]).join(', ');
        throw new Error(`Missing required HDFC columns: ${names}`);
    }

    const rows = [];
    for (let i = headerIdx + 1; i < nonEmpty.length; i++) {
        const vals = splitLine(nonEmpty[i]);
        if (vals.every(v => v.trim() === '')) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
        rows.push(row);
    }

    return rows.map((r, idx) => {
        const rowNo = headerIdx + 2 + idx;
        const transactionDate = parseHdfcDate(r['date'] || '', 'Date', rowNo);
        const valueDate = parseHdfcDate(
            pick(r, ['value_dt', 'value_date']) || r['date'] || '',
            'Value Dt', rowNo
        );
        const depositAmount  = Math.abs(toFloat(pick(r, ['deposit_amt', 'deposit_amount', 'deposit_amt_'])));
        const withdrawalAmount = Math.abs(toFloat(pick(r, ['withdrawal_amt', 'withdrawal_amount', 'withdrawal_amt_'])));
        const targetFullName = pick(r, ['account']) || '';
        const chqRef = pick(r, ['chq_ref_no', 'chq__ref_no_', 'chq_refno', 'ref_no']) || '';

        return {
            transactionDate,
            valueDate,
            description:      r['narration'] || '',
            comments1:        chqRef,
            comments2:        '',
            depositAmount,
            withdrawalAmount,
            targetFullName,
            rowNo,
            targetAccount:    '',
            mainAccount:      '',
        };
    }).filter(t => t.transactionDate);
}

/** Split a CSV or TSV line respecting quoted fields */
function splitLine(line) {
    if (line.includes('\t') && !line.includes('"')) {
        return line.split('\t');
    }
    const result = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
            result.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

// ─── ACCOUNT SELECTOR POPULATION ─────────────────────────────────────────────

/**
 * Populate the main-account dropdown and the target-account resolution map
 * from IndexedDB accounts.
 */
export async function populateHdfcAccountDropdown() {
    const accounts = await getAll('accounts');
    const sel = document.getElementById('hdfc-main-account');
    if (!sel) return;

    // Save current value to restore after reload
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Select Main Account —</option>';

    accounts
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.shortCode;
            opt.textContent = `${acc.shortCode} — ${acc.name}`;
            sel.appendChild(opt);
        });

    if (prev) sel.value = prev;
}

// ─── IMPORT HANDLER ───────────────────────────────────────────────────────────

/**
 * Wire all HDFC import UI events.
 * @param {function} onImportDone - called after a successful import to refresh views
 */
export function initHdfcImport(onImportDone) {
    const fileInput = document.getElementById('hdfc-file');
    if (!fileInput) return;

    const modal = document.getElementById('hdfc-preview-modal');
    const confirmBtn = document.getElementById('hdfc-preview-confirm');
    const cancelBtn = document.getElementById('hdfc-preview-cancel');
    const closeBtn = document.getElementById('hdfc-preview-close');

    let pendingPreview = null;

    function closePreview() {
        pendingPreview = null;
        if (modal) modal.hidden = true;
    }

    async function confirmPreview() {
        if (!pendingPreview) return;

        const validRows = pendingPreview.rows.filter((r) => r.errors.length === 0);
        const transactions = validRows.map((r) => r.tx);
        if (transactions.length === 0) {
            showStatus('hdfc-status', 'error', 'No valid rows to import. Please fix errors and retry.');
            closePreview();
            return;
        }

        const totalRows = pendingPreview.rows.length;
        const invalidRows = totalRows - transactions.length;
        const mode = pendingPreview.mode;

        if (mode === 'append') {
            const existing = await getAll('transactions');
            const merged = dedupeMirroredTransactions([...existing, ...transactions]);
            await clearAndBulkInsert('transactions', merged);
            const removed = existing.length + transactions.length - merged.length;
            showStatus('hdfc-status', 'success',
                `Imported ${transactions.length}/${totalRows} rows. Errors skipped: ${invalidRows}. Duplicates removed: ${removed}.`);
        } else {
            await clearAndBulkInsert('transactions', transactions);
            showStatus('hdfc-status', 'success',
                `Imported ${transactions.length}/${totalRows} rows. Errors skipped: ${invalidRows}.`);
        }

        closePreview();
        onImportDone();
    }

    confirmBtn?.addEventListener('click', confirmPreview);
    cancelBtn?.addEventListener('click', closePreview);
    closeBtn?.addEventListener('click', closePreview);

    populateHdfcAccountDropdown();

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const mainAccountCode = (document.getElementById('hdfc-main-account')?.value || '').trim().toUpperCase();
        if (!mainAccountCode) {
            showStatus('hdfc-status', 'error', 'Please select the Main Account before uploading.');
            e.target.value = '';
            return;
        }

        showStatus('hdfc-status', 'info', 'Parsing HDFC file...');

        try {
            const text = await file.text();
            const parsed = parseHdfcCsv(text);
            if (parsed.length === 0) {
                showStatus('hdfc-status', 'error', 'No valid transactions found in HDFC file.');
                e.target.value = '';
                return;
            }

            const accounts = await getAll('accounts');
            const fullNameMap = buildFullNameToShortCodeMap(accounts);
            const mode = getImportMode('hdfc-import-mode');

            const previewRows = parsed.map((t) => {
                const errors = [];
                const resolved = resolveTargetAccountDetailed(t.targetFullName, fullNameMap);
                if (!resolved.found) {
                    errors.push(`Target account not found: ${t.targetFullName || '(blank)'}`);
                }
                if ((t.depositAmount || 0) <= 0 && (t.withdrawalAmount || 0) <= 0) {
                    errors.push('Both deposit and withdrawal are zero.');
                }

                const { targetFullName: _discard, rowNo, ...clean } = t;
                return {
                    rowNo,
                    targetFullName: t.targetFullName,
                    errors,
                    tx: {
                        ...clean,
                        mainAccount: mainAccountCode,
                        targetAccount: resolved.code,
                    },
                };
            });

            pendingPreview = { rows: previewRows, mode };
            renderPreview(previewRows, mode);
            if (modal) modal.hidden = false;
            showStatus('hdfc-status', 'info', 'Preview generated. Confirm to import.');
        } catch (err) {
            showStatus('hdfc-status', 'error', 'Error: ' + err.message);
        }

        e.target.value = '';
    });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Build a map of "Full Account Name path" → shortCode.
 * Uses the fullAccountName field stored on each account if available,
 * otherwise falls back to just the shortCode.
 */
function buildFullNameToShortCodeMap(accounts) {
    const map = new Map();
    accounts.forEach(acc => {
        if (acc.fullAccountName) {
            map.set(acc.fullAccountName.toLowerCase(), acc.shortCode);
        }
        // Also allow direct shortCode match for convenience
        map.set(acc.shortCode.toLowerCase(), acc.shortCode);
        // And plain account name
        if (acc.name) {
            map.set(acc.name.trim().toLowerCase(), acc.shortCode);
        }
    });
    return map;
}

function resolveTargetAccount(fullName, fullNameMap, rowNo) {
    if (!fullName) return '';
    const key = fullName.trim().toLowerCase();
    const resolved = fullNameMap.get(key);
    if (!resolved) {
        console.warn(`Row ${rowNo}: Target account "${fullName}" not found in Chart of Accounts — left blank.`);
        return fullName.toUpperCase(); // Keep raw value so user can see it in ledger
    }
    return resolved;
}

function getImportMode(groupName) {
    const sel = document.querySelector(`input[name="${groupName}"]:checked`);
    return sel ? sel.value : 'replace';
}

function showStatus(id, type, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'status-msg ' + (type || '');
    el.textContent = message || '';
}

function resolveTargetAccountDetailed(fullName, fullNameMap) {
    if (!fullName) return { code: '', found: false };
    const key = fullName.trim().toLowerCase();
    const resolved = fullNameMap.get(key);
    if (!resolved) return { code: fullName.toUpperCase(), found: false };
    return { code: resolved, found: true };
}

function renderPreview(rows, mode) {
    const summary = document.getElementById('hdfc-preview-summary');
    const body = document.getElementById('hdfc-preview-body');
    const confirmBtn = document.getElementById('hdfc-preview-confirm');
    if (!summary || !body || !confirmBtn) return;

    const total = rows.length;
    const valid = rows.filter((r) => r.errors.length === 0).length;
    const invalid = total - valid;

    summary.textContent = `Mode: ${mode === 'append' ? 'Append / Merge' : 'Clean / Full Reload'} | Total: ${total} | Valid: ${valid} | Errors: ${invalid}`;

    body.innerHTML = rows.map((r) => {
        const cls = r.errors.length ? 'row-error' : 'row-ok';
        const status = r.errors.length ? r.errors.join('; ') : 'OK';
        return `
            <tr class="${cls}">
                <td>${r.rowNo}</td>
                <td>${escHtml(r.tx.transactionDate)}</td>
                <td>${escHtml(r.tx.valueDate)}</td>
                <td>${escHtml(r.tx.description)}</td>
                <td>${escHtml(r.tx.mainAccount)}</td>
                <td title="${escHtml(r.targetFullName || r.tx.targetAccount)}">${escHtml(r.tx.targetAccount)}</td>
                <td class="num">${formatNum(r.tx.depositAmount)}</td>
                <td class="num">${formatNum(r.tx.withdrawalAmount)}</td>
                <td>${escHtml(status)}</td>
            </tr>
        `;
    }).join('');

    confirmBtn.textContent = invalid > 0 ? `Confirm Import (${valid} valid rows)` : 'Confirm Import';
}

function formatNum(v) {
    const n = Number(v || 0);
    return n ? n.toFixed(2) : '';
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * ui-update-coa.js — Update Chart of Accounts with validation and XLS export
 */

import { getAll, bulkInsert } from './db.js';
import { ACCOUNT_TYPES, formatDate, parseDate } from './models.js';

export async function renderUpdateCoaTab() {
    const container = document.getElementById('update-coa-root');
    if (!container) return;

    container.innerHTML = '<p class="loading">Loading Chart of Accounts...</p>';

    const accounts = await getAll('accounts');
    if (accounts.length === 0) {
        container.innerHTML = '<p class="empty-state">No accounts found. Please upload a Chart of Accounts first.</p>';
        return;
    }

    const sortedAccounts = [...accounts].sort(compareCoaRows);

    let html = `
        <div class="panel">
            <h2>Chart of Accounts</h2>
            <p class="hint">Edit account details in the table below. Parent account and account type changes are validated.</p>
            <div class="button-row" style="margin-bottom: 12px;">
                <button id="btn-save-coa-changes" class="btn">Save Changes</button>
                <button id="btn-export-coa-xls" class="btn">Download COA (XLS)</button>
            </div>
            <div id="coa-update-status" class="status-msg"></div>
            <div class="table-scroll">
                <table class="edit-table" id="coa-edit-table">
                    <thead>
                        <tr>
                            <th>Short Code</th>
                            <th>Name</th>
                            <th>Full Account Name</th>
                            <th>Description</th>
                            <th>Type</th>
                            <th>Parent Short Code</th>
                            <th>Opening Date</th>
                            <th>Opening Balance</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    // Create rows for each account
    sortedAccounts.forEach((acc, idx) => {
        const typeSelect = ACCOUNT_TYPES.map(t =>
            `<option value="${t}" ${acc.type === t ? 'selected' : ''}>${t}</option>`
        ).join('');

        html += `
            <tr data-shortcode="${escHtml(acc.shortCode)}" data-original-type="${escHtml(acc.type)}" data-original-parent="${escHtml(acc.parentShortCode || '')}">
                <td><code>${escHtml(acc.shortCode)}</code></td>
                <td><input type="text" class="cell-input" data-field="name" value="${escHtml(acc.name || '')}"></td>
                <td><input type="text" class="cell-input" data-field="fullAccountName" value="${escHtml(acc.fullAccountName || '')}"></td>
                <td><input type="text" class="cell-input" data-field="description" value="${escHtml(acc.description || '')}"></td>
                <td>
                    <select class="cell-select" data-field="type" data-shortcode="${escHtml(acc.shortCode)}">
                        ${typeSelect}
                    </select>
                </td>
                <td><input type="text" class="cell-input" data-field="parentShortCode" value="${escHtml(acc.parentShortCode || '')}"></td>
                <td><input type="text" class="cell-input" data-field="openingDate" value="${escHtml(acc.openingDate || '')}"></td>
                <td><input type="number" class="cell-input" data-field="openingBalance" step="0.01" value="${acc.openingBalance || 0}"></td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Wire up save button
    document.getElementById('btn-save-coa-changes')?.addEventListener('click', async () => {
        try {
            await saveCoaChanges();
        } catch (err) {
            showStatus('coa-update-status', 'error', 'Save failed: ' + err.message);
        }
    });

    // Wire up export button
    document.getElementById('btn-export-coa-xls')?.addEventListener('click', async () => {
        try {
            await exportCoaAsXls(accounts);
        } catch (err) {
            showStatus('coa-update-status', 'error', 'Export failed: ' + err.message);
        }
    });
}

async function saveCoaChanges() {
    const updated = readAccountsFromTable();
    const accountMap = new Map(updated.map((a) => [a.shortCode, a]));
    const errors = [];

    updated.forEach((acc, idx) => {
        // Validation: account type
        if (!ACCOUNT_TYPES.includes(acc.type)) {
            errors.push(`Row ${idx + 1}: Invalid account type "${acc.type}".`);
            return;
        }

        // Validation: parent exists (unless empty)
        if (acc.parentShortCode) {
            if (!accountMap.has(acc.parentShortCode)) {
                errors.push(`Row ${idx + 1}: Parent account "${acc.parentShortCode}" does not exist.`);
                return;
            }

            // Check for circular references
            if (isCircularReference(acc.shortCode, acc.parentShortCode, accountMap)) {
                errors.push(`Row ${idx + 1}: Setting parent to "${acc.parentShortCode}" would create a circular reference.`);
                return;
            }
        }

        // Validation: date format
        if (acc.openingDate && !isValidDateFormat(acc.openingDate)) {
            errors.push(`Row ${idx + 1}: Opening Date must be in dd-mmm-yyyy format.`);
            return;
        }
    });

    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }

    // Save to DB
    await bulkInsert('accounts', updated);
    showStatus('coa-update-status', 'success', `Successfully saved ${updated.length} account(s).`);

    // Refresh the tree
    setTimeout(() => {
        renderUpdateCoaTab();
    }, 500);
}

function isValidDateFormat(dateStr) {
    if (!dateStr) return true;
    return !!parseDate(dateStr);
}

function isCircularReference(shortCode, parentShortCode, accMap, visited = new Set()) {
    if (visited.has(parentShortCode)) return true;
    if (shortCode === parentShortCode) return true;

    visited.add(parentShortCode);

    const parent = accMap.get(parentShortCode);
    if (!parent || !parent.parentShortCode) return false;

    return isCircularReference(shortCode, parent.parentShortCode, accMap, visited);
}

async function exportCoaAsXls(accounts) {
    const currentRows = readAccountsFromTable();
    const source = currentRows.length > 0 ? currentRows : accounts;

    let html = `
        <html>
        <head><meta charset="utf-8"></head>
        <body>
        <h2>Chart of Accounts</h2>
        <p>Generated At: ${formatDate(new Date())}</p>
        <table border="1" cellspacing="0" cellpadding="4">
            <tr>
                <th>Opening Date</th>
                <th>Account Name</th>
                <th>Description</th>
                <th>Account ShortCode</th>
                <th>Full Account Name</th>
                <th>Account Type</th>
                <th>Opening Balance</th>
            </tr>
    `;

    source.forEach(acc => {
        html += `
            <tr>
                <td>${escHtml(acc.openingDate || '')}</td>
                <td>${escHtml(acc.name || '')}</td>
                <td>${escHtml(acc.description || '')}</td>
                <td>${escHtml(acc.shortCode)}</td>
                <td>${escHtml(acc.fullAccountName || '')}</td>
                <td>${escHtml(acc.type)}</td>
                <td style="text-align:right">${Number(acc.openingBalance || 0).toFixed(2)}</td>
            </tr>
        `;
    });

    html += `
        </table>
        </body></html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chart-of-accounts-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('coa-update-status', 'success', 'Chart of Accounts downloaded.');
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

function readAccountsFromTable() {
    const rows = document.querySelectorAll('#coa-edit-table tbody tr');
    const data = [];
    rows.forEach((row) => {
        data.push({
            shortCode: row.dataset.shortcode || '',
            name: readField(row, 'name'),
            fullAccountName: readField(row, 'fullAccountName'),
            description: readField(row, 'description'),
            type: readField(row, 'type'),
            parentShortCode: readField(row, 'parentShortCode').toUpperCase(),
            openingDate: readField(row, 'openingDate'),
            openingBalance: toNumber(readField(row, 'openingBalance')),
        });
    });
    return data;
}

function readField(row, field) {
    const input = row.querySelector(`[data-field="${field}"]`);
    return input ? input.value.trim() : '';
}

function toNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

function compareCoaRows(a, b) {
    const keyA = (a.mainAccount || a.fullAccountName || a.name || a.shortCode || '').toUpperCase();
    const keyB = (b.mainAccount || b.fullAccountName || b.name || b.shortCode || '').toUpperCase();
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;

    const dateA = parseDate(a.transactionDate || a.openingDate || '');
    const dateB = parseDate(b.transactionDate || b.openingDate || '');
    const timeA = dateA ? dateA.getTime() : Number.MAX_SAFE_INTEGER;
    const timeB = dateB ? dateB.getTime() : Number.MAX_SAFE_INTEGER;
    if (timeA !== timeB) return timeA - timeB;

    const codeA = (a.shortCode || '').toUpperCase();
    const codeB = (b.shortCode || '').toUpperCase();
    if (codeA < codeB) return -1;
    if (codeA > codeB) return 1;
    return 0;
}


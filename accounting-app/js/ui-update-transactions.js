/**
 * ui-update-transactions.js — Update Transactions with filter and XLS export
 */

import { getAll, bulkInsert } from './db.js';
import { formatDate, parseDate, toFloat } from './models.js';

export async function renderUpdateTransactionsTab() {
    const container = document.getElementById('update-tx-root');
    if (!container) return;

    container.innerHTML = '<p class="loading">Loading transactions...</p>';

    const [transactions, accounts] = await Promise.all([
        getAll('transactions'),
        getAll('accounts'),
    ]);

    if (transactions.length === 0) {
        container.innerHTML = '<p class="empty-state">No transactions found. Please upload transactions first.</p>';
        return;
    }

    // Create account map for dropdown
    const accountMap = {};
    accounts.forEach(acc => {
        accountMap[acc.shortCode] = acc;
    });

    const sortedTransactions = [...transactions].sort(compareTransactionsByMainAndDate);
    const splitTxnMap = buildSplitTxnMap(sortedTransactions);

    // Get unique accounts from both main and target sides
    const accountOptions = [...new Set(sortedTransactions.flatMap((t) => [t.mainAccount, t.targetAccount]).filter(Boolean))].sort();

    let html = `
        <div class="panel">
            <h2>Accounts</h2>
            <p class="hint">Select an account and edit its transactions in the table. All fields are editable.</p>

            <div class="filter-bar">
                 <label for="tx-filter-account"><strong>Select Account:</strong></label>
                 <select id="tx-filter-account">
                     <option value="">-- All Accounts (Canonical View) --</option>
     `;

     accountOptions.forEach(acc => {
         const name = accountMap[acc] ? accountMap[acc].name : '';
         html += `<option value="${escHtml(acc)}">${escHtml(acc)}${name ? ' - ' + escHtml(name) : ''}</option>`;
     });

     html += `
                 </select>
                 <div id="opening-balance-display" class="opening-balance-info" style="margin-left:20px; display:none;">
                     <strong>Opening Balance:</strong> <span id="opening-balance-value">0.00</span>
                 </div>
             </div>

            <div class="button-row" style="margin-bottom: 12px;">
                <button id="btn-save-tx-changes" class="btn">Save Changes</button>
                <button id="btn-export-tx-xls" class="btn">Download Transactions (XLS)</button>
            </div>
            <div id="tx-update-status" class="status-msg"></div>

            <div class="table-scroll">
                <table class="edit-table" id="tx-edit-table">
                    <thead>
                         <tr>
                             <th>Main Account</th>
                             <th>Transaction Date</th>
                             <th>Value Date</th>
                             <th>Description</th>
                             <th>Comments 1</th>
                             <th>Comments 2</th>
                             <th>Deposit Amount</th>
                             <th>Withdrawal Amount</th>
                             <th>Target Account</th>
                             <th>Note</th>
                             <th class="num">Running Balance</th>
                         </tr>
                     </thead>
                    <tbody>
    `;

    // Populate table with all transactions initially
    sortedTransactions.forEach((tx, idx) => {
        html += createTransactionRow(tx, idx, accountMap, splitTxnMap);
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = html;

     // Wire up filter
     const filterSelect = document.getElementById('tx-filter-account');
     if (filterSelect) {
         filterSelect.addEventListener('change', () => {
             const selected = filterSelect.value;
             const rows = document.querySelectorAll('#tx-edit-table tbody tr');
             applyAccountFilter(rows, selected, accountMap);
             const openingBalance = selected ? Number(accountMap[selected]?.openingBalance || 0) : 0;
             updateRunningBalances(rows, selected, openingBalance);
             updateOpeningBalanceDisplay(selected, accountMap);
         });

         // Ensure base state is normalized on first render.
         const rows = document.querySelectorAll('#tx-edit-table tbody tr');
         applyAccountFilter(rows, filterSelect.value || '', accountMap);
         const openingBalance = filterSelect.value ? Number(accountMap[filterSelect.value]?.openingBalance || 0) : 0;
         updateRunningBalances(rows, filterSelect.value || '', openingBalance);
         updateOpeningBalanceDisplay(filterSelect.value || '', accountMap);
     }

    const txTable = document.getElementById('tx-edit-table');
    txTable?.addEventListener('input', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.field !== 'targetAccount') return;
        const row = target.closest('tr');
        if (!row) return;
        updateTargetAccountHint(row, accountMap);
    });

    // Wire up save button
    document.getElementById('btn-save-tx-changes')?.addEventListener('click', async () => {
        try {
            await saveTransactionChanges(accountMap);
        } catch (err) {
            showStatus('tx-update-status', 'error', 'Save failed: ' + err.message);
        }
    });

    // Wire up export button
    document.getElementById('btn-export-tx-xls')?.addEventListener('click', async () => {
        try {
            await exportTransactionsAsXls(transactions);
        } catch (err) {
            showStatus('tx-update-status', 'error', 'Export failed: ' + err.message);
        }
    });
}

function createTransactionRow(tx, idx, accountMap, splitTxnMap) {
     const targetAccName = accountMap[tx.targetAccount] ? accountMap[tx.targetAccount].name : '';
     const txId = extractTxnId(tx.comments1);
     const isSplit = txId && (splitTxnMap.get(txId) || 0) > 1;
     const splitNote = isSplit ? 'Split entry' : '';
     const splitClass = isSplit ? ' split-entry-row' : '';

     return `
         <tr class="${splitClass}" data-index="${idx}" data-id="${tx.id || ''}" data-base-main="${escHtml(tx.mainAccount || '')}" data-base-target="${escHtml(tx.targetAccount || '')}" data-base-deposit="${Number(tx.depositAmount || 0)}" data-base-withdrawal="${Number(tx.withdrawalAmount || 0)}" data-perspective="main" data-is-split="${isSplit ? '1' : '0'}">
             <td><input type="text" class="cell-input" data-field="mainAccount" value="${escHtml(tx.mainAccount)}"></td>
             <td><input type="text" class="cell-input" data-field="transactionDate" value="${escHtml(tx.transactionDate || '')}"></td>
             <td><input type="text" class="cell-input" data-field="valueDate" value="${escHtml(tx.valueDate || '')}"></td>
             <td><input type="text" class="cell-input" data-field="description" value="${escHtml(tx.description || '')}"></td>
             <td><input type="text" class="cell-input" data-field="comments1" value="${escHtml(tx.comments1 || '')}"></td>
             <td><input type="text" class="cell-input" data-field="comments2" value="${escHtml(tx.comments2 || '')}"></td>
             <td><input type="number" class="cell-input" data-field="depositAmount" step="0.01" value="${tx.depositAmount || 0}"></td>
             <td><input type="number" class="cell-input" data-field="withdrawalAmount" step="0.01" value="${tx.withdrawalAmount || 0}"></td>
             <td>
                 <div class="target-account-cell">
                     <input type="text" class="cell-input" data-field="targetAccount" value="${escHtml(tx.targetAccount || '')}" style="flex: 1;">
                     <span class="target-account-name" style="padding: 4px 8px; font-size: 12px; color: #666;">
                         ${escHtml(targetAccName ? '→ ' + targetAccName : '')}
                     </span>
                 </div>
             </td>
             <td><span class="tx-entry-note">${escHtml(splitNote)}</span></td>
             <td class="num running-balance">0.00</td>
         </tr>
     `;
 }

async function saveTransactionChanges(accountMap) {
    const visibleRows = readTransactionsFromTable({ visibleOnly: true });
    const existing = await getAll('transactions');
    const errors = [];

    visibleRows.forEach((tx, idx) => {
        const mainAccount = tx.mainAccount;
        const targetAccount = tx.targetAccount;

        // Validation: main account required
        if (!mainAccount) {
            errors.push(`Row ${idx + 1}: Main Account is required.`);
            return;
        }

        // Validation: main account must exist
        if (!accountMap[mainAccount]) {
            errors.push(`Row ${idx + 1}: Main Account "${mainAccount}" does not exist.`);
            return;
        }

        // Validation: target account must exist if provided
        if (targetAccount && !accountMap[targetAccount]) {
            errors.push(`Row ${idx + 1}: Target Account "${targetAccount}" does not exist.`);
            return;
        }

        // Validation: at least one of deposit or withdrawal must be present
        if (!tx.depositAmount && !tx.withdrawalAmount) {
            errors.push(`Row ${idx + 1}: Either Deposit Amount or Withdrawal Amount must be specified.`);
            return;
        }
    });

    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }

    const merged = mergeTransactionUpdates(existing, visibleRows);

    await bulkInsert('transactions', merged);
    showStatus('tx-update-status', 'success', `Successfully saved ${visibleRows.length} transaction(s).`);

    // Refresh the view
    setTimeout(() => {
        renderUpdateTransactionsTab();
    }, 500);
}

async function exportTransactionsAsXls(transactions) {
    const currentRows = readTransactionsFromTable({ visibleOnly: false });
    const source = currentRows.length > 0 ? currentRows : transactions;

    let html = `
        <html>
        <head><meta charset="utf-8"></head>
        <body>
        <h2>Transactions</h2>
        <p>Generated At: ${formatDate(new Date())}</p>
        <table border="1" cellspacing="0" cellpadding="4">
            <tr>
                <th>Main Account</th>
                <th>Transaction Date</th>
                <th>Value Date</th>
                <th>Description</th>
                <th>Comments1</th>
                <th>Comments2</th>
                <th>Deposit Amount</th>
                <th>Withdrawal Amount</th>
                <th>Target Account</th>
            </tr>
    `;

    source.forEach(tx => {
        html += `
            <tr>
                <td>${escHtml(tx.mainAccount)}</td>
                <td>${escHtml(tx.transactionDate || '')}</td>
                <td>${escHtml(tx.valueDate || '')}</td>
                <td>${escHtml(tx.description || '')}</td>
                <td>${escHtml(tx.comments1 || '')}</td>
                <td>${escHtml(tx.comments2 || '')}</td>
                <td style="text-align:right">${Number(tx.depositAmount || 0).toFixed(2)}</td>
                <td style="text-align:right">${Number(tx.withdrawalAmount || 0).toFixed(2)}</td>
                <td>${escHtml(tx.targetAccount || '')}</td>
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
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('tx-update-status', 'success', 'Transactions downloaded.');
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

function readTransactionsFromTable({ visibleOnly }) {
    const rows = document.querySelectorAll('#tx-edit-table tbody tr');
    const result = [];
    rows.forEach((row) => {
        if (visibleOnly && row.style.display === 'none') return;
        const perspective = row.dataset.perspective || 'main';
        const mainAccount = readField(row, 'mainAccount').toUpperCase();
        const targetAccount = readField(row, 'targetAccount').toUpperCase();
        const depositAmount = Math.abs(toFloat(readField(row, 'depositAmount')));
        const withdrawalAmount = Math.abs(toFloat(readField(row, 'withdrawalAmount')));

        const canonical = perspective === 'target'
            ? {
                mainAccount: targetAccount,
                targetAccount: mainAccount,
                depositAmount: withdrawalAmount,
                withdrawalAmount: depositAmount,
            }
            : {
                mainAccount,
                targetAccount,
                depositAmount,
                withdrawalAmount,
            };

        result.push({
            id: row.dataset.id ? Number(row.dataset.id) : undefined,
            mainAccount: canonical.mainAccount,
            transactionDate: readField(row, 'transactionDate'),
            valueDate: readField(row, 'valueDate'),
            description: readField(row, 'description'),
            comments1: readField(row, 'comments1'),
            comments2: readField(row, 'comments2'),
            depositAmount: canonical.depositAmount,
            withdrawalAmount: canonical.withdrawalAmount,
            targetAccount: canonical.targetAccount,
        });
    });
    return result;
}

function readField(row, field) {
    const input = row.querySelector(`[data-field="${field}"]`);
    return input ? input.value.trim() : '';
}

function updateTargetAccountHint(row, accountMap) {
    const targetCode = readField(row, 'targetAccount').toUpperCase();
    const hintEl = row.querySelector('.target-account-name');
    if (!hintEl) return;
    const account = accountMap[targetCode];
    hintEl.textContent = account ? `→ ${account.name}` : '';
}

export function mergeTransactionUpdates(existingTransactions, visibleUpdates) {
    const updatesById = new Map();
    const newRows = [];

    visibleUpdates.forEach((row) => {
        if (typeof row.id === 'number' && !Number.isNaN(row.id)) {
            updatesById.set(row.id, row);
        } else {
            newRows.push(row);
        }
    });

    const merged = existingTransactions.map((tx) => {
        const updated = updatesById.get(tx.id);
        return updated ? { ...tx, ...updated } : tx;
    });

    return merged.concat(newRows);
}

function compareTransactionsByMainAndDate(a, b) {
    const mainA = (a.mainAccount || '').toUpperCase();
    const mainB = (b.mainAccount || '').toUpperCase();
    if (mainA < mainB) return -1;
    if (mainA > mainB) return 1;

    // Parse and compare transaction dates in ascending order
    const dateStrA = a.transactionDate || a.valueDate || '';
    const dateStrB = b.transactionDate || b.valueDate || '';

    const dateA = parseDate(dateStrA);
    const dateB = parseDate(dateStrB);

    // Handle null dates (put them at the end)
    if (!dateA && !dateB) {
        const idA = typeof a.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER;
        const idB = typeof b.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER;
        return idA - idB;
    }
    if (!dateA) return 1;  // a has no date, goes after b
    if (!dateB) return -1; // b has no date, goes after a

    // Both dates are valid, compare them in ascending order
    const timeA = dateA.getTime();
    const timeB = dateB.getTime();
    if (timeA !== timeB) return timeA - timeB;

    // If dates are equal, sort by ID
    const idA = typeof a.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER;
    const idB = typeof b.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER;
    return idA - idB;
}

function applyAccountFilter(rows, selectedAccount, accountMap) {
    const selected = (selectedAccount || '').toUpperCase();

    rows.forEach((row) => {
        const baseMain = (row.dataset.baseMain || '').toUpperCase();
        const baseTarget = (row.dataset.baseTarget || '').toUpperCase();

        if (!selected) {
            applyMainPerspective(row, accountMap);
            row.style.display = '';
            return;
        }

        if (baseMain === selected) {
            applyMainPerspective(row, accountMap);
            row.style.display = '';
            return;
        }

        if (baseTarget === selected) {
            applyTargetPerspective(row, selected, accountMap);
            row.style.display = '';
            return;
        }

        row.style.display = 'none';
    });

    // Re-sort visible rows in the DOM by transaction date (ascending)
    const tbody = rows.length > 0 ? rows[0].parentElement : null;
    if (!tbody) return;

    const visibleRows = Array.from(rows).filter((r) => r.style.display !== 'none');
    visibleRows.sort((a, b) => {
        const dateStrA = readField(a, 'transactionDate') || readField(a, 'valueDate') || '';
        const dateStrB = readField(b, 'transactionDate') || readField(b, 'valueDate') || '';
        const dateA = parseDate(dateStrA);
        const dateB = parseDate(dateStrB);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
    });

    // Move sorted visible rows to front of tbody, hidden rows stay at end
    const hiddenRows = Array.from(rows).filter((r) => r.style.display === 'none');
    [...visibleRows, ...hiddenRows].forEach((row) => tbody.appendChild(row));
}

function applyMainPerspective(row, accountMap) {
    row.dataset.perspective = 'main';
    row.classList.remove('tx-target-perspective');

    setField(row, 'mainAccount', row.dataset.baseMain || '');
    setField(row, 'targetAccount', row.dataset.baseTarget || '');
    setField(row, 'depositAmount', row.dataset.baseDeposit || '0');
    setField(row, 'withdrawalAmount', row.dataset.baseWithdrawal || '0');
    updateTargetAccountHint(row, accountMap);
}

function applyTargetPerspective(row, selectedAccount, accountMap) {
    row.dataset.perspective = 'target';
    row.classList.add('tx-target-perspective');

    const baseMain = row.dataset.baseMain || '';
    const baseDeposit = toFloat(row.dataset.baseDeposit || '0');
    const baseWithdrawal = toFloat(row.dataset.baseWithdrawal || '0');

    setField(row, 'mainAccount', selectedAccount || '');
    setField(row, 'targetAccount', baseMain);
    setField(row, 'depositAmount', String(Math.abs(baseWithdrawal)));
    setField(row, 'withdrawalAmount', String(Math.abs(baseDeposit)));
    updateTargetAccountHint(row, accountMap);
}

function setField(row, field, value) {
    const el = row.querySelector(`[data-field="${field}"]`);
    if (!el) return;
    el.value = value;
}

function extractTxnId(comments1) {
    const m = String(comments1 || '').match(/TxnID:([^|\s]+)/i);
    return m ? m[1].trim() : '';
}

function buildSplitTxnMap(transactions) {
    const map = new Map();
    (transactions || []).forEach((tx) => {
        const txnId = extractTxnId(tx.comments1);
        if (!txnId) return;
        map.set(txnId, (map.get(txnId) || 0) + 1);
    });
    return map;
}

function updateRunningBalances(rows, selectedAccount, openingBalance) {
    let running = openingBalance;
    const visibleRows = Array.from(rows).filter((row) => row.style.display !== 'none');

    visibleRows.forEach((row) => {
        const deposit = toFloat(row.querySelector('[data-field="depositAmount"]')?.value || '0');
        const withdrawal = toFloat(row.querySelector('[data-field="withdrawalAmount"]')?.value || '0');
        const effect = deposit - withdrawal;
        running += effect;
        const balanceCell = row.querySelector('.running-balance');
        if (balanceCell) {
            balanceCell.textContent = formatCurrencyVal(running);
        }
    });
}

function updateOpeningBalanceDisplay(selectedAccount, accountMap) {
    const display = document.getElementById('opening-balance-display');
    const value = document.getElementById('opening-balance-value');
    if (!display || !value) return;

    if (selectedAccount) {
        const acc = accountMap[selectedAccount];
        const openingBalance = acc ? Number(acc.openingBalance || 0) : 0;
        value.textContent = formatCurrencyVal(openingBalance);
        display.style.display = '';
    } else {
        display.style.display = 'none';
    }
}

function formatCurrencyVal(val) {
    return Number.isFinite(Number(val)) ? Number(val).toFixed(2) : '0.00';
}

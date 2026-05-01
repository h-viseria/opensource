/**
 * ui-transactions.js — Renders the account ledger / transaction drilldown panel
 */

import { getAccountLedger } from './accounts.js';
import { formatCurrency, NORMAL_BALANCE, parseDate } from './models.js';

export async function renderLedger(shortCode) {
    const panel = document.getElementById('ledger-panel');
    panel.style.display = 'block';
    panel.innerHTML = '<p class="loading">Loading ledger...</p>';

    const data = await getAccountLedger(shortCode);

    if (!data) {
        panel.innerHTML = '<p class="empty-state">Account not found.</p>';
        return;
    }

    const { account, openingBalance, ledgerRows, accMap } = data;
    const nb = NORMAL_BALANCE[account.type] || 'debit';
    const typeLabel = String(account.type || 'Unknown');
    const typeClass = String(account.type || 'unknown').toLowerCase();

    let html = `
        <div class="ledger-header">
            <div class="ledger-title">
                <h2>${escHtml(account.name)}</h2>
                <span class="badge badge-${typeClass}">${escHtml(typeLabel)}</span>
                <code class="shortcode-badge">${escHtml(account.shortCode)}</code>
            </div>
            <button id="close-ledger" class="btn btn-secondary">&#10005; Close</button>
        </div>
        <div class="ledger-meta">
            <span><strong>Description:</strong> ${escHtml(account.description)}</span>
            <span><strong>Natural Balance:</strong> ${nb.charAt(0).toUpperCase() + nb.slice(1)}</span>
            <span><strong>Opening Balance:</strong> ${formatCurrency(openingBalance)}</span>
        </div>
    `;

    if (ledgerRows.length === 0) {
        html += '<p class="empty-state" style="margin-top:16px">No transactions found for this account.</p>';
    } else {
        html += `
            <div class="ledger-filters">
                <label>From (dd-mmm-yyyy)
                    <input id="ledger-from" type="text" placeholder="01-Apr-2026">
                </label>
                <label>To (dd-mmm-yyyy)
                    <input id="ledger-to" type="text" placeholder="30-Apr-2026">
                </label>
                <label>Counterpart Account
                    <select id="ledger-counterpart">
                        <option value="">All</option>
                    </select>
                </label>
                <button id="ledger-apply" class="btn">Apply Filters</button>
                <button id="ledger-reset" class="btn btn-secondary">Reset</button>
            </div>
            <div id="ledger-filter-status" class="status-msg"></div>
            <p class="hint">Running balance reflects full ledger order, even when rows are filtered.</p>
            <div class="table-scroll">
                <table class="tx-table">
                    <thead>
                        <tr>
                            <th>Tx Date</th>
                            <th>Value Date</th>
                            <th>Description</th>
                            <th>Comments 1</th>
                            <th>Comments 2</th>
                            <th>Counterpart</th>
                            <th class="num">Deposit</th>
                            <th class="num">Withdrawal</th>
                            <th class="num">Balance</th>
                        </tr>
                    </thead>
                    <tbody id="ledger-rows"></tbody>
                </table>
            </div>
        `;
    }

    panel.innerHTML = html;
    if (ledgerRows.length > 0) {
        bindFilters(panel, ledgerRows, openingBalance, accMap);
    }
    document.getElementById('close-ledger').addEventListener('click', () => {
        panel.style.display = 'none';
        document.querySelectorAll('.acc-row').forEach(r => r.classList.remove('selected'));
    });
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function bindFilters(panel, ledgerRows, openingBalance, accMap) {
    const counterpartSelect = panel.querySelector('#ledger-counterpart');
    const fromInput = panel.querySelector('#ledger-from');
    const toInput = panel.querySelector('#ledger-to');
    const applyBtn = panel.querySelector('#ledger-apply');
    const resetBtn = panel.querySelector('#ledger-reset');
    const status = panel.querySelector('#ledger-filter-status');

    const counterpartCodes = new Set();
    ledgerRows.forEach((row) => {
        const code = row.side === 'main' ? row.tx.targetAccount : row.tx.mainAccount;
        if (code) counterpartCodes.add(code);
    });

    Array.from(counterpartCodes).sort().forEach((code) => {
        const option = document.createElement('option');
        const label = accMap[code] ? `${code} - ${accMap[code].name}` : code;
        option.value = code;
        option.textContent = label;
        counterpartSelect.appendChild(option);
    });

    function applyFilters() {
        status.className = 'status-msg';
        status.textContent = '';

        const fromRaw = fromInput.value.trim();
        const toRaw = toInput.value.trim();
        const fromDate = fromRaw ? parseDate(fromRaw) : null;
        const toDate = toRaw ? parseDate(toRaw) : null;

        if (fromRaw && !fromDate) {
            status.className = 'status-msg error';
            status.textContent = 'From date must be in dd-mmm-yyyy format.';
            return;
        }
        if (toRaw && !toDate) {
            status.className = 'status-msg error';
            status.textContent = 'To date must be in dd-mmm-yyyy format.';
            return;
        }

        const counterpart = counterpartSelect.value;
        const filtered = ledgerRows.filter((row) => {
            const txDate = parseDate(row.tx.valueDate) || parseDate(row.tx.transactionDate);
            const cp = row.side === 'main' ? row.tx.targetAccount : row.tx.mainAccount;

            if (fromDate && txDate && txDate < fromDate) return false;
            if (toDate && txDate && txDate > toDate) return false;
            if (counterpart && cp !== counterpart) return false;
            return true;
        });

        renderRows(panel.querySelector('#ledger-rows'), filtered, openingBalance, accMap);
        status.className = 'status-msg info';
        status.textContent = `Showing ${filtered.length} of ${ledgerRows.length} transaction(s).`;
    }

    applyBtn.addEventListener('click', applyFilters);
    resetBtn.addEventListener('click', () => {
        fromInput.value = '';
        toInput.value = '';
        counterpartSelect.value = '';
        renderRows(panel.querySelector('#ledger-rows'), ledgerRows, openingBalance, accMap);
        status.className = 'status-msg info';
        status.textContent = `Showing ${ledgerRows.length} of ${ledgerRows.length} transaction(s).`;
    });

    renderRows(panel.querySelector('#ledger-rows'), ledgerRows, openingBalance, accMap);
    status.className = 'status-msg info';
    status.textContent = `Showing ${ledgerRows.length} of ${ledgerRows.length} transaction(s).`;
}

function renderRows(tbody, rows, openingBalance, accMap) {
    let html = `
        <tr class="opening-row">
            <td colspan="8"><em>Opening Balance</em></td>
            <td class="num">${formatCurrency(openingBalance)}</td>
        </tr>
    `;

    rows.forEach((row) => {
        const { tx, side, displayDeposit, displayWithdrawal, runningBalance } = row;
        const counterpart = side === 'main' ? tx.targetAccount : tx.mainAccount;
        const counterName = accMap[counterpart] ? accMap[counterpart].name : counterpart;
        const balClass = runningBalance < 0 ? 'negative' : 'positive';
        const depStr = displayDeposit > 0 ? formatCurrency(displayDeposit) : '';
        const wdwStr = displayWithdrawal > 0 ? formatCurrency(displayWithdrawal) : '';

        html += `
            <tr>
                <td class="date-col">${escHtml(tx.transactionDate)}</td>
                <td class="date-col">${escHtml(tx.valueDate)}</td>
                <td>${escHtml(tx.description)}</td>
                <td>${escHtml(tx.comments1)}</td>
                <td>${escHtml(tx.comments2)}</td>
                <td class="counterpart" title="${escHtml(counterpart)}">${escHtml(counterName)}</td>
                <td class="num deposit">${depStr}</td>
                <td class="num withdrawal">${wdwStr}</td>
                <td class="num running-bal ${balClass}">${formatCurrency(runningBalance)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}


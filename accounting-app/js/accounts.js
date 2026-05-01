/**
 * accounts.js — Account tree building and balance computation
 */

import { getAll } from './db.js';
import { signedEffect, signedEffectAsTarget, parseDate, normalizeAccountTypeLabel } from './models.js';
import { isDateInSelectedFinancialYear } from './fiscal-year.js';

/**
 * Load all accounts and transactions, compute balances for each account,
 * and return a tree structure ready for rendering.
 */
export async function buildAccountTree() {
    const [accounts, transactions] = await Promise.all([
        getAll('accounts'),
        getAll('transactions'),
    ]);

    // Map shortCode → account with computed balance
    const accMap = {};
    accounts.forEach(a => {
        accMap[a.shortCode] = {
            ...a,
            balance: a.openingBalance || 0,
            children: [],
        };
    });

    // Accumulate transaction effects
    transactions.forEach(tx => {
        const deposit = toAmount(tx.depositAmount);
        const withdrawal = toAmount(tx.withdrawalAmount);
        const txDate = tx.valueDate || tx.transactionDate || '';
        const main = accMap[tx.mainAccount];
        if (main && shouldApplyTransactionForAccount(main.type, txDate)) {
            main.balance += signedEffect(main.type, deposit, withdrawal);
        }
        const target = accMap[tx.targetAccount];
        if (target && shouldApplyTransactionForAccount(target.type, txDate)) {
            target.balance += signedEffectAsTarget(target.type, deposit, withdrawal);
        }
    });

    // Build tree: link children to parents
    const roots = [];
    accounts.forEach(a => {
        const node = accMap[a.shortCode];
        if (a.parentShortCode && accMap[a.parentShortCode]) {
            accMap[a.parentShortCode].children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Sort children alphabetically by name
    function sortChildren(node) {
        node.children.sort((a, b) => a.name.localeCompare(b.name));
        node.children.forEach(sortChildren);
    }
    roots.sort((a, b) => a.name.localeCompare(b.name));
    roots.forEach(sortChildren);

    // Propagate balances up to parents (sum of self + all descendants)
    function sumBalance(node) {
        let total = node.balance;
        node.children.forEach(c => { total += sumBalance(c); });
        node.aggregateBalance = total;
        return total;
    }
    roots.forEach(sumBalance);

    const visibleRoots = roots
        .map(pruneZeroBalanceNodes)
        .filter(Boolean);

    return { roots: visibleRoots, accMap };
}

/**
 * Get transactions for a specific account (as main or target), sorted by value date.
 * Returns { account, transactions: [ { tx, side:'main'|'target', runningBalance } ] }
 */
export async function getAccountLedger(shortCode) {
    const [accounts, allTx] = await Promise.all([
        getAll('accounts'),
        getAll('transactions'),
    ]);

    return buildAccountLedgerFromData(shortCode, accounts, allTx);
}

/**
 * Build general ledger dataset for all accounts in account-by-account format.
 */
export async function getGeneralLedgerReport() {
    const [accounts, allTx] = await Promise.all([
        getAll('accounts'),
        getAll('transactions'),
    ]);

    const sortedAccounts = [...accounts].sort((a, b) =>
        (a.shortCode || '').localeCompare(b.shortCode || '')
    );

    const ledgers = sortedAccounts.map((acc) => buildAccountLedgerFromData(acc.shortCode, accounts, allTx))
        .filter((x) => !!x)
        .filter((ledger) => !isNearZero(getLedgerClosingBalance(ledger)));

    return {
        generatedAt: new Date(),
        ledgers,
    };
}

function buildAccountLedgerFromData(shortCode, accounts, allTx) {

    const accMap = {};
    accounts.forEach(a => { accMap[a.shortCode] = a; });
    const account = accMap[shortCode];
    if (!account) return null;

    // Collect all transactions touching this account
    const relevant = allTx
        .filter(tx => tx.mainAccount === shortCode || tx.targetAccount === shortCode)
        .filter(tx => shouldApplyTransactionForAccount(account.type, tx.valueDate || tx.transactionDate || ''))
        .map(tx => ({ tx, side: tx.mainAccount === shortCode ? 'main' : 'target' }));

    // Sort by value date, then transaction date
    relevant.sort((a, b) => {
        const da = parseDate(a.tx.valueDate) || parseDate(a.tx.transactionDate) || new Date(0);
        const db2 = parseDate(b.tx.valueDate) || parseDate(b.tx.transactionDate) || new Date(0);
        return da - db2;
    });

    // Compute running balance
    let running = account.openingBalance || 0;
    const ledgerRows = relevant.map(({ tx, side }) => {
        const txDeposit = toAmount(tx.depositAmount);
        const txWithdrawal = toAmount(tx.withdrawalAmount);
        let deposit, withdrawal;
        if (side === 'main') {
            deposit = txDeposit;
            withdrawal = txWithdrawal;
        } else {
            // From target account's perspective, flip
            deposit = txWithdrawal;
            withdrawal = txDeposit;
        }
        const effect = signedEffect(account.type, deposit, withdrawal);
        running += effect;
        return {
            tx,
            side,
            displayDeposit: deposit,
            displayWithdrawal: withdrawal,
            effect,
            runningBalance: running,
        };
    });

    return { account, openingBalance: account.openingBalance || 0, ledgerRows, accMap };
}

function toAmount(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Math.abs(Number.isFinite(value) ? value : 0);

    const raw = String(value).trim();
    if (!raw) return 0;

    // Support values like "1,234.56", "-1234.56", and accounting style "(1234.56)"
    const negativeByBrackets = /^\(.*\)$/.test(raw);
    const cleaned = raw.replace(/[(),\s]/g, '').replace(/,/g, '');
    const n = parseFloat(cleaned);
    if (Number.isNaN(n)) return 0;

    const signed = negativeByBrackets ? -Math.abs(n) : n;
    return Math.abs(signed);
}

function shouldApplyTransactionForAccount(accountType, txDate) {
    const normalized = normalizeAccountTypeLabel(accountType) || '';
    if (normalized !== 'Income' && normalized !== 'Expense') {
        // FY filter must not affect non P&L accounts.
        return true;
    }
    return isDateInSelectedFinancialYear(txDate);
}

function pruneZeroBalanceNodes(node) {
    const children = (node.children || [])
        .map(pruneZeroBalanceNodes)
        .filter(Boolean);

    const hasVisibleChildren = children.length > 0;
    const selfHasBalance = !isNearZero(node.aggregateBalance);

    if (!selfHasBalance && !hasVisibleChildren) {
        return null;
    }

    return {
        ...node,
        children,
    };
}

function getLedgerClosingBalance(ledger) {
    if (!ledger) return 0;
    if (!ledger.ledgerRows || ledger.ledgerRows.length === 0) {
        return Number(ledger.openingBalance || 0);
    }
    return Number(ledger.ledgerRows[ledger.ledgerRows.length - 1].runningBalance || 0);
}

function isNearZero(value) {
    return Math.abs(Number(value || 0)) < 0.000001;
}


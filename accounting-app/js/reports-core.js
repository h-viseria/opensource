/**
 * reports-core.js - Pure report calculations for trial balance, P&L, balance sheet, income statement and asset views.
 */

import { NORMAL_BALANCE, normalizeAccountTypeLabel, parseDate } from './models.js';

export function getLeafAccounts(roots) {
    const leaves = [];

    function walk(node) {
        if (!node.children || node.children.length === 0) {
            leaves.push(node);
            return;
        }
        node.children.forEach(walk);
    }

    roots.forEach(walk);
    return leaves;
}

export function buildTrialBalance(leafAccounts) {
    const rows = leafAccounts.map((acc) => {
        const bal = Number(acc.balance || 0);
        const type = normalizeAccountTypeLabel(acc.type) || 'Asset';
        const normal = NORMAL_BALANCE[type] || 'debit';
        let debit = 0;
        let credit = 0;

        if (normal === 'debit') {
            if (bal >= 0) debit = bal;
            else credit = Math.abs(bal);
        } else {
            if (bal >= 0) credit = bal;
            else debit = Math.abs(bal);
        }

        return {
            shortCode: acc.shortCode,
            name: acc.name,
            type,
            debit,
            credit,
        };
    });

    const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
    const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);

    return {
        rows,
        totalDebit,
        totalCredit,
        difference: totalDebit - totalCredit,
    };
}

export function buildProfitAndLoss(leafAccounts) {
    const incomeRows = leafAccounts
        .filter((a) => normalizeAccountTypeLabel(a.type) === 'Income')
        .map((a) => ({ shortCode: a.shortCode, name: a.name, amount: Number(a.balance || 0) }));

    const expenseRows = leafAccounts
        .filter((a) => normalizeAccountTypeLabel(a.type) === 'Expense')
        .map((a) => ({ shortCode: a.shortCode, name: a.name, amount: Number(a.balance || 0) }));

    const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount, 0);
    const totalExpense = expenseRows.reduce((sum, r) => sum + r.amount, 0);

    return {
        incomeRows,
        expenseRows,
        totalIncome,
        totalExpense,
        netProfit: totalIncome - totalExpense,
    };
}

export function buildAssetClassification(leafAccounts) {
    const assets = leafAccounts.filter((a) => normalizeAccountTypeLabel(a.type) === 'Asset');

    const groups = {
        'Current Assets': [],
        'Non-Current Assets': [],
        'Other Assets': [],
    };

    assets.forEach((acc) => {
        const key = classifyAsset(acc);
        groups[key].push({
            shortCode: acc.shortCode,
            name: acc.name,
            description: acc.description,
            balance: Number(acc.balance || 0),
            pathDepth: String(acc.fullAccountName || '').split(':').filter(Boolean).length,
        });
    });

    const totals = Object.fromEntries(
        Object.entries(groups).map(([k, rows]) => [k, rows.reduce((sum, r) => sum + r.balance, 0)])
    );

    return {
        groups,
        totals,
        grandTotal: Object.values(totals).reduce((sum, v) => sum + v, 0),
    };
}

export function flattenHierarchy(roots, predicate) {
    const out = [];

    function walk(node, depth) {
        const children = node.children || [];
        const childMatches = children.map((c) => walk(c, depth + 1));
        const selfMatch = predicate(node);
        const hasMatch = selfMatch || childMatches.some(Boolean);

        if (hasMatch) {
            out.push({
                name: node.name,
                shortCode: node.shortCode,
                type: normalizeAccountTypeLabel(node.type) || node.type,
                depth,
                balance: Number(node.aggregateBalance ?? node.balance ?? 0),
                isLeaf: children.length === 0,
            });
        }

        return hasMatch;
    }

    roots.forEach((r) => walk(r, 0));
    return out;
}

export function buildBalanceSheet(roots) {
    const rows = flattenHierarchy(
        roots,
        (n) => ['Asset', 'Liability', 'Equity'].includes(normalizeAccountTypeLabel(n.type))
    );

    const leaves = getLeafAccounts(roots);
    const totals = {
        asset: sumByType(leaves, 'Asset'),
        liability: sumByType(leaves, 'Liability'),
        equity: sumByType(leaves, 'Equity'),
    };

    return {
        rows,
        totals,
        liabilitiesPlusEquity: totals.liability + totals.equity,
        difference: totals.asset - (totals.liability + totals.equity),
    };
}

export function buildIncomeStatement(roots) {
    const rows = flattenHierarchy(
        roots,
        (n) => ['Income', 'Expense'].includes(normalizeAccountTypeLabel(n.type))
    );

    const leaves = getLeafAccounts(roots);
    const totalIncome = sumByType(leaves, 'Income');
    const totalExpense = sumByType(leaves, 'Expense');

    return {
        rows,
        totalIncome,
        totalExpense,
        netIncome: totalIncome - totalExpense,
    };
}

export function buildAssetPieData(roots) {
    const levelsMap = new Map();
    let total = 0;

    function pushLevel(depth, node) {
        const key = depth;
        if (!levelsMap.has(key)) levelsMap.set(key, []);
        const balance = Number(node.aggregateBalance ?? node.balance ?? 0);
        if (balance <= 0) return;
        levelsMap.get(key).push({
            label: `${node.shortCode || ''} - ${node.name || ''}`.trim().replace(/^\-\s*/, ''),
            value: balance,
            shortCode: node.shortCode,
            name: node.name,
        });
    }

    function walkAssetTree(node, depth) {
        const children = node.children || [];
        children.forEach((child) => {
            pushLevel(depth + 1, child);
            walkAssetTree(child, depth + 1);
        });
    }

    function findTopAssetRoots(nodes, assetAncestorFound) {
        (nodes || []).forEach((node) => {
            const isAsset = normalizeAccountTypeLabel(node.type) === 'Asset';
            if (isAsset && !assetAncestorFound) {
                const rootBalance = Number(node.aggregateBalance ?? node.balance ?? 0);
                if (rootBalance > 0) total += rootBalance;
                pushLevel(0, node);
                walkAssetTree(node, 0);
                return;
            }
            findTopAssetRoots(node.children || [], assetAncestorFound || isAsset);
        });
    }

    findTopAssetRoots(roots, false);

    const levels = [...levelsMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([depth, slices]) => ({
            depth,
            label: depth === 0 ? 'Asset Root' : `Level ${depth}`,
            slices: slices.sort((a, b) => b.value - a.value),
            total: slices.reduce((sum, s) => sum + s.value, 0),
        }))
        .filter((l) => l.total > 0);

    return {
        levels,
        total,
    };
}

export function buildBankAccountSummaryReport({ accountCode, accounts, transactions, financialYear }) {
    const accountMap = Object.fromEntries((accounts || []).map((a) => [a.shortCode, a]));
    const account = accountMap[accountCode];
    if (!account) return null;

    const fyStart = getFinancialYearStartDate(financialYear);
    let openingBalance = Number(account.openingBalance || 0);

    const periodRows = [];
    (transactions || []).forEach((tx) => {
        const perspective = projectForAccount(tx, accountCode);
        if (!perspective) return;

        const txDate = parseDate(tx.valueDate || tx.transactionDate || '');
        const effect = perspective.depositAmount - perspective.withdrawalAmount;

        if (fyStart && txDate && txDate < fyStart) {
            openingBalance += effect;
            return;
        }

        if (financialYear && !isInFinancialYear(txDate, financialYear)) {
            return;
        }

        periodRows.push({
            tx,
            txDate,
            counterAccount: perspective.counterAccount,
            depositAmount: perspective.depositAmount,
            withdrawalAmount: perspective.withdrawalAmount,
        });
    });

    periodRows.sort((a, b) => {
        const ta = a.txDate ? a.txDate.getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.txDate ? b.txDate.getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
    });

    const depositTotal = periodRows.reduce((sum, r) => sum + r.depositAmount, 0);
    const withdrawalTotal = periodRows.reduce((sum, r) => sum + r.withdrawalAmount, 0);
    const remainingBalance = openingBalance + depositTotal - withdrawalTotal;

    return {
        account,
        financialYear: financialYear || '',
        openingBalance,
        depositTotal,
        withdrawalTotal,
        remainingBalance,
        deposits: groupBankRowsByHierarchy(periodRows, accountMap, 'depositAmount'),
        withdrawals: groupBankRowsByHierarchy(periodRows, accountMap, 'withdrawalAmount'),
    };
}

function sumByType(accounts, type) {
    return accounts
        .filter((a) => normalizeAccountTypeLabel(a.type) === type)
        .reduce((sum, a) => sum + Number(a.balance || 0), 0);
}

function projectForAccount(tx, accountCode) {
    const main = String(tx.mainAccount || '').toUpperCase();
    const target = String(tx.targetAccount || '').toUpperCase();
    const deposit = Math.abs(Number(tx.depositAmount || 0));
    const withdrawal = Math.abs(Number(tx.withdrawalAmount || 0));

    if (main === accountCode) {
        return {
            counterAccount: target,
            depositAmount: deposit,
            withdrawalAmount: withdrawal,
        };
    }

    if (target === accountCode) {
        return {
            counterAccount: main,
            depositAmount: withdrawal,
            withdrawalAmount: deposit,
        };
    }

    return null;
}

function groupBankRowsByHierarchy(rows, accountMap, amountField) {
    const groups = new Map();

    rows.forEach((row) => {
        const amount = Number(row[amountField] || 0);
        if (amount <= 0) return;

        const counter = accountMap[row.counterAccount] || {};
        const counterCode = row.counterAccount || '';
        const counterName = counter.name || counterCode || 'Unknown';
        const path = String(counter.fullAccountName || counter.name || counterCode || 'Unknown');
        const parts = path.split(':').map((p) => p.trim()).filter(Boolean);
        const topLevel = parts[0] || 'Other';
        const depth = Math.max(0, parts.length - 1);

        if (!groups.has(topLevel)) {
            groups.set(topLevel, { label: topLevel, total: 0, rows: [], counterMap: new Map() });
        }

        const group = groups.get(topLevel);
        group.total += amount;
        const rowItem = {
            shortCode: counterCode,
            name: counterName,
            path,
            depth,
            txDate: row.txDate,
            transactionDate: row.tx?.transactionDate || '',
            valueDate: row.tx?.valueDate || '',
            description: row.tx?.description || '',
            comments1: row.tx?.comments1 || '',
            comments2: row.tx?.comments2 || '',
            amount,
        };
        group.rows.push(rowItem);

        const counterKey = `${counterCode}|${path}`;
        if (!group.counterMap.has(counterKey)) {
            group.counterMap.set(counterKey, {
                shortCode: counterCode,
                name: counterName,
                path,
                depth,
                subtotal: 0,
                rows: [],
            });
        }
        const counterGroup = group.counterMap.get(counterKey);
        counterGroup.subtotal += amount;
        counterGroup.rows.push(rowItem);
    });

    return [...groups.values()]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((g) => ({
            label: g.label,
            total: g.total,
            rows: g.rows.sort((a, b) => {
                const p = a.path.localeCompare(b.path);
                if (p !== 0) return p;
                const ta = a.txDate ? a.txDate.getTime() : Number.MAX_SAFE_INTEGER;
                const tb = b.txDate ? b.txDate.getTime() : Number.MAX_SAFE_INTEGER;
                return ta - tb;
            }),
            counterGroups: [...g.counterMap.values()]
                .map((cg) => ({
                    ...cg,
                    rows: cg.rows.sort((a, b) => {
                        const ta = a.txDate ? a.txDate.getTime() : Number.MAX_SAFE_INTEGER;
                        const tb = b.txDate ? b.txDate.getTime() : Number.MAX_SAFE_INTEGER;
                        return ta - tb;
                    }),
                }))
                .sort((a, b) => {
                    const p = a.path.localeCompare(b.path);
                    if (p !== 0) return p;
                    return a.shortCode.localeCompare(b.shortCode);
                }),
        }));
}

function getFinancialYearStartDate(financialYear) {
    const key = String(financialYear || '').trim();
    const m = key.match(/^(\d{4})-(\d{4})$/);
    if (!m) return null;
    return new Date(`${m[1]}-04-01T00:00:00`);
}

function isInFinancialYear(dateObj, financialYear) {
    if (!financialYear) return true;
    if (!dateObj || Number.isNaN(dateObj.getTime())) return false;
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth() + 1;
    const start = m >= 4 ? y : y - 1;
    return `${start}-${start + 1}` === financialYear;
}

function classifyAsset(acc) {
    const text = `${acc.shortCode || ''} ${acc.name || ''} ${acc.description || ''}`.toLowerCase();

    const currentPattern = /cash|bank|saving|savings|current|receivable|debtor|inventory|stock|prepaid|wallet/;
    const nonCurrentPattern = /land|building|plant|machinery|equipment|vehicle|furniture|intangible|goodwill|investment|bond|fd|mutual/;

    if (currentPattern.test(text)) return 'Current Assets';
    if (nonCurrentPattern.test(text)) return 'Non-Current Assets';
    return 'Other Assets';
}

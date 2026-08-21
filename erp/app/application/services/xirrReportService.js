import { calculateXirr } from '../../shared/xirr.js';
import { normalizeCasDateToIso, resolveXirrTerminalDate } from '../../shared/casDates.js';
import {
    getAllHoldings,
    getAllNavSnapshots,
    getAllSchemeCodes,
    normalizeSchemeName,
} from '../../infrastructure/db/indexedDb.js';
import { getAllTransactions } from '../../infrastructure/db/transactionsIndexedDb.js';
import { enrichTransactionsWithHoldingMapping } from './transactionHoldingMapper.js';
import { classifyTransactionDirection } from '../../infrastructure/parsers/mfcCasTransactionParser.js';

function toNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function transactionGroupKey(transaction) {
    if (transaction.holdingSchemeNameNormalized) {
        return `holding::${transaction.holdingSchemeNameNormalized}`;
    }

    return `${normalizeSchemeName(transaction.amcName || '')}::${transaction.schemeNameNormalized}`;
}

function signedAmount(transaction) {
    const direction = classifyTransactionDirection(transaction.transactionType) || transaction.cashFlowDirection;
    if (direction === 'skip' || direction === 'unknown') {
        return null;
    }

    const amount = Math.abs(transaction.amount || 0);
    if (direction === 'outflow') {
        return -amount;
    }
    if (direction === 'inflow') {
        return amount;
    }
    return null;
}

function buildCashFlows(transactions, terminalValue, terminalDate) {
    const flowMap = new Map();

    transactions.forEach((transaction) => {
        const amount = signedAmount(transaction);
        const date = normalizeCasDateToIso(transaction.transactionDate);
        if (!Number.isFinite(amount) || amount === 0 || !date) {
            return;
        }
        flowMap.set(date, (flowMap.get(date) || 0) + amount);
    });

    const flows = Array.from(flowMap.entries())
        .map(([date, amount]) => ({ date, amount }))
        .filter((flow) => flow.amount !== 0);

    const hasPurchase = flows.some((flow) => flow.amount < 0);
    if (!hasPurchase) {
        return { flows: null, status: 'no_purchase' };
    }

    const normalizedTerminalDate = normalizeCasDateToIso(terminalDate);
    if (!normalizedTerminalDate) {
        return { flows: null, status: 'no_terminal_value' };
    }

    if (Number.isFinite(terminalValue) && terminalValue !== 0) {
        flows.push({
            date: normalizedTerminalDate,
            amount: terminalValue,
        });
    } else if (terminalValue === 0) {
        flows.push({
            date: normalizedTerminalDate,
            amount: 0,
        });
    } else {
        return { flows: null, status: 'no_terminal_value' };
    }

    if (flows.filter((flow) => flow.amount !== 0).length < 2) {
        return { flows: null, status: 'insufficient_flows' };
    }

    return { flows, status: 'ok' };
}

function resolveTerminalValue(holding, snapshot, lastTransactionDate) {
    const latestNav = toNumber(snapshot?.latest?.nav);
    const units = toNumber(holding?.units);

    if (units === null) {
        return { terminalValue: null, terminalDate: null, units: null, latestNav };
    }

    const terminalDate = resolveXirrTerminalDate(lastTransactionDate, snapshot?.latest?.date);

    if (units === 0) {
        return {
            terminalValue: 0,
            terminalDate,
            units,
            latestNav,
        };
    }

    if (latestNav === null) {
        return { terminalValue: null, terminalDate: null, units, latestNav };
    }

    return {
        terminalValue: latestNav * units,
        terminalDate,
        units,
        latestNav,
    };
}

function resolveHoldingLookup(group, holdingsByScheme) {
    const lookupKey = group.holdingSchemeNameNormalized || group.schemeNameNormalized;
    const holding = holdingsByScheme.get(lookupKey) || null;

    return {
        lookupKey,
        holding,
        holdingSchemeName: group.holdingSchemeName || holding?.schemeName || group.schemeName,
    };
}

export async function buildXirrReportRows() {
    const [rawTransactions, holdings, schemeCodes, navSnapshots] = await Promise.all([
        getAllTransactions(),
        getAllHoldings(),
        getAllSchemeCodes(),
        getAllNavSnapshots(),
    ]);

    const transactions = enrichTransactionsWithHoldingMapping(rawTransactions, holdings);

    const holdingsByScheme = new Map(
        holdings.map((holding) => [normalizeSchemeName(holding.schemeName), holding])
    );
    const codeByName = new Map(schemeCodes.map((item) => [item.schemeNameNormalized, item]));
    const snapshotByCode = new Map(navSnapshots.map((item) => [item.schemeCode, item]));

    const grouped = new Map();
    transactions.forEach((transaction) => {
        const key = transactionGroupKey(transaction);
        const existing = grouped.get(key) || {
            amcName: transaction.holdingAmcName || transaction.amcName || '-',
            schemeName: transaction.holdingSchemeName || transaction.schemeName,
            transactionSchemeName: transaction.schemeName,
            schemeNameNormalized: transaction.schemeNameNormalized,
            holdingSchemeName: transaction.holdingSchemeName || null,
            holdingSchemeNameNormalized: transaction.holdingSchemeNameNormalized || null,
            holdingMatchScore: transaction.holdingMatchScore || null,
            transactions: [],
        };

        if (transaction.holdingSchemeName) {
            existing.schemeName = transaction.holdingSchemeName;
            existing.holdingSchemeName = transaction.holdingSchemeName;
            existing.holdingSchemeNameNormalized = transaction.holdingSchemeNameNormalized;
            existing.holdingMatchScore = transaction.holdingMatchScore;
        }
        if (transaction.holdingAmcName) {
            existing.amcName = transaction.holdingAmcName;
        } else if ((!existing.amcName || existing.amcName === '-') && transaction.amcName) {
            existing.amcName = transaction.amcName;
        }

        existing.transactions.push(transaction);
        grouped.set(key, existing);
    });

    const importMetadata = transactions[0]?.importMetadata || {};
    const statementPeriod = importMetadata.statementPeriod || { periodFrom: null, periodTo: null };

    return Array.from(grouped.values()).map((group) => {
        const sortedTransactions = [...group.transactions].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
        const { lookupKey, holding, holdingSchemeName } = resolveHoldingLookup(group, holdingsByScheme);
        const codeItem = codeByName.get(lookupKey);
        const snapshot = codeItem ? snapshotByCode.get(codeItem.schemeCode) : null;
        const lastTransactionDate = sortedTransactions[sortedTransactions.length - 1]?.transactionDate || null;
        const terminal = resolveTerminalValue(holding, snapshot, lastTransactionDate);
        const cashFlowResult = buildCashFlows(
            sortedTransactions,
            terminal.terminalValue,
            terminal.terminalDate
        );

        const investedInFlows = sortedTransactions
            .filter((transaction) => {
                const direction = classifyTransactionDirection(transaction.transactionType) || transaction.cashFlowDirection;
                return direction === 'outflow';
            })
            .reduce((sum, transaction) => sum + Math.abs(transaction.amount || 0), 0);
        const redeemedInFlows = sortedTransactions
            .filter((transaction) => {
                const direction = classifyTransactionDirection(transaction.transactionType) || transaction.cashFlowDirection;
                return direction === 'inflow';
            })
            .reduce((sum, transaction) => sum + Math.abs(transaction.amount || 0), 0);

        const firstPurchaseDate = sortedTransactions.find((transaction) => {
            const direction = classifyTransactionDirection(transaction.transactionType) || transaction.cashFlowDirection;
            return direction === 'outflow';
        })?.transactionDate || null;

        let xirrPct = null;
        let status = cashFlowResult.status;
        if (!group.holdingSchemeNameNormalized && !holding) {
            status = 'no_holding_match';
        } else if (cashFlowResult.status === 'ok') {
            xirrPct = calculateXirr(cashFlowResult.flows);
            if (xirrPct === null) {
                status = 'xirr_failed';
            }
        }

        const periodWarning = (
            statementPeriod.periodFrom &&
            firstPurchaseDate &&
            firstPurchaseDate > statementPeriod.periodFrom
        ) ? 'First purchase in sheet may not be actual first investment (CAS period limited).' : null;

        return {
            amcName: holding?.amcName || group.amcName,
            schemeName: holdingSchemeName,
            transactionSchemeName: group.transactionSchemeName,
            schemeCode: codeItem?.schemeCode || '-',
            holdingMatchScore: group.holdingMatchScore,
            transactionCount: sortedTransactions.length,
            firstPurchaseDate,
            lastTransactionDate,
            investedInFlows,
            redeemedInFlows,
            units: terminal.units,
            latestNav: terminal.latestNav,
            currentValue: terminal.terminalValue,
            xirrPct,
            status,
            statusLabel: formatStatus(status),
            periodFrom: statementPeriod.periodFrom,
            periodTo: statementPeriod.periodTo,
            periodWarning,
        };
    }).sort((a, b) => {
        const amcCompare = a.amcName.localeCompare(b.amcName);
        if (amcCompare !== 0) {
            return amcCompare;
        }
        return a.schemeName.localeCompare(b.schemeName);
    });
}

function formatStatus(status) {
    switch (status) {
        case 'ok':
        case 'xirr_failed':
            return status === 'ok' ? 'OK' : 'XIRR could not be computed';
        case 'no_purchase':
            return 'No purchase in transaction sheet';
        case 'no_terminal_value':
            return 'Missing NAV or units for terminal value';
        case 'no_holding_match':
            return 'No matching holding in sheet 1';
        case 'insufficient_flows':
            return 'Insufficient cash flows';
        default:
            return status;
    }
}

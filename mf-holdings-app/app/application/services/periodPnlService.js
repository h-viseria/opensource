import { normalizeCasDateToIso, todayIsoDate } from '../../shared/casDates.js';
import { classifyPnlDirection } from '../../infrastructure/parsers/mfcCasTransactionParser.js';

const UNIT_EPSILON = 0.0001;

function toNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function shiftIsoDate(isoDate, { months = 0, days = 0 } = {}) {
    const normalized = normalizeCasDateToIso(isoDate);
    if (!normalized) {
        return null;
    }

    const date = new Date(`${normalized}T00:00:00Z`);
    if (months) {
        date.setUTCMonth(date.getUTCMonth() - months);
    }
    if (days) {
        date.setUTCDate(date.getUTCDate() - days);
    }
    return date.toISOString().slice(0, 10);
}

function resolveTransactionUnits(transaction) {
    const units = Math.abs(toNumber(transaction.units) || 0);
    if (units > 0) {
        return units;
    }

    const amount = Math.abs(toNumber(transaction.amount) || 0);
    const nav = toNumber(transaction.nav);
    if (amount > 0 && Number.isFinite(nav) && nav !== 0) {
        return amount / nav;
    }

    return null;
}

export function groupTransactionsByHolding(transactions) {
    const byHolding = new Map();

    (transactions || []).forEach((transaction) => {
        const key = transaction.holdingSchemeNameNormalized;
        if (!key) {
            return;
        }

        const list = byHolding.get(key) || [];
        list.push(transaction);
        byHolding.set(key, list);
    });

    return byHolding;
}

export function resolvePeriodWindow(snapshotPoint, calendarStartIso) {
    return {
        startIso: normalizeCasDateToIso(snapshotPoint?.date) || calendarStartIso || null,
        periodNav: toNumber(snapshotPoint?.nav),
    };
}

export function calendarLookbacks(latestIso) {
    const endIso = normalizeCasDateToIso(latestIso) || todayIsoDate();
    return {
        endIso,
        oneDay: shiftIsoDate(endIso, { days: 1 }),
        oneMonth: shiftIsoDate(endIso, { months: 1 }),
        threeMonth: shiftIsoDate(endIso, { months: 3 }),
        sixMonth: shiftIsoDate(endIso, { months: 6 }),
        jan1: endIso ? `${endIso.slice(0, 4)}-01-01` : null,
        oneYear: shiftIsoDate(endIso, { months: 12 }),
    };
}

/**
 * Rupee P&L for a window:
 * ending value - opening value - purchases + redemptions
 *
 * Opening units are walked back from current units using buys/sells after period start.
 * Schemes with no current units should not call this (exited holdings are excluded upstream).
 */
export function computePeriodPnl({
    currentUnits,
    latestNav,
    periodNav,
    periodStartIso,
    periodEndIso,
    transactions,
}) {
    const units = toNumber(currentUnits);
    const endNav = toNumber(latestNav);

    if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(endNav)) {
        return null;
    }

    const startIso = normalizeCasDateToIso(periodStartIso);
    const endIso = normalizeCasDateToIso(periodEndIso);
    if (!startIso || !endIso || startIso > endIso) {
        return null;
    }

    let moneyIn = 0;
    let moneyOut = 0;
    let unitsBought = 0;
    let unitsSold = 0;

    for (const transaction of transactions || []) {
        const date = normalizeCasDateToIso(transaction.transactionDate);
        if (!date || date <= startIso) {
            continue;
        }

        const direction = classifyPnlDirection(transaction.transactionType) || transaction.cashFlowDirection;
        if (direction !== 'outflow' && direction !== 'inflow') {
            continue;
        }

        const amount = Math.abs(toNumber(transaction.amount) || 0);
        const txnUnits = resolveTransactionUnits(transaction);
        if (!Number.isFinite(txnUnits)) {
            return null;
        }

        if (direction === 'outflow') {
            moneyIn += amount;
            unitsBought += txnUnits;
        } else {
            moneyOut += amount;
            unitsSold += txnUnits;
        }
    }

    const unitsStart = units - unitsBought + unitsSold;
    if (unitsStart < -UNIT_EPSILON) {
        return null;
    }

    const openingUnits = unitsStart < UNIT_EPSILON ? 0 : unitsStart;
    const resolvedPeriodNav = toNumber(periodNav);
    if (openingUnits > 0 && !Number.isFinite(resolvedPeriodNav)) {
        return null;
    }

    const openingValue = openingUnits === 0 ? 0 : openingUnits * resolvedPeriodNav;
    const endingValue = units * endNav;
    return endingValue - openingValue - moneyIn + moneyOut;
}

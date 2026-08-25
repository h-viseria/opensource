import {
    getAllHoldings,
    getAllNavSnapshots,
    getAllSchemeCodes,
    normalizeSchemeName,
} from '../../infrastructure/db/indexedDb.js';
import { getAllTransactions } from '../../infrastructure/db/transactionsIndexedDb.js';
import { enrichTransactionsWithHoldingMapping } from './transactionHoldingMapper.js';
import {
    calendarLookbacks,
    computePeriodPnl,
    groupTransactionsByHolding,
    resolvePeriodWindow,
} from './periodPnlService.js';

function deriveAmcFromSchemeName(schemeName) {
    const cleaned = String(schemeName || '').trim();
    if (!cleaned) {
        return null;
    }

    const marker = cleaned.toLowerCase().indexOf(' mutual fund');
    if (marker > 0) {
        return cleaned.slice(0, marker).trim();
    }

    const parts = cleaned.split(/\s+/).slice(0, 3).join(' ').trim();
    return parts || null;
}

function toNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function holdingPeriodPnl(holdingUnits, latestNav, snapshotPoint, calendarStartIso, endIso, transactions) {
    const window = resolvePeriodWindow(snapshotPoint, calendarStartIso);
    return computePeriodPnl({
        currentUnits: holdingUnits,
        latestNav,
        periodNav: window.periodNav,
        periodStartIso: window.startIso,
        periodEndIso: endIso,
        transactions,
    });
}

export async function buildReportRows() {
    const [holdings, schemeCodes, navSnapshots, rawTransactions] = await Promise.all([
        getAllHoldings(),
        getAllSchemeCodes(),
        getAllNavSnapshots(),
        getAllTransactions(),
    ]);

    const codeByName = new Map(schemeCodes.map((item) => [item.schemeNameNormalized, item]));
    const snapshotByCode = new Map(navSnapshots.map((item) => [item.schemeCode, item]));
    const mappedTransactions = enrichTransactionsWithHoldingMapping(rawTransactions, holdings);
    const transactionsByHolding = groupTransactionsByHolding(mappedTransactions);

    return holdings.map((holding) => {
        const codeItem = codeByName.get(normalizeSchemeName(holding.schemeName));
        const snapshot = codeItem ? snapshotByCode.get(codeItem.schemeCode) : null;

        const latestNav = toNumber(snapshot?.latest?.nav);
        const units = toNumber(holding.units) || 0;
        const investedValue = toNumber(holding.investedValue);
        const currentValue = latestNav === null ? null : latestNav * units;

        const oneDayNav = toNumber(snapshot?.prev1Day?.nav);
        const oneMonthNav = toNumber(snapshot?.oneMonth?.nav);
        const threeMonthNav = toNumber(snapshot?.threeMonth?.nav);
        const sixMonthNav = toNumber(snapshot?.sixMonth?.nav);
        const jan1Nav = toNumber(snapshot?.jan1?.nav);
        const oneYearNav = toNumber(snapshot?.oneYear?.nav);

        const lookbacks = calendarLookbacks(snapshot?.latest?.date);
        const schemeTransactions = transactionsByHolding.get(normalizeSchemeName(holding.schemeName)) || [];

        const absReturn1Day = holdingPeriodPnl(units, latestNav, snapshot?.prev1Day, lookbacks.oneDay, lookbacks.endIso, schemeTransactions);
        const absReturn1Month = holdingPeriodPnl(units, latestNav, snapshot?.oneMonth, lookbacks.oneMonth, lookbacks.endIso, schemeTransactions);
        const absReturn3Month = holdingPeriodPnl(units, latestNav, snapshot?.threeMonth, lookbacks.threeMonth, lookbacks.endIso, schemeTransactions);
        const absReturn6Month = holdingPeriodPnl(units, latestNav, snapshot?.sixMonth, lookbacks.sixMonth, lookbacks.endIso, schemeTransactions);
        const absReturnVsJan1 = holdingPeriodPnl(units, latestNav, snapshot?.jan1, lookbacks.jan1, lookbacks.endIso, schemeTransactions);
        const absReturn1Year = holdingPeriodPnl(units, latestNav, snapshot?.oneYear, lookbacks.oneYear, lookbacks.endIso, schemeTransactions);

        return {
            amcName: holding.amcName || deriveAmcFromSchemeName(codeItem?.apiSchemeName || holding.schemeName) || '-',
            schemeName: holding.schemeName,
            schemeCode: codeItem?.schemeCode || '-',
            investedValue,
            units,
            latestNav,
            currentValue,
            currentValueXls: toNumber(holding.currentValueXls),
            valueDelta: (currentValue !== null && toNumber(holding.currentValueXls) !== null)
                ? currentValue - toNumber(holding.currentValueXls)
                : null,
            valueDeltaPct: (currentValue !== null && toNumber(holding.currentValueXls) !== null && toNumber(holding.currentValueXls) !== 0)
                ? ((currentValue - toNumber(holding.currentValueXls)) / toNumber(holding.currentValueXls)) * 100
                : null,
            oneDayNav,
            oneMonthNav,
            threeMonthNav,
            sixMonthNav,
            jan1Nav,
            oneYearNav,
            pctVs1Day: toNumber(snapshot?.pctVs1Day),
            pctVs1Month: toNumber(snapshot?.pctVs1Month),
            pctVsJan1: toNumber(snapshot?.pctVsJan1),
            pctVs1Year: toNumber(snapshot?.pctVs1Year),
            absReturn1Day,
            absReturn1Month,
            absReturn3Month,
            absReturn6Month,
            absReturnVsJan1,
            absReturn1Year,
        };
    });
}

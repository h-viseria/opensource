import {
    getAllHoldings,
    getAllNavSnapshots,
    getAllSchemeCodes,
    normalizeSchemeName,
} from '../../infrastructure/db/indexedDb.js';

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

export async function buildReportRows() {
    const [holdings, schemeCodes, navSnapshots] = await Promise.all([
        getAllHoldings(),
        getAllSchemeCodes(),
        getAllNavSnapshots(),
    ]);

    const codeByName = new Map(schemeCodes.map((item) => [item.schemeNameNormalized, item]));
    const snapshotByCode = new Map(navSnapshots.map((item) => [item.schemeCode, item]));

    return holdings.map((holding) => {
        const codeItem = codeByName.get(normalizeSchemeName(holding.schemeName));
        const snapshot = codeItem ? snapshotByCode.get(codeItem.schemeCode) : null;

        const latestNav = toNumber(snapshot?.latest?.nav);
        const units = toNumber(holding.units) || 0;
        const investedValue = toNumber(holding.investedValue);
        const currentValue = latestNav === null ? null : latestNav * units;

        // Compute absolute returns for different time periods
        const oneDayNav = toNumber(snapshot?.prev1Day?.nav);
        const oneMonthNav = toNumber(snapshot?.oneMonth?.nav);
        const jan1Nav = toNumber(snapshot?.jan1?.nav);
        const oneYearNav = toNumber(snapshot?.oneYear?.nav);

        const absReturn1Day = (latestNav !== null && oneDayNav !== null) ? (latestNav - oneDayNav) * units : null;
        const absReturn1Month = (latestNav !== null && oneMonthNav !== null) ? (latestNav - oneMonthNav) * units : null;
        const absReturnVsJan1 = (latestNav !== null && jan1Nav !== null) ? (latestNav - jan1Nav) * units : null;
        const absReturn1Year = (latestNav !== null && oneYearNav !== null) ? (latestNav - oneYearNav) * units : null;

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
            jan1Nav,
            oneYearNav,
            pctVs1Day: toNumber(snapshot?.pctVs1Day),
            pctVs1Month: toNumber(snapshot?.pctVs1Month),
            pctVsJan1: toNumber(snapshot?.pctVsJan1),
            pctVs1Year: toNumber(snapshot?.pctVs1Year),
            absReturn1Day,
            absReturn1Month,
            absReturnVsJan1,
            absReturn1Year,
        };
    });
}

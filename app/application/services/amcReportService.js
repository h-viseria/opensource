function toNumber(value) {
    return Number.isFinite(value) ? value : 0;
}

export function buildAmcSummaryRows(reportRows) {
    const byAmc = new Map();

    reportRows.forEach((row) => {
        const amcName = row.amcName || '-';
        const current = byAmc.get(amcName) || {
            amcName,
            investedValue: 0,
            currentValue: 0,
            schemeCount: 0,
        };

        current.investedValue += toNumber(row.investedValue);
        current.currentValue += toNumber(row.currentValue);
        current.schemeCount += 1;

        byAmc.set(amcName, current);
    });

    return Array.from(byAmc.values()).map((row) => {
        const returnsValue = row.currentValue - row.investedValue;
        return {
            ...row,
            returnsValue,
            returnsPct: row.investedValue > 0 ? (returnsValue / row.investedValue) * 100 : null,
        };
    });
}

export function filterAmcSummaryRows(rows, filters) {
    const query = String(filters.query || '').trim().toLowerCase();
    const returnMode = filters.returnMode || 'all';
    const topN = Number(filters.topN || 0);

    let nextRows = rows.filter((row) => {
        if (query && !row.amcName.toLowerCase().includes(query)) {
            return false;
        }

        if (returnMode === 'gain' && !(row.returnsValue > 0)) {
            return false;
        }

        if (returnMode === 'loss' && !(row.returnsValue < 0)) {
            return false;
        }

        return true;
    });

    if (topN > 0) {
        nextRows = [...nextRows]
            .sort((a, b) => b.currentValue - a.currentValue)
            .slice(0, topN);
    }

    return nextRows;
}

export function buildAmcDistributionRows(rows) {
    const investedTotal = rows.reduce((sum, row) => sum + toNumber(row.investedValue), 0);
    const currentTotal = rows.reduce((sum, row) => sum + toNumber(row.currentValue), 0);
    const returnsPctAbsTotal = rows.reduce((sum, row) => sum + Math.abs(toNumber(row.returnsPct)), 0);

    return rows.map((row) => {
        const investedValue = toNumber(row.investedValue);
        const currentValue = toNumber(row.currentValue);
        const returnsPct = Number.isFinite(row.returnsPct) ? row.returnsPct : 0;
        return {
            amcName: row.amcName,
            investedValue,
            currentValue,
            returnsPct,
            investedSharePct: investedTotal > 0 ? (investedValue / investedTotal) * 100 : 0,
            currentSharePct: currentTotal > 0 ? (currentValue / currentTotal) * 100 : 0,
            returnsPctShare: returnsPctAbsTotal > 0 ? (Math.abs(returnsPct) / returnsPctAbsTotal) * 100 : 0,
        };
    });
}


import {
    fetchAmfiHistoryRows,
    fetchAmfiLatestRows,
    historyWindowAround,
    parseAmfiNavRows,
} from '../../infrastructure/api/amfiClient.js';
import {
    getAllHoldings,
    getAllSchemeCodes,
    normalizeSchemeName,
    upsertNavSnapshot,
} from '../../infrastructure/db/indexedDb.js';
import { addDaysToIsoDate, maxIsoDate, normalizeCasDateToIso } from '../../shared/casDates.js';

function parseSeriesDate(dateString) {
    const iso = normalizeCasDateToIso(dateString);
    if (!iso) {
        return null;
    }

    const [year, month, day] = iso.split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    return new Date(Date.UTC(year, month - 1, day));
}

function isoToDdMmYyyy(isoDate) {
    const iso = normalizeCasDateToIso(isoDate);
    if (!iso) {
        return null;
    }

    const [year, month, day] = iso.split('-');
    return `${day}-${month}-${year}`;
}

function monthsBefore(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, date.getUTCDate()));
}

function findOnOrBefore(series, targetDate) {
    for (const item of series) {
        if (item.dateObj <= targetDate) {
            return item;
        }
    }
    return null;
}

function pctDelta(latest, base) {
    if (!Number.isFinite(latest) || !Number.isFinite(base) || base === 0) {
        return null;
    }
    return ((latest - base) / base) * 100;
}

function buildNavSeries(historyRows) {
    return historyRows
        .map((row) => ({
            nav: Number(row.nav),
            date: row.date,
            dateObj: parseSeriesDate(row.date),
        }))
        .filter((row) => Number.isFinite(row.nav) && row.dateObj)
        .sort((a, b) => b.dateObj - a.dateObj);
}

function toSnapshot(series) {
    const latest = series[0] || null;
    if (!latest) {
        return null;
    }

    const latestDate = latest.dateObj;
    const oneDayTarget = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), latestDate.getUTCDate() - 1));
    const prev1Day = findOnOrBefore(series, oneDayTarget);
    const oneMonth = findOnOrBefore(series, monthsBefore(latestDate, 1));
    const threeMonth = findOnOrBefore(series, monthsBefore(latestDate, 3));
    const sixMonth = findOnOrBefore(series, monthsBefore(latestDate, 6));
    const jan1 = findOnOrBefore(series, new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1)));
    const oneYear = findOnOrBefore(series, monthsBefore(latestDate, 12));

    return {
        latest,
        prev1Day,
        oneMonth,
        threeMonth,
        sixMonth,
        jan1,
        oneYear,
        pctVs1Day: pctDelta(latest.nav, prev1Day?.nav),
        pctVs1Month: pctDelta(latest.nav, oneMonth?.nav),
        pctVsJan1: pctDelta(latest.nav, jan1?.nav),
        pctVs1Year: pctDelta(latest.nav, oneYear?.nav),
    };
}

function collectUniqueSchemeCodes(holdings, codeMappings) {
    const codeByName = new Map(codeMappings.map((item) => [item.schemeNameNormalized, String(item.schemeCode)]));
    const uniqueCodes = new Set();

    holdings.forEach((holding) => {
        const code = codeByName.get(normalizeSchemeName(holding.schemeName));
        if (code) {
            uniqueCodes.add(String(code));
        }
    });

    return uniqueCodes;
}

function toSeriesRow(row) {
    return {
        nav: row.nav,
        date: isoToDdMmYyyy(row.dateIso) || row.date,
        dateIso: row.dateIso,
        schemeName: row.schemeName,
    };
}

function lookbackTargets(latestIso) {
    const latestDate = parseSeriesDate(latestIso);
    if (!latestDate) {
        return [];
    }

    const jan1Iso = `${latestDate.getUTCFullYear()}-01-01`;
    const oneMonthIso = monthsBefore(latestDate, 1).toISOString().slice(0, 10);
    const threeMonthIso = monthsBefore(latestDate, 3).toISOString().slice(0, 10);
    const sixMonthIso = monthsBefore(latestDate, 6).toISOString().slice(0, 10);
    const oneYearIso = monthsBefore(latestDate, 12).toISOString().slice(0, 10);

    return [
        { label: '1 day', iso: addDaysToIsoDate(latestIso, -1) },
        { label: '1 month', iso: oneMonthIso },
        { label: '3 months', iso: threeMonthIso },
        { label: '6 months', iso: sixMonthIso },
        { label: 'YTD', iso: jan1Iso },
        { label: '1 year', iso: oneYearIso },
    ].filter((item) => item.iso);
}

export async function refreshNavSnapshotsFromAmfi({ onProgress } = {}) {
    const holdings = await getAllHoldings();
    const codeMappings = await getAllSchemeCodes();
    const uniqueCodes = collectUniqueSchemeCodes(holdings, codeMappings);

    if (uniqueCodes.size === 0) {
        return { requested: 0, successCount: 0, failures: [], source: 'amfi' };
    }

    onProgress?.('Fetching latest NAV from AMFI...');
    const latestRows = (await fetchAmfiLatestRows()).filter((row) => uniqueCodes.has(row.schemeCode));
    const latestByCode = new Map();
    latestRows.forEach((row) => {
        const existing = latestByCode.get(row.schemeCode);
        if (!existing || row.dateIso > existing.dateIso) {
            latestByCode.set(row.schemeCode, row);
        }
    });

    const seriesByCode = new Map();
    latestByCode.forEach((row, schemeCode) => {
        seriesByCode.set(schemeCode, [toSeriesRow(row)]);
    });

    const latestIso = maxIsoDate(...latestRows.map((row) => row.dateIso));
    const targets = lookbackTargets(latestIso);
    const fetchedRanges = new Set();

    for (const target of targets) {
        const window = historyWindowAround(target.iso);
        if (!window) {
            continue;
        }

        const rangeKey = `${window.fromIso}:${window.toIso}`;
        if (fetchedRanges.has(rangeKey)) {
            continue;
        }
        fetchedRanges.add(rangeKey);

        onProgress?.(`Fetching AMFI history for ${target.label} (${window.fromIso} to ${window.toIso})...`);
        try {
            const historyRows = await fetchAmfiHistoryRows(window.fromIso, window.toIso);
            mergeRowsIntoSeries(seriesByCode, historyRows, uniqueCodes);
        } catch (error) {
            onProgress?.(`AMFI history for ${target.label} failed: ${error.message}`);
        }
    }

    return saveSnapshotsFromSeries(uniqueCodes, seriesByCode, latestByCode, onProgress);
}

export async function refreshNavSnapshotsFromAmfiFiles(fileTexts, { onProgress } = {}) {
    const holdings = await getAllHoldings();
    const codeMappings = await getAllSchemeCodes();
    const uniqueCodes = collectUniqueSchemeCodes(holdings, codeMappings);

    if (uniqueCodes.size === 0) {
        return { requested: 0, successCount: 0, failures: [], source: 'amfi' };
    }

    onProgress?.('Parsing uploaded AMFI files...');
    const rows = (fileTexts || []).flatMap((text) => parseAmfiNavRows(text));
    if (!rows.length) {
        throw new Error('No NAV rows found in the uploaded AMFI files.');
    }

    const seriesByCode = new Map();
    mergeRowsIntoSeries(seriesByCode, rows, uniqueCodes);

    const latestByCode = new Map();
    seriesByCode.forEach((series, schemeCode) => {
        const newest = [...series].sort((a, b) => String(b.dateIso || b.date).localeCompare(String(a.dateIso || a.date)))[0];
        latestByCode.set(schemeCode, { schemeName: newest?.schemeName || null });
    });

    return saveSnapshotsFromSeries(uniqueCodes, seriesByCode, latestByCode, onProgress);
}

function mergeRowsIntoSeries(seriesByCode, rows, uniqueCodes) {
    rows.forEach((row) => {
        if (uniqueCodes && !uniqueCodes.has(row.schemeCode)) {
            return;
        }

        const series = seriesByCode.get(row.schemeCode) || [];
        const converted = toSeriesRow(row);
        if (!series.some((item) => item.date === converted.date)) {
            series.push(converted);
            seriesByCode.set(row.schemeCode, series);
        }
    });
}

async function saveSnapshotsFromSeries(uniqueCodes, seriesByCode, latestByCode, onProgress) {
    let successCount = 0;
    const failures = [];

    onProgress?.('Saving AMFI NAV snapshots...');
    for (const schemeCode of uniqueCodes) {
        try {
            const series = seriesByCode.get(schemeCode);
            if (!series?.length) {
                throw new Error('Scheme not found in AMFI NAV data.');
            }

            const snapshot = toSnapshot(buildNavSeries(series));
            if (!snapshot) {
                throw new Error('Empty NAV history.');
            }

            const apiSchemeName = latestByCode.get(schemeCode)?.schemeName || series[0]?.schemeName || null;
            await upsertNavSnapshot({
                schemeCode,
                apiSchemeName,
                source: 'amfi',
                ...snapshot,
                updatedAt: new Date().toISOString(),
            });
            successCount += 1;
        } catch (error) {
            failures.push({ schemeCode, reason: error.message });
        }
    }

    return {
        requested: uniqueCodes.size,
        successCount,
        failures,
        source: 'amfi',
    };
}

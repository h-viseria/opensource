import { parseAmfiNavRows } from '../../infrastructure/api/amfiClient.js';
import {
    getAllHoldings,
    getAllNavSnapshots,
    getAllSchemeCodes,
    normalizeSchemeName,
    upsertNavSnapshot,
} from '../../infrastructure/db/indexedDb.js';
import { normalizeCasDateToIso } from '../../shared/casDates.js';

const SNAPSHOT_POINT_KEYS = ['latest', 'prev1Day', 'oneMonth', 'threeMonth', 'sixMonth', 'jan1', 'oneYear'];

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
            dateIso: row.dateIso || normalizeCasDateToIso(row.date),
            dateObj: parseSeriesDate(row.dateIso || row.date),
            schemeName: row.schemeName,
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

export function snapshotPointsToSeries(snapshot) {
    const byIso = new Map();

    SNAPSHOT_POINT_KEYS.forEach((key) => {
        const point = snapshot?.[key];
        const iso = normalizeCasDateToIso(point?.date);
        const nav = Number(point?.nav);
        if (!iso || !Number.isFinite(nav)) {
            return;
        }
        if (!byIso.has(iso)) {
            byIso.set(iso, {
                nav,
                date: isoToDdMmYyyy(iso) || point.date,
                dateIso: iso,
                schemeName: snapshot.apiSchemeName || null,
            });
        }
    });

    return Array.from(byIso.values());
}

export function mergeMissingNavDates(existingSeries, amfiRows) {
    const byIso = new Map();
    (existingSeries || []).forEach((row) => {
        const iso = row.dateIso || normalizeCasDateToIso(row.date);
        if (!iso || byIso.has(iso)) {
            return;
        }
        byIso.set(iso, {
            nav: Number(row.nav),
            date: isoToDdMmYyyy(iso) || row.date,
            dateIso: iso,
            schemeName: row.schemeName || null,
        });
    });

    let added = 0;
    (amfiRows || []).forEach((row) => {
        const iso = row.dateIso || normalizeCasDateToIso(row.date);
        if (!iso || byIso.has(iso) || !Number.isFinite(Number(row.nav))) {
            return;
        }
        byIso.set(iso, {
            nav: Number(row.nav),
            date: isoToDdMmYyyy(iso) || row.date,
            dateIso: iso,
            schemeName: row.schemeName || null,
        });
        added += 1;
    });

    return {
        series: Array.from(byIso.values()),
        added,
    };
}

export async function refreshNavSnapshotsFromAmfiFiles(fileTexts, { onProgress } = {}) {
    const holdings = await getAllHoldings();
    const codeMappings = await getAllSchemeCodes();
    const existingSnapshots = await getAllNavSnapshots();
    const uniqueCodes = collectUniqueSchemeCodes(holdings, codeMappings);

    if (uniqueCodes.size === 0) {
        return { requested: 0, successCount: 0, unchangedCount: 0, datesAdded: 0, failures: [], source: 'amfi' };
    }

    onProgress?.('Parsing AMFI last-week file...');
    const rows = (fileTexts || []).flatMap((text) => parseAmfiNavRows(text));
    if (!rows.length) {
        throw new Error('No NAV rows found in the uploaded AMFI file.');
    }

    const amfiByCode = new Map();
    rows.forEach((row) => {
        if (!uniqueCodes.has(row.schemeCode)) {
            return;
        }
        const list = amfiByCode.get(row.schemeCode) || [];
        list.push(row);
        amfiByCode.set(row.schemeCode, list);
    });

    if (amfiByCode.size === 0) {
        throw new Error('Uploaded AMFI file has no rows matching mapped scheme codes.');
    }

    const existingByCode = new Map(
        existingSnapshots.map((item) => [String(item.schemeCode), item])
    );

    let successCount = 0;
    let unchangedCount = 0;
    let datesAdded = 0;
    const failures = [];

    onProgress?.('Merging missing AMFI dates into existing NAV snapshots...');
    for (const [schemeCode, amfiRows] of amfiByCode.entries()) {
        try {
            const existing = existingByCode.get(schemeCode) || null;
            const merged = mergeMissingNavDates(snapshotPointsToSeries(existing), amfiRows);
            if (merged.added === 0) {
                unchangedCount += 1;
                continue;
            }

            const snapshot = toSnapshot(buildNavSeries(merged.series));
            if (!snapshot) {
                throw new Error('Empty NAV history after merge.');
            }

            await upsertNavSnapshot({
                ...existing,
                schemeCode: existing?.schemeCode || schemeCode,
                apiSchemeName: existing?.apiSchemeName || amfiRows[0]?.schemeName || null,
                ...snapshot,
                source: existing ? existing.source || 'mfapi' : 'amfi',
                updatedAt: new Date().toISOString(),
            });
            successCount += 1;
            datesAdded += merged.added;
        } catch (error) {
            failures.push({ schemeCode, reason: error.message });
        }
    }

    return {
        requested: amfiByCode.size,
        successCount,
        unchangedCount,
        datesAdded,
        failures,
        source: 'amfi',
    };
}

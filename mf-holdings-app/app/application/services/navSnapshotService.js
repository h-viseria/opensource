import { fetchSchemeHistory } from '../../infrastructure/api/mfApiClient.js';
import {
    getAllHoldings,
    getAllSchemeCodes,
    normalizeSchemeName,
    upsertNavSnapshot,
} from '../../infrastructure/db/indexedDb.js';

function parseMfApiDate(dateString) {
    const [day, month, year] = String(dateString || '').split('-').map(Number);
    if (!day || !month || !year) {
        return null;
    }
    return new Date(Date.UTC(year, month - 1, day));
}

function buildNavSeries(historyRows) {
    return historyRows
        .map((row) => ({
            nav: Number(row.nav),
            date: row.date,
            dateObj: parseMfApiDate(row.date),
        }))
        .filter((row) => Number.isFinite(row.nav) && row.dateObj)
        .sort((a, b) => b.dateObj - a.dateObj);
}

function findOnOrBefore(series, targetDate) {
    for (const item of series) {
        if (item.dateObj <= targetDate) {
            return item;
        }
    }
    return null;
}

async function fetchHistoryWithRetry(schemeCode, retries = 2) {
    let attempt = 0;
    let lastError = null;

    while (attempt <= retries) {
        try {
            return await fetchSchemeHistory(schemeCode);
        } catch (error) {
            lastError = error;
            attempt += 1;
            if (attempt > retries) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
    }

    throw lastError;
}

function pctDelta(latest, base) {
    if (!Number.isFinite(latest) || !Number.isFinite(base) || base === 0) {
        return null;
    }
    return ((latest - base) / base) * 100;
}

function monthsBefore(date, months) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, date.getUTCDate()));
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

export async function refreshNavSnapshots() {
    const holdings = await getAllHoldings();
    const codeMappings = await getAllSchemeCodes();
    const codeByName = new Map(codeMappings.map((item) => [item.schemeNameNormalized, item.schemeCode]));

    const uniqueCodes = new Set();
    holdings.forEach((holding) => {
        const code = codeByName.get(normalizeSchemeName(holding.schemeName));
        if (code) {
            uniqueCodes.add(code);
        }
    });

    let successCount = 0;
    const failures = [];

    for (const schemeCode of uniqueCodes) {
        try {
            const history = await fetchHistoryWithRetry(schemeCode);
            const snapshot = toSnapshot(buildNavSeries(history.data));
            if (!snapshot) {
                throw new Error('Empty NAV history.');
            }

            await upsertNavSnapshot({
                schemeCode,
                apiSchemeName: history.schemeName,
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
    };
}


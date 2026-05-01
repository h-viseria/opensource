import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { parseMfcCasWorkbook } from '../app/infrastructure/parsers/mfcCasParser.js';
import { fetchAllSchemes, fetchSchemeHistory } from '../app/infrastructure/api/mfApiClient.js';
import { normalizeSchemeName } from '../app/infrastructure/db/indexedDb.js';
import {
    getPlanVariant,
    isVariantCompatible,
    normalizeSchemeNameForMatch,
    scoreSchemeCandidate,
    tokenizeSchemeName,
} from '../app/application/services/schemeMatcher.js';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const defaultPortfolioPath = 'C:/Users/Hitesh.Viseria/Downloads/cas_detailed_report_2026_04_29_094624.xlsx';
const portfolioPath = process.argv[2] || defaultPortfolioPath;

// ---------------------------------------------------------------------------
// Manual scheme code overrides: fixes known cases where the fuzzy matcher
// picks the wrong code (e.g. "Large Cap" → "Large & Mid Cap", Regular→Direct).
// Keys are normalizeSchemeName() output of the CAS scheme name.
// ---------------------------------------------------------------------------
const MANUAL_SCHEME_CODE_OVERRIDES = new Map([
    // ABSL Large Cap Fund (regular) was being confused with Large & Mid Cap Fund
    ['aditya birla sun life large cap fund growth regular plan', '103174'],
    // DSP Mid Cap Fund regular was being confused with Large & Mid Cap Fund
    ['dsp mid cap fund regular plan growth', '104481'],
    // Axis Mid Cap Fund regular was being confused with Large & Mid Cap Fund
    ['axis mid cap fund regular growth', '114564'],
    // Franklin Large & Mid Cap IDCW Regular (not Direct)
    ['franklin india large and mid cap fund idcw', '102884'],
    // Kotak Bond Short Term Growth – "(Short Term)" stripped by normalisation so
    // matcher picked full-duration Kotak Bond Fund instead
    ['kotak bond fund growth', '101373'],
    // Nippon India schemes: all Regular plans that matcher incorrectly sent to Direct
    ['nippon india growth mid cap fund idcw plan', '100375'],
    ['nippon india banking financial services fund growth plan', '101862'],
    ['nippon india pharma fund growth plan', '102431'],
    ['nippon india vision large mid cap fund idcw plan', '100378'],
]);

// Schemes that are unclaimed-IDCW / investor-education placeholder accounts.
// They don't have a live NAV to compare against – use XLS value as the truth.
const SKIP_NAV_SCHEMES = new Set([
    'aditya birla sun life unclaimed idcw',          // ABSL Unclaimed IDCW (After 3 years)
    'franklin india overnight fund unclaimed idcw investor education direct plan growth',
]);

function toNumber(value) {
    const cleaned = String(value ?? '')
        .replace(/,/g, '')
        .replace(/[^0-9.-]/g, '')
        .trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
}

function normalizeHeader(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function findHeaderIndex(headers, candidates) {
    for (let i = 0; i < headers.length; i += 1) {
        if (candidates.some((candidate) => headers[i].includes(candidate))) {
            return i;
        }
    }
    return -1;
}

function pickHeaderRow(rows) {
    const maxScan = Math.min(rows.length, 120);
    for (let i = 0; i < maxScan; i += 1) {
        const headerText = rows[i].map(normalizeHeader).join(' ');
        if (headerText.includes('scheme') && headerText.includes('current value')) {
            return i;
        }
    }
    return 0;
}

function looksLikeSummaryRow(name) {
    const key = normalizeSchemeName(name);
    return (
        !key ||
        key.includes('total') ||
        key.includes('grand total') ||
        key.includes('sub total') ||
        key.includes('opening balance') ||
        key.includes('closing balance') ||
        key.includes('valuation')
    );
}

function readCurrentValueByScheme(workbookBuffer) {
    const workbook = XLSX.read(workbookBuffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
        throw new Error('No sheet found in portfolio file.');
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
        header: 1,
        defval: '',
        raw: false,
    });

    const headerRowIndex = pickHeaderRow(rows);
    const headers = rows[headerRowIndex].map(normalizeHeader);
    const schemeNameIndex = findHeaderIndex(headers, ['scheme name', 'scheme']);
    const currentValueIndex = findHeaderIndex(headers, ['current value', 'market value']);
    const unitsIndex = findHeaderIndex(headers, ['units', 'unit balance', 'balance units']);

    if (schemeNameIndex === -1 || currentValueIndex === -1) {
        throw new Error('Could not identify Scheme Name and Current Value columns in portfolio file.');
    }

    const byScheme = new Map();
    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        const row = rows[i];
        const schemeName = String(row[schemeNameIndex] || '').trim();
        if (!schemeName || looksLikeSummaryRow(schemeName)) {
            continue;
        }

        if (unitsIndex !== -1) {
            const units = toNumber(row[unitsIndex]);
            if (!Number.isFinite(units) || units <= 0) {
                continue;
            }
        }

        const currentValue = toNumber(row[currentValueIndex]);
        const key = normalizeSchemeName(schemeName);
        const existing = byScheme.get(key) || { schemeName, currentValue: 0, currentValueKnown: false };
        if (Number.isFinite(currentValue)) {
            existing.currentValue += currentValue;
            existing.currentValueKnown = true;
        }
        byScheme.set(key, existing);
    }

    return byScheme;
}

function countTokenOverlap(tokensA, tokensB) {
    const setB = new Set(tokensB);
    let count = 0;
    tokensA.forEach((token) => {
        if (setB.has(token)) {
            count += 1;
        }
    });
    return count;
}

function isBetterCandidate(current, next) {
    if (!current) {
        return true;
    }
    if (next.score !== current.score) {
        return next.score > current.score;
    }
    if (next.contains !== current.contains) {
        return next.contains > current.contains;
    }
    if (next.overlap !== current.overlap) {
        return next.overlap > current.overlap;
    }
    if (next.lengthDistance !== current.lengthDistance) {
        return next.lengthDistance < current.lengthDistance;
    }
    return next.normalized < current.normalized;
}

function findBestMatch(holding, master) {
    const targetName = normalizeSchemeNameForMatch(holding.schemeName);
    const targetTokens = tokenizeSchemeName(holding.schemeName);
    const targetVariant = getPlanVariant(targetName);

    const compatibleCandidates = master.filter((candidate) =>
        isVariantCompatible(targetVariant, getPlanVariant(candidate.normalized))
    );
    const candidatesToScore = compatibleCandidates.length > 0 ? compatibleCandidates : master;

    let best = null;
    let bestRank = null;

    for (const candidate of candidatesToScore) {
        const score = scoreSchemeCandidate(targetName, targetTokens, candidate.normalized, candidate.tokens);
        if (score < 0.5) {
            continue;
        }

        const nextRank = {
            score,
            contains: targetName.includes(candidate.normalized) || candidate.normalized.includes(targetName) ? 1 : 0,
            overlap: countTokenOverlap(targetTokens, candidate.tokens),
            lengthDistance: Math.abs(targetTokens.length - candidate.tokens.length),
            normalized: candidate.normalized,
        };

        if (isBetterCandidate(bestRank, nextRank)) {
            best = candidate;
            bestRank = nextRank;
        }
    }

    return best && bestRank && bestRank.score >= 0.58 ? { best, score: bestRank.score } : null;
}

function parseMfApiDate(dateString) {
    const [day, month, year] = String(dateString || '').split('-').map(Number);
    if (!day || !month || !year) {
        return null;
    }
    return new Date(Date.UTC(year, month - 1, day));
}

function getLatestNav(historyRows) {
    const latest = historyRows
        .map((row) => ({ nav: Number(row.nav), dateObj: parseMfApiDate(row.date) }))
        .filter((row) => Number.isFinite(row.nav) && row.dateObj)
        .sort((a, b) => b.dateObj - a.dateObj)[0] || null;

    return latest ? latest.nav : null;
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

function formatNumber(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '';
}

async function main() {
    const workbookBuffer = readFileSync(portfolioPath);
    const parsed = parseMfcCasWorkbook(workbookBuffer, { xlsxLib: XLSX, withDiagnostics: true });
    const holdings = parsed.holdings;
    const casCurrentByScheme = readCurrentValueByScheme(workbookBuffer);

    const schemeMaster = (await fetchAllSchemes())
        .map((item) => ({
            schemeCode: String(item.schemeCode),
            schemeName: item.schemeName,
            normalized: normalizeSchemeNameForMatch(item.schemeName),
            tokens: tokenizeSchemeName(item.schemeName),
        }))
        .sort((a, b) => a.normalized.localeCompare(b.normalized));

    const mapped = [];
    const unmatched = [];
    const skipped = [];

    for (const holding of holdings) {
        const normalizedName = normalizeSchemeName(holding.schemeName);
        const sourceCurrent = casCurrentByScheme.get(normalizedName);

        // Unclaimed IDCW / investor education accounts – no live NAV, skip NAV comparison
        if (SKIP_NAV_SCHEMES.has(normalizedName)) {
            skipped.push({
                ...holding,
                schemeCode: 'N/A',
                apiSchemeName: '(unclaimed / placeholder – no NAV)',
                matchScore: null,
                sourceCurrentValue: sourceCurrent?.currentValueKnown ? sourceCurrent.currentValue : null,
                latestNav: null,
                appCurrentValue: null,
                delta: null,
                deltaPct: null,
                skipReason: 'unclaimed-idcw',
            });
            continue;
        }

        // Manual override: known incorrect fuzzy mappings
        const overrideCode = MANUAL_SCHEME_CODE_OVERRIDES.get(normalizedName);
        let schemeCode, apiSchemeName, matchScore;
        if (overrideCode) {
            const overrideMasterEntry = schemeMaster.find(item => item.schemeCode === overrideCode);
            schemeCode = overrideCode;
            apiSchemeName = overrideMasterEntry?.schemeName || '(override – name not in master)';
            matchScore = 1.0; // manually verified
        } else {
            const match = findBestMatch(holding, schemeMaster);
            if (!match) {
                unmatched.push(holding.schemeName);
                continue;
            }
            schemeCode = match.best.schemeCode;
            apiSchemeName = match.best.schemeName;
            matchScore = match.score;
        }

        mapped.push({
            ...holding,
            schemeCode,
            apiSchemeName,
            matchScore,
            sourceCurrentValue: sourceCurrent?.currentValueKnown ? sourceCurrent.currentValue : null,
        });
    }

    const navCache = new Map();
    let navFailures = 0;
    for (const item of mapped) {
        if (!navCache.has(item.schemeCode)) {
            try {
                const history = await fetchHistoryWithRetry(item.schemeCode);
                navCache.set(item.schemeCode, {
                    latestNav: getLatestNav(history.data),
                    apiSchemeName: history.schemeName,
                });
            } catch (error) {
                navCache.set(item.schemeCode, { latestNav: null, error: error.message });
                navFailures += 1;
            }
        }

        const navInfo = navCache.get(item.schemeCode);
        item.latestNav = Number.isFinite(navInfo.latestNav) ? navInfo.latestNav : null;
        item.appCurrentValue = Number.isFinite(item.latestNav) ? item.latestNav * item.units : null;
        item.delta = Number.isFinite(item.sourceCurrentValue) && Number.isFinite(item.appCurrentValue)
            ? item.appCurrentValue - item.sourceCurrentValue
            : null;
        item.deltaPct = Number.isFinite(item.sourceCurrentValue) && item.sourceCurrentValue !== 0 && Number.isFinite(item.delta)
            ? (item.delta / item.sourceCurrentValue) * 100
            : null;
        if (navInfo.apiSchemeName) {
            item.apiSchemeName = navInfo.apiSchemeName;
        }
    }

    const comparableRows = mapped.filter((item) => Number.isFinite(item.sourceCurrentValue) && Number.isFinite(item.appCurrentValue));
    const totalSource = comparableRows.reduce((sum, item) => sum + item.sourceCurrentValue, 0);
    const totalApp = comparableRows.reduce((sum, item) => sum + item.appCurrentValue, 0);
    const totalDelta = totalApp - totalSource;

    const sortedByAbsDelta = [...comparableRows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const outputDir = path.join(rootDir, 'tests', 'output');
    mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputCsv = path.join(outputDir, `portfolio-compare-${stamp}.csv`);

    const csvHeader = [
        'Scheme Name',
        'AMC Name',
        'Scheme Code',
        'Mapped Scheme Name (MFAPI)',
        'Match Score',
        'Units',
        'Source Current Value (XLS)',
        'App Latest NAV',
        'App Current Value',
        'Delta (App - XLS)',
        'Delta %',
    ];

    const csvRows = [csvHeader.join(',')];
    for (const item of sortedByAbsDelta) {
        csvRows.push([
            JSON.stringify(item.schemeName),
            JSON.stringify(item.amcName || ''),
            JSON.stringify(item.schemeCode),
            JSON.stringify(item.apiSchemeName || ''),
            formatNumber(item.matchScore),
            formatNumber(item.units),
            formatNumber(item.sourceCurrentValue),
            formatNumber(item.latestNav),
            formatNumber(item.appCurrentValue),
            formatNumber(item.delta),
            formatNumber(item.deltaPct),
        ].join(','));
    }
    // Append skipped rows at the bottom
    for (const item of skipped) {
        csvRows.push([
            JSON.stringify(item.schemeName),
            JSON.stringify(item.amcName || ''),
            JSON.stringify('N/A'),
            JSON.stringify(item.apiSchemeName || ''),
            '',
            formatNumber(item.units),
            formatNumber(item.sourceCurrentValue),
            '',
            '',
            '',
            '',
        ].join(','));
    }
    writeFileSync(outputCsv, csvRows.join('\n'));

    console.log(`Portfolio file: ${portfolioPath}`);
    console.log(`CAS parser diagnostics: ${JSON.stringify(parsed.diagnostics)}`);
    console.log(`Holdings parsed: ${holdings.length}`);
    console.log(`Mapped schemes: ${mapped.length}`);
    console.log(`Skipped (unclaimed/placeholder): ${skipped.length}`);
    console.log(`Unmatched schemes: ${unmatched.length}`);
    console.log(`NAV fetch failures: ${navFailures}`);
    console.log(`Comparable rows (XLS current value + NAV): ${comparableRows.length}`);
    console.log(`Total Current Value in XLS: ${formatNumber(totalSource)}`);
    console.log(`Total Current Value via MFAPI NAV: ${formatNumber(totalApp)}`);
    console.log(`Total Delta (MFAPI - XLS): ${formatNumber(totalDelta)} (${formatNumber(totalSource ? (totalDelta / totalSource) * 100 : null)}%)`);

    if (skipped.length) {
        console.log('\nSkipped schemes (XLS value used, no NAV comparison):');
        skipped.forEach(s => console.log(`  - ${s.schemeName} | XLS current=${formatNumber(s.sourceCurrentValue)}`));
    }

    if (unmatched.length) {
        console.log('\nUnmatched sample:');
        unmatched.slice(0, 12).forEach((name) => console.log(`- ${name}`));
    }

    console.log('Top 10 absolute deltas:');
    sortedByAbsDelta.slice(0, 10).forEach((item, index) => {
        console.log(
            `${index + 1}. ${item.schemeName} | code=${item.schemeCode} | XLS=${formatNumber(item.sourceCurrentValue)} | APP=${formatNumber(item.appCurrentValue)} | delta=${formatNumber(item.delta)} (${formatNumber(item.deltaPct)}%)`
        );
    });

    console.log(`Detailed comparison CSV: ${outputCsv}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});


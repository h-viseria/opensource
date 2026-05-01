import { readFileSync } from 'node:fs';
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
const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'cas_detailed_report_2026_04_25_113826.xlsx');

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

    return best && bestRank && bestRank.score >= 0.58 ? { best, bestScore: bestRank.score } : null;
}

async function main() {
    const fixtureBuffer = readFileSync(fixturePath);
    const { holdings, diagnostics } = parseMfcCasWorkbook(fixtureBuffer, {
        xlsxLib: XLSX,
        withDiagnostics: true,
    });

    const schemeMasterRaw = await fetchAllSchemes();
    const schemeMaster = schemeMasterRaw.map((item) => ({
        schemeCode: String(item.schemeCode),
        schemeName: item.schemeName,
        normalized: normalizeSchemeNameForMatch(item.schemeName),
        tokens: tokenizeSchemeName(item.schemeName),
    })).sort((a, b) => a.normalized.localeCompare(b.normalized));

    const mapped = [];
    const unmatched = [];

    holdings.forEach((holding) => {
        const match = findBestMatch(holding, schemeMaster);
        if (!match) {
            unmatched.push(holding.schemeName);
            return;
        }
        mapped.push({
            ...holding,
            schemeCode: match.best.schemeCode,
            apiSchemeName: match.best.schemeName,
            score: match.bestScore,
        });
    });

    let navSuccess = 0;
    let navFail = 0;
    for (const item of mapped) {
        try {
            const history = await fetchSchemeHistory(item.schemeCode);
            if (history.data?.length) {
                navSuccess += 1;
            } else {
                navFail += 1;
            }
        } catch {
            navFail += 1;
        }
    }

    console.log('CAS diagnostics:', diagnostics);
    console.log(`Holdings parsed: ${holdings.length}`);
    console.log(`Scheme codes mapped: ${mapped.length}`);
    console.log(`NAV success: ${navSuccess}`);
    console.log(`NAV failed: ${navFail}`);
    if (unmatched.length) {
        console.log('Unmatched sample (top 15):');
        unmatched.slice(0, 15).forEach((name) => console.log(`- ${name}`));
    }

    const hsbcHolding = mapped.find((item) => item.schemeName.toLowerCase().includes('hsbc arbitrage fund'));
    if (hsbcHolding) {
        const mappedName = String(hsbcHolding.apiSchemeName || '').toLowerCase();
        if (mappedName.includes('regular') || !mappedName.includes('direct')) {
            throw new Error(`Regression: HSBC arbitrage mapped to wrong plan -> ${hsbcHolding.apiSchemeName}`);
        }
    }

    const iciciDividendYieldHolding = mapped.find((item) => item.schemeName.toLowerCase().includes('icici prudential dividend yield equity fund'));
    if (iciciDividendYieldHolding) {
        const mappedName = String(iciciDividendYieldHolding.apiSchemeName || '').toLowerCase();
        if (mappedName.includes('regular') || !mappedName.includes('growth')) {
            throw new Error(`Regression: ICICI Dividend Yield mapped to wrong plan -> ${iciciDividendYieldHolding.apiSchemeName}`);
        }
    }

    if (mapped.length < 60) {
        throw new Error(`Regression: expected at least 60 mapped schemes, got ${mapped.length}.`);
    }

    if (navSuccess < 45) {
        throw new Error(`Regression: expected at least 45 NAV responses, got ${navSuccess}.`);
    }
}

main();


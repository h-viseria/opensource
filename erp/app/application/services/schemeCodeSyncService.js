import { fetchAllSchemes } from '../../infrastructure/api/mfApiClient.js';
import { getAllHoldings, normalizeSchemeName, upsertSchemeCode } from '../../infrastructure/db/indexedDb.js';
import { getPlanVariant, isVariantCompatible, normalizeSchemeNameForMatch, scoreSchemeCandidate, tokenizeSchemeName } from './schemeMatcher.js';

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

export async function syncSchemeCodes() {
    const holdings = await getAllHoldings();
    if (!holdings.length) {
        return { mapped: 0, unmatched: [] };
    }

    const schemeMaster = await fetchAllSchemes();
    const masterNormalized = schemeMaster.map((item) => ({
        schemeCode: String(item.schemeCode),
        schemeName: item.schemeName,
        normalized: normalizeSchemeNameForMatch(item.schemeName),
        tokens: tokenizeSchemeName(item.schemeName),
    })).sort((a, b) => a.normalized.localeCompare(b.normalized));

    let mapped = 0;
    const unmatched = [];

    for (const holding of holdings) {
        const targetName = normalizeSchemeNameForMatch(holding.schemeName);
        const targetTokens = tokenizeSchemeName(holding.schemeName);
        const targetVariant = getPlanVariant(targetName);
        const schemeNameNormalized = normalizeSchemeName(holding.schemeName);

        const compatibleCandidates = masterNormalized.filter((candidate) =>
            isVariantCompatible(targetVariant, getPlanVariant(candidate.normalized))
        );
        const candidatesToScore = compatibleCandidates.length > 0 ? compatibleCandidates : masterNormalized;

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
                bestRank = nextRank;
                best = candidate;
            }
        }

        if (!best || !bestRank || bestRank.score < 0.58) {
            unmatched.push(holding.schemeName);
            continue;
        }

        await upsertSchemeCode({
            schemeNameNormalized,
            originalSchemeName: holding.schemeName,
            schemeCode: best.schemeCode,
            apiSchemeName: best.schemeName,
            score: bestRank.score,
            updatedAt: new Date().toISOString(),
        });
        mapped += 1;
    }

    return { mapped, unmatched };
}


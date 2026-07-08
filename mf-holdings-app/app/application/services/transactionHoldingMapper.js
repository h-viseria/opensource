import { normalizeSchemeName } from '../../infrastructure/db/indexedDb.js';
import {
    getPlanVariant,
    isVariantCompatible,
    normalizeSchemeNameForMatch,
    scoreSchemeCandidate,
    tokenizeSchemeName,
} from './schemeMatcher.js';

const MATCH_THRESHOLD = 0.58;

function normalizeAmcName(value) {
    return normalizeSchemeName(value || '');
}

function amcNamesCompatible(transactionAmc, holdingAmc) {
    const txAmc = normalizeAmcName(transactionAmc);
    const holdAmc = normalizeAmcName(holdingAmc);

    if (!txAmc || !holdAmc) {
        return true;
    }

    if (txAmc === holdAmc || txAmc.includes(holdAmc) || holdAmc.includes(txAmc)) {
        return true;
    }

    const txTokens = txAmc.split(' ').filter((token) => token.length > 2);
    const holdTokens = holdAmc.split(' ').filter((token) => token.length > 2);
    const holdSet = new Set(holdTokens);

    let overlap = 0;
    txTokens.forEach((token) => {
        if (holdSet.has(token)) {
            overlap += 1;
        }
    });

    return overlap >= 2 || (txTokens.length === 1 && holdSet.has(txTokens[0]));
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

export function findHoldingForTransaction(transactionSchemeName, transactionAmcName, holdings) {
    if (!transactionSchemeName || !holdings.length) {
        return null;
    }

    const exactKey = normalizeSchemeName(transactionSchemeName);
    const exactHolding = holdings.find((holding) => normalizeSchemeName(holding.schemeName) === exactKey);
    if (exactHolding) {
        return {
            holding: exactHolding,
            score: 1,
            matchType: 'exact',
        };
    }

    const targetName = normalizeSchemeNameForMatch(transactionSchemeName);
    const targetTokens = tokenizeSchemeName(transactionSchemeName);
    const targetVariant = getPlanVariant(targetName);

    const eligibleHoldings = holdings.filter((holding) =>
        amcNamesCompatible(transactionAmcName, holding.amcName)
    );
    const candidates = eligibleHoldings.length > 0 ? eligibleHoldings : holdings;

    let bestHolding = null;
    let bestRank = null;

    for (const holding of candidates) {
        const candidateName = normalizeSchemeNameForMatch(holding.schemeName);
        const candidateTokens = tokenizeSchemeName(holding.schemeName);
        const candidateVariant = getPlanVariant(candidateName);

        if (!isVariantCompatible(targetVariant, candidateVariant)) {
            continue;
        }

        const score = scoreSchemeCandidate(targetName, targetTokens, candidateName, candidateTokens);
        if (score < 0.5) {
            continue;
        }

        const nextRank = {
            score,
            contains: targetName.includes(candidateName) || candidateName.includes(targetName) ? 1 : 0,
            overlap: countTokenOverlap(targetTokens, candidateTokens),
            lengthDistance: Math.abs(targetTokens.length - candidateTokens.length),
            normalized: candidateName,
        };

        if (isBetterCandidate(bestRank, nextRank)) {
            bestRank = nextRank;
            bestHolding = holding;
        }
    }

    if (!bestHolding || !bestRank || bestRank.score < MATCH_THRESHOLD) {
        return null;
    }

    return {
        holding: bestHolding,
        score: bestRank.score,
        matchType: 'fuzzy',
    };
}

export function enrichTransactionsWithHoldingMapping(transactions, holdings) {
    const cache = new Map();

    return transactions.map((transaction) => {
        const cacheKey = `${normalizeAmcName(transaction.amcName)}::${transaction.schemeNameNormalized}`;
        let match = cache.get(cacheKey);

        if (match === undefined) {
            match = findHoldingForTransaction(transaction.schemeName, transaction.amcName, holdings);
            cache.set(cacheKey, match);
        }

        if (!match?.holding) {
            return transaction;
        }

        return {
            ...transaction,
            holdingSchemeName: match.holding.schemeName,
            holdingSchemeNameNormalized: normalizeSchemeName(match.holding.schemeName),
            holdingAmcName: match.holding.amcName || transaction.amcName || null,
            holdingMatchScore: match.score,
            holdingMatchType: match.matchType,
        };
    });
}

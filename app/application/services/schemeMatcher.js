
const STOP_WORDS = new Set([
    'plan',
    'direct',
    'regular',
    'growth',
    'idcw',
    'dividend',
    'option',
    'payout',
    'reinvestment',
    'fund',
    'scheme',
    'bonus',
    'the',
    'formerly',
    'known',
    'as',
    'old',
    'new',
]);

export function normalizeSchemeNameForMatch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function tokenizeSchemeName(value) {
    return normalizeSchemeNameForMatch(value)
        .split(' ')
        .filter((token) => token && !STOP_WORDS.has(token));
}

export function getPlanVariant(name) {
    const normalized = normalizeSchemeNameForMatch(name);

    const hasDividendOptionPhrase =
        normalized.includes(' dividend payout ') ||
        normalized.includes(' dividend reinvestment ') ||
        normalized.includes(' dividend option ') ||
        normalized.includes(' dividend plan ') ||
        normalized.endsWith(' dividend payout') ||
        normalized.endsWith(' dividend reinvestment') ||
        normalized.endsWith(' dividend option') ||
        normalized.endsWith(' dividend plan');

    return {
        direct:
            normalized.includes(' direct ') ||
            normalized.endsWith(' direct') ||
            normalized.startsWith('direct ') ||
            normalized.includes(' dir ') ||
            normalized.endsWith(' dir') ||
            normalized.startsWith('dir '),
        regular: normalized.includes(' regular ') || normalized.endsWith(' regular') || normalized.startsWith('regular '),
        growth:
            normalized.includes(' growth ') ||
            normalized.endsWith(' growth') ||
            normalized.startsWith('growth ') ||
            normalized.endsWith(' gr') ||
            normalized.includes(' gr '),
        idcw:
            normalized.includes(' idcw ') ||
            normalized.endsWith(' idcw') ||
            normalized.startsWith('idcw ') ||
            normalized.includes(' income distribution cum capital withdrawal '),
        dividend: hasDividendOptionPhrase,
    };
}

export function isVariantCompatible(targetVariant, candidateVariant) {
    if (targetVariant.direct && !candidateVariant.direct) {
        return false;
    }

    if (targetVariant.regular && candidateVariant.direct) {
        return false;
    }

    const targetIncomeStyle = targetVariant.idcw || targetVariant.dividend;
    const candidateIncomeStyle = candidateVariant.idcw || candidateVariant.dividend;
    const targetHasAmbiguousIncomeSignal = targetVariant.growth && targetIncomeStyle;
    const candidateHasAmbiguousIncomeSignal = candidateVariant.growth && candidateIncomeStyle;

    if (!targetHasAmbiguousIncomeSignal && !candidateHasAmbiguousIncomeSignal && targetVariant.growth && candidateIncomeStyle) {
        return false;
    }

    if (!targetHasAmbiguousIncomeSignal && !candidateHasAmbiguousIncomeSignal && targetIncomeStyle && candidateVariant.growth) {
        return false;
    }

    return true;
}

function variantPenalty(targetVariant, candidateVariant) {
    let penalty = 0;

    if (targetVariant.direct && candidateVariant.regular) {
        penalty += 0.4;
    }
    if (targetVariant.regular && candidateVariant.direct) {
        penalty += 0.4;
    }

    const targetIncomeStyle = targetVariant.idcw || targetVariant.dividend;
    const candidateIncomeStyle = candidateVariant.idcw || candidateVariant.dividend;
    const targetHasAmbiguousIncomeSignal = targetVariant.growth && targetIncomeStyle;
    const candidateHasAmbiguousIncomeSignal = candidateVariant.growth && candidateIncomeStyle;
    if (!targetHasAmbiguousIncomeSignal && !candidateHasAmbiguousIncomeSignal && targetVariant.growth && candidateIncomeStyle) {
        penalty += 0.3;
    }
    if (!targetHasAmbiguousIncomeSignal && !candidateHasAmbiguousIncomeSignal && targetIncomeStyle && candidateVariant.growth) {
        penalty += 0.3;
    }

    return penalty;
}

function variantBonus(targetVariant, candidateVariant) {
    let bonus = 0;

    if ((targetVariant.direct && candidateVariant.direct) || (targetVariant.regular && candidateVariant.regular)) {
        bonus += 0.08;
    }

    const targetIncomeStyle = targetVariant.idcw || targetVariant.dividend;
    const candidateIncomeStyle = candidateVariant.idcw || candidateVariant.dividend;
    if ((targetVariant.growth && candidateVariant.growth) || (targetIncomeStyle && candidateIncomeStyle)) {
        bonus += 0.06;
    }

    return bonus;
}

function jaccardSimilarity(tokensA, tokensB) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    if (setA.size === 0 || setB.size === 0) {
        return 0;
    }

    let intersection = 0;
    setA.forEach((item) => {
        if (setB.has(item)) {
            intersection += 1;
        }
    });

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

export function scoreSchemeCandidate(targetName, targetTokens, candidateName, candidateTokens) {
    const targetVariant = getPlanVariant(targetName);
    const candidateVariant = getPlanVariant(candidateName);

    if (targetName === candidateName) {
        return 1;
    }

    if (targetName.includes(candidateName) || candidateName.includes(targetName)) {
        return 0.88;
    }

    const tokenScore = jaccardSimilarity(targetTokens, candidateTokens);
    const penalty = variantPenalty(targetVariant, candidateVariant);
    const bonus = variantBonus(targetVariant, candidateVariant);
    const adjustedTokenScore = Math.max(0, Math.min(1, tokenScore - penalty + bonus));
    if (adjustedTokenScore >= 0.8) {
        return adjustedTokenScore;
    }

    const joinedTarget = targetTokens.join(' ');
    const joinedCandidate = candidateTokens.join(' ');
    if (joinedTarget && joinedCandidate && (joinedTarget.includes(joinedCandidate) || joinedCandidate.includes(joinedTarget))) {
        return Math.max(adjustedTokenScore, 0.74 - penalty);
    }

    return adjustedTokenScore;
}


import { normalizeSchemeNameForMatch, scoreSchemeCandidate, tokenizeSchemeName } from '../app/application/services/schemeMatcher.js';

function bestMatch(target, candidates) {
    const targetName = normalizeSchemeNameForMatch(target);
    const targetTokens = tokenizeSchemeName(target);

    let best = null;
    let bestScore = -1;

    for (const candidate of candidates) {
        const candidateName = normalizeSchemeNameForMatch(candidate);
        const candidateTokens = tokenizeSchemeName(candidate);
        const score = scoreSchemeCandidate(targetName, targetTokens, candidateName, candidateTokens);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }

    return { best, bestScore };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const hsbcTarget = 'HSBC Arbitrage Fund - Direct Growth (Formerly known as L&T Arbitrage Opportunities Fund Direct Growth)';
const hsbcCandidates = [
    'HSBC Arbitrage Fund - Regular Growth',
    'HSBC Arbitrage Fund - Direct Growth',
    'HSBC Arbitrage Fund - Regular IDCW',
];

const hsbcResult = bestMatch(hsbcTarget, hsbcCandidates);
assert(
    hsbcResult.best === 'HSBC Arbitrage Fund - Direct Growth',
    `Expected direct plan to win for HSBC sample, got: ${hsbcResult.best}`
);

const growthTarget = 'Axis ELSS Tax Saver Fund Direct Growth';
const growthCandidates = [
    'Axis ELSS Tax Saver Fund Direct IDCW',
    'Axis ELSS Tax Saver Fund Regular Growth',
    'Axis ELSS Tax Saver Fund Direct Growth',
];

const growthResult = bestMatch(growthTarget, growthCandidates);
assert(
    growthResult.best === 'Axis ELSS Tax Saver Fund Direct Growth',
    `Expected growth direct to win for ELSS sample, got: ${growthResult.best}`
);

const iciciTarget = 'ICICI Prudential Equity & Debt Fund - Direct Plan - Growth (formerly ICICI Prudential Balanced Fund)';
const iciciCandidates = [
    'ICICI Prudential Equity & Debt Fund - Regular Plan - Growth',
    'ICICI Prudential Equity & Debt Fund - Direct Plan - Growth',
    'ICICI Prudential Equity & Debt Fund - Regular Plan - IDCW',
];

const iciciResult = bestMatch(iciciTarget, iciciCandidates);
assert(
    iciciResult.best === 'ICICI Prudential Equity & Debt Fund - Direct Plan - Growth',
    `Expected ICICI direct plan to win, got: ${iciciResult.best}`
);

const iciciDividendYieldTarget = 'ICICI Prudential Dividend Yield Equity Fund Direct Plan - Growth';
const iciciDividendYieldCandidates = [
    'ICICI Prudential Dividend Yield Equity Fund Regular Plan - Growth',
    'ICICI Prudential Dividend Yield Equity Fund Direct Plan - Growth',
    'ICICI Prudential Dividend Yield Equity Fund Direct Plan - IDCW',
];

const iciciDividendYieldResult = bestMatch(iciciDividendYieldTarget, iciciDividendYieldCandidates);
assert(
    iciciDividendYieldResult.best === 'ICICI Prudential Dividend Yield Equity Fund Direct Plan - Growth',
    `Expected ICICI Dividend Yield Direct Growth to win, got: ${iciciDividendYieldResult.best}`
);

console.log('Scheme matcher regression passed: direct/regular and growth/idcw ranking is correct.');


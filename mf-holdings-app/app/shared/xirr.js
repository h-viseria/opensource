import { normalizeCasDateToIso } from './casDates.js';

function toUtcDate(isoDate) {
    const normalized = normalizeCasDateToIso(isoDate);
    if (!normalized) {
        return null;
    }
    return new Date(`${normalized}T00:00:00Z`);
}

function aggregateFlowsByDate(flows) {
    const byDate = new Map();

    flows.forEach((flow) => {
        const date = normalizeCasDateToIso(flow.date);
        if (!date || !Number.isFinite(flow.amount) || flow.amount === 0) {
            return;
        }

        byDate.set(date, (byDate.get(date) || 0) + flow.amount);
    });

    return Array.from(byDate.entries())
        .map(([date, amount]) => ({ date, amount }))
        .filter((flow) => flow.amount !== 0);
}

/**
 * Extended IRR for irregular dated cash flows.
 * @param {{ date: string, amount: number }[]} cashFlows - outflows negative, inflows positive
 * @param {number} guess - initial rate guess (decimal, e.g. 0.1 = 10%)
 * @returns {number|null} annualized return as percentage, or null if not computable
 */
export function calculateXirr(cashFlows, guess = 0.1) {
    if (!Array.isArray(cashFlows) || cashFlows.length < 2) {
        return null;
    }

    const flows = aggregateFlowsByDate(cashFlows).sort((a, b) => a.date.localeCompare(b.date));

    if (flows.length < 2) {
        return null;
    }

    const hasNegative = flows.some((flow) => flow.amount < 0);
    const hasPositive = flows.some((flow) => flow.amount > 0);
    if (!hasNegative || !hasPositive) {
        return null;
    }

    const baseDate = toUtcDate(flows[0].date);
    if (!baseDate) {
        return null;
    }

    const baseTime = baseDate.getTime();
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const amounts = flows.map((flow) => flow.amount);
    const yearFractions = flows.map((flow) => {
        const date = toUtcDate(flow.date);
        if (!date) {
            return null;
        }
        return (date.getTime() - baseTime) / msPerYear;
    });

    if (yearFractions.some((value) => value === null)) {
        return null;
    }

    const npvAt = (rate) => {
        let npv = 0;
        for (let i = 0; i < amounts.length; i += 1) {
            npv += amounts[i] / Math.pow(1 + rate, yearFractions[i]);
        }
        return npv;
    };

    const dNpvAt = (rate) => {
        let dnpv = 0;
        for (let i = 0; i < amounts.length; i += 1) {
            if (yearFractions[i] === 0) {
                continue;
            }
            const factor = Math.pow(1 + rate, yearFractions[i]);
            dnpv -= (yearFractions[i] * amounts[i]) / (factor * (1 + rate));
        }
        return dnpv;
    };

    const guesses = [guess, 0.05, 0.15, -0.05, 0.25, 0.5];
    for (const initialGuess of guesses) {
        let rate = initialGuess;
        for (let iteration = 0; iteration < 100; iteration += 1) {
            const npv = npvAt(rate);
            if (Math.abs(npv) < 1e-6) {
                return rate * 100;
            }

            const dnpv = dNpvAt(rate);
            if (!Number.isFinite(dnpv) || Math.abs(dnpv) < 1e-12) {
                break;
            }

            const nextRate = rate - npv / dnpv;
            if (!Number.isFinite(nextRate)) {
                break;
            }

            if (Math.abs(nextRate - rate) < 1e-8) {
                if (Math.abs(npvAt(nextRate)) < 1e-5) {
                    return nextRate * 100;
                }
                break;
            }

            rate = Math.max(Math.min(nextRate, 10), -0.999999);
        }
    }

    let low = -0.9999;
    let high = 10;
    let lowNpv = npvAt(low);
    let highNpv = npvAt(high);

    if (lowNpv * highNpv > 0) {
        return null;
    }

    for (let iteration = 0; iteration < 250; iteration += 1) {
        const mid = (low + high) / 2;
        const midNpv = npvAt(mid);
        if (Math.abs(midNpv) < 1e-6) {
            return mid * 100;
        }

        if (lowNpv * midNpv <= 0) {
            high = mid;
            highNpv = midNpv;
        } else {
            low = mid;
            lowNpv = midNpv;
        }
    }

    return null;
}

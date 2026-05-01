const moneyFormatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const pctFormatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function formatNumber(value) {
    return Number.isFinite(value) ? moneyFormatter.format(value) : '-';
}

export function formatPercent(value) {
    if (!Number.isFinite(value)) {
        return '-';
    }
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${pctFormatter.format(value)}%`;
}


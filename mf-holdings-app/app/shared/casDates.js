const MONTHS = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
};

function toIsoDate(year, month, day) {
    if (!year || !month || !day) {
        return null;
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalize CAS / MFAPI date strings to ISO YYYY-MM-DD.
 * Supports ISO, DD-MMM-YYYY, DD-MM-YYYY, and DD/MM/YYYY.
 */
export function normalizeCasDateToIso(value) {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return raw;
    }

    const dmyText = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (dmyText) {
        const month = MONTHS[dmyText[2].toLowerCase()];
        if (month !== undefined) {
            return toIsoDate(Number(dmyText[3]), month + 1, Number(dmyText[1]));
        }
    }

    const dmyNumeric = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dmyNumeric) {
        return toIsoDate(Number(dmyNumeric[3]), Number(dmyNumeric[2]), Number(dmyNumeric[1]));
    }

    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        return toIsoDate(Number(slash[3]), Number(slash[2]), Number(slash[1]));
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return null;
}

export function maxIsoDate(...values) {
    const normalized = values
        .map((value) => normalizeCasDateToIso(value))
        .filter(Boolean)
        .sort();

    return normalized.length ? normalized[normalized.length - 1] : null;
}

export function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

export function addDaysToIsoDate(isoDate, days) {
    const normalized = normalizeCasDateToIso(isoDate);
    if (!normalized) {
        return null;
    }

    const date = new Date(`${normalized}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/**
 * Terminal valuation for XIRR must be dated after the last transaction.
 */
export function resolveXirrTerminalDate(lastTransactionDate, navDate) {
    const baseDate = maxIsoDate(todayIsoDate(), navDate, lastTransactionDate) || todayIsoDate();
    const lastTx = normalizeCasDateToIso(lastTransactionDate);

    if (lastTx && baseDate === lastTx) {
        return addDaysToIsoDate(baseDate, 1) || baseDate;
    }

    return baseDate;
}

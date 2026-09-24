import { addDaysToIsoDate, normalizeCasDateToIso, todayIsoDate } from '../../shared/casDates.js';

export const AMFI_HISTORY_URL = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatAmfiDate(isoDate) {
    const normalized = normalizeCasDateToIso(isoDate);
    if (!normalized) {
        return null;
    }

    const [year, month, day] = normalized.split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    return `${String(day).padStart(2, '0')}-${MONTH_NAMES[month - 1]}-${year}`;
}

export function buildAmfiHistoryUrl(fromIso, toIso) {
    const frmdt = formatAmfiDate(fromIso);
    const todt = formatAmfiDate(toIso);
    if (!frmdt || !todt) {
        throw new Error('Invalid AMFI history date range.');
    }

    return `${AMFI_HISTORY_URL}?mf=&frmdt=${encodeURIComponent(frmdt)}&todt=${encodeURIComponent(todt)}`;
}

export function getAmfiLastWeekHistoryUrl(latestIso = todayIsoDate()) {
    const to = normalizeCasDateToIso(latestIso) || todayIsoDate();
    const from = addDaysToIsoDate(to, -7) || to;
    return {
        label: 'Download AMFI last 1 week',
        href: buildAmfiHistoryUrl(from, to),
        fromIso: from,
        toIso: to,
    };
}

function schemeNameFromParts(parts, isHistory) {
    if (isHistory) {
        return (parts[1] || '').trim() || null;
    }
    return (parts[3] || parts[1] || '').trim() || null;
}

export function parseAmfiNavRows(text) {
    const raw = String(text || '');
    const isHistory = /^[^\n]*NAV Name/i.test(raw);
    const rows = [];
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
        const parts = line.split(';');
        if (parts.length < 3) {
            continue;
        }

        const schemeCode = parts[0].trim();
        if (!/^\d+$/.test(schemeCode)) {
            continue;
        }

        const dateRaw = parts[parts.length - 1].trim();
        const nav = Number(String(parts[parts.length - 2] || '').trim());
        const dateIso = normalizeCasDateToIso(dateRaw);
        if (!Number.isFinite(nav) || nav <= 0 || !dateIso) {
            continue;
        }

        rows.push({
            schemeCode,
            schemeName: schemeNameFromParts(parts, isHistory),
            nav,
            date: dateRaw,
            dateIso,
        });
    }

    return rows;
}

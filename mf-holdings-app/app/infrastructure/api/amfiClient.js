import { addDaysToIsoDate, normalizeCasDateToIso, todayIsoDate } from '../../shared/casDates.js';

export const AMFI_LATEST_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
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

function looksLikeHtml(text) {
    const head = String(text || '').slice(0, 300).toLowerCase();
    return head.includes('<html') || head.includes('<!doctype html');
}

async function fetchText(url) {
    let response;
    try {
        response = await fetch(url, { cache: 'no-store' });
    } catch {
        throw new Error('Could not reach AMFI from the browser (CORS). Open the AMFI links, save the .txt files, and upload them.');
    }

    if (!response.ok) {
        throw new Error(`AMFI request failed (${response.status}).`);
    }

    const text = await response.text();
    if (!text.trim()) {
        throw new Error('AMFI returned an empty file.');
    }
    if (looksLikeHtml(text)) {
        throw new Error('AMFI returned a web page instead of NAV data.');
    }

    return text;
}

async function fetchTextWithRetry(url, retries = 2) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fetchText(url);
        } catch (error) {
            lastError = error;
            if (attempt === retries) {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
    }

    throw lastError;
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

export async function fetchAmfiLatestRows() {
    const text = await fetchTextWithRetry(AMFI_LATEST_URL);
    return parseAmfiNavRows(text);
}

export async function fetchAmfiHistoryRows(fromIso, toIso) {
    const from = normalizeCasDateToIso(fromIso);
    const to = normalizeCasDateToIso(toIso);
    if (!from || !to) {
        throw new Error('Invalid AMFI history date range.');
    }

    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const text = await fetchTextWithRetry(buildAmfiHistoryUrl(start, end));
    return parseAmfiNavRows(text);
}

export function historyWindowAround(targetIso, lookbackDays = 8) {
    const to = normalizeCasDateToIso(targetIso);
    if (!to) {
        return null;
    }

    return {
        fromIso: addDaysToIsoDate(to, -lookbackDays) || to,
        toIso: to,
    };
}

function monthsBeforeIso(isoDate, months) {
    const normalized = normalizeCasDateToIso(isoDate);
    if (!normalized) {
        return null;
    }
    const date = new Date(`${normalized}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
}

export function getAmfiManualDownloadLinks(latestIso = todayIsoDate()) {
    const latest = normalizeCasDateToIso(latestIso) || todayIsoDate();
    const windows = [
        { label: '1 day', iso: addDaysToIsoDate(latest, -1) },
        { label: '1 month', iso: monthsBeforeIso(latest, 1) },
        { label: '3 months', iso: monthsBeforeIso(latest, 3) },
        { label: '6 months', iso: monthsBeforeIso(latest, 6) },
        { label: 'YTD', iso: `${latest.slice(0, 4)}-01-01` },
        { label: '1 year', iso: monthsBeforeIso(latest, 12) },
    ];

    return [
        { label: 'Latest NAVAll.txt', href: AMFI_LATEST_URL },
        ...windows.map((item) => {
            const window = historyWindowAround(item.iso);
            return {
                label: `${item.label} history`,
                href: window ? buildAmfiHistoryUrl(window.fromIso, window.toIso) : AMFI_HISTORY_URL,
            };
        }),
    ];
}

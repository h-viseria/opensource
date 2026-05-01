/**
 * Debug script: print per-folio rows for focus AMCs, then show
 * the aggregated units/currentValue from the CAS parser vs raw XLS.
 * Run: node ./tests/_debug-compare.mjs
 */
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { parseMfcCasWorkbook } from '../app/infrastructure/parsers/mfcCasParser.js';
import { normalizeSchemeName } from '../app/infrastructure/db/indexedDb.js';
import { fetchAllSchemes, fetchSchemeHistory } from '../app/infrastructure/api/mfApiClient.js';
import {
    getPlanVariant,
    isVariantCompatible,
    normalizeSchemeNameForMatch,
    scoreSchemeCandidate,
    tokenizeSchemeName,
} from '../app/application/services/schemeMatcher.js';

const portfolioPath = process.argv[2] || 'C:/Users/Hitesh.Viseria/Downloads/cas_detailed_report_2026_04_29_094624.xlsx';
const buf = readFileSync(portfolioPath);

// ------- 1. Raw per-folio rows from XLS -------
const wb = XLSX.read(buf, { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });

// Find header row (contains "scheme name" + "current value")
function normalizeHeader(v) { return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
let headerRowIndex = 0;
for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const txt = rows[i].map(normalizeHeader).join(' ');
    if (txt.includes('scheme') && txt.includes('current value')) {
        headerRowIndex = i;
        break;
    }
}
const headers = rows[headerRowIndex].map(normalizeHeader);

function findCol(candidates) {
    for (let i = 0; i < headers.length; i += 1) {
        if (candidates.some(c => headers[i].includes(c))) return i;
    }
    return -1;
}

const idxScheme = findCol(['scheme name','scheme']);
const idxAmc    = findCol(['amc name','amc','fund house']);
const idxFolio  = findCol(['folio']);
const idxUnits  = findCol(['units']);
const idxInvested = findCol(['invested value','amount invested']);
const idxCurrent  = findCol(['current value','market value']);

const FOCUS = ['nippon','dsp','aditya birla','franklin','axis','kotak'];

function toNum(v) {
    const n = Number(String(v||'').replace(/,/g,'').replace(/[^0-9.-]/g,'').trim());
    return Number.isFinite(n) ? n : null;
}

// Aggregate from raw XLS: sum units and current value per scheme
const rawByScheme = new Map();
const dataRows = rows.slice(headerRowIndex + 1);
for (const row of dataRows) {
    const schemeName = String(row[idxScheme]||'').trim();
    const amcName = String(row[idxAmc]||'').trim();
    if (!schemeName) continue;
    const units = toNum(row[idxUnits]);
    if (!Number.isFinite(units) || units <= 0) continue;
    const current = toNum(row[idxCurrent]);
    const invested = toNum(row[idxInvested]);
    const folio = idxFolio !== -1 ? String(row[idxFolio]||'') : '';
    const key = normalizeSchemeName(schemeName);

    const existing = rawByScheme.get(key) || {
        schemeName, amcName, units: 0, invested: 0, currentValue: 0, folios: [],
    };
    existing.units += units;
    if (Number.isFinite(invested)) existing.invested += invested;
    if (Number.isFinite(current)) existing.currentValue += current;
    existing.folios.push(folio);
    rawByScheme.set(key, existing);
}

// Filter to focus AMCs
const focusEntries = [...rawByScheme.values()].filter(e =>
    FOCUS.some(k => e.amcName.toLowerCase().includes(k))
);

console.log('\n=== XLS aggregated (focus AMCs) ===');
for (const e of focusEntries) {
    console.log(`  ${e.amcName.padEnd(50)} | ${e.schemeName.slice(0,65).padEnd(65)} | units=${e.units.toFixed(3).padStart(12)} | current=${e.currentValue.toFixed(2).padStart(14)} | folios=${e.folios.length}`);
}

// ------- 2. What CAS parser produced -------
const { holdings } = parseMfcCasWorkbook(buf, { xlsxLib: XLSX, withDiagnostics: true });
const focusHoldings = holdings.filter(h =>
    FOCUS.some(k => (h.amcName||'').toLowerCase().includes(k) || h.schemeName.toLowerCase().includes(k.split(' ')[0]))
);

console.log('\n=== CAS parser holdings (focus AMCs) ===');
for (const h of focusHoldings) {
    console.log(`  ${(h.amcName||'').padEnd(50)} | ${h.schemeName.slice(0,65).padEnd(65)} | units=${h.units.toFixed(3).padStart(12)} | invested=${String(h.investedValue??'null').padStart(12)}`);
}

// ------- 3. Scheme code mapping for focus schemes -------
console.log('\nFetching MFAPI scheme master...');
const schemeMasterRaw = await fetchAllSchemes();
const schemeMaster = schemeMasterRaw.map(item => ({
    schemeCode: String(item.schemeCode),
    schemeName: item.schemeName,
    normalized: normalizeSchemeNameForMatch(item.schemeName),
    tokens: tokenizeSchemeName(item.schemeName),
})).sort((a, b) => a.normalized.localeCompare(b.normalized));

function countOverlap(ta, tb) {
    const sb = new Set(tb);
    let n = 0;
    ta.forEach(t => { if (sb.has(t)) n++; });
    return n;
}
function isBetter(cur, nxt) {
    if (!cur) return true;
    if (nxt.score !== cur.score) return nxt.score > cur.score;
    if (nxt.contains !== cur.contains) return nxt.contains > cur.contains;
    if (nxt.overlap !== cur.overlap) return nxt.overlap > cur.overlap;
    if (nxt.lengthDistance !== cur.lengthDistance) return nxt.lengthDistance < cur.lengthDistance;
    return nxt.normalized < cur.normalized;
}
function findBestMatch(schemeName) {
    const targetName = normalizeSchemeNameForMatch(schemeName);
    const targetTokens = tokenizeSchemeName(schemeName);
    const targetVariant = getPlanVariant(targetName);
    const compatible = schemeMaster.filter(c => isVariantCompatible(targetVariant, getPlanVariant(c.normalized)));
    const candidates = compatible.length > 0 ? compatible : schemeMaster;
    let best = null, bestRank = null;
    for (const c of candidates) {
        const score = scoreSchemeCandidate(targetName, targetTokens, c.normalized, c.tokens);
        if (score < 0.5) continue;
        const r = { score, contains: targetName.includes(c.normalized)||c.normalized.includes(targetName)?1:0, overlap: countOverlap(targetTokens, c.tokens), lengthDistance: Math.abs(targetTokens.length - c.tokens.length), normalized: c.normalized };
        if (isBetter(bestRank, r)) { best = c; bestRank = r; }
    }
    return best && bestRank?.score >= 0.58 ? { best, score: bestRank.score } : null;
}

console.log('\n=== Scheme code mappings (focus, with latest NAV vs XLS current value) ===');
for (const h of focusHoldings) {
    const match = findBestMatch(h.schemeName);
    if (!match) {
        console.log(`  UNMATCHED: ${h.schemeName}`);
        continue;
    }
    let latestNav = null;
    let navDate = null;
    try {
        const hist = await fetchSchemeHistory(match.best.schemeCode);
        const series = hist.data
            .map(r => ({ nav: Number(r.nav), date: r.date }))
            .filter(r => Number.isFinite(r.nav))
            .sort((a,b) => {
                const parse = s => { const [d,m,y]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); };
                return parse(b.date) - parse(a.date);
            });
        if (series.length) { latestNav = series[0].nav; navDate = series[0].date; }
    } catch {}
    const xlsEntry = rawByScheme.get(normalizeSchemeName(h.schemeName));
    const xlsCurrent = xlsEntry?.currentValue ?? null;
    const appCurrent = latestNav != null ? latestNav * h.units : null;
    const delta = appCurrent != null && xlsCurrent != null ? appCurrent - xlsCurrent : null;
    const deltaPct = delta != null && xlsCurrent ? (delta/xlsCurrent*100) : null;
    const status = Math.abs(deltaPct??0) > 5 ? '*** MISMATCH ***' : 'OK';
    console.log(`  [${status}] ${h.schemeName.slice(0,55).padEnd(55)} code=${match.best.schemeCode} score=${match.score.toFixed(2)}`);
    console.log(`           API name: ${match.best.schemeName.slice(0,70)}`);
    console.log(`           units=${h.units.toFixed(3)} | latestNAV=${latestNav?.toFixed(4)??'N/A'} (${navDate??'N/A'}) | XLS_current=${xlsCurrent?.toFixed(2)??'N/A'} | APP_current=${appCurrent?.toFixed(2)??'N/A'} | delta=${delta?.toFixed(2)??'N/A'} (${deltaPct?.toFixed(1)??'N/A'}%)`);
}


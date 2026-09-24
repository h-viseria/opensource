import {
    buildAmfiHistoryUrl,
    formatAmfiDate,
    getAmfiLastWeekHistoryUrl,
    parseAmfiNavRows,
} from '../app/infrastructure/api/amfiClient.js';
import { mergeMissingNavDates, snapshotPointsToSeries } from '../app/application/services/amfiNavSnapshotService.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    assert(formatAmfiDate('2026-09-22') === '22-Sep-2026', 'formatAmfiDate should match AMFI URL style');
    assert(
        buildAmfiHistoryUrl('2026-09-17', '2026-09-24') ===
            'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?mf=&frmdt=17-Sep-2026&todt=24-Sep-2026',
        'history URL should use empty mf and dd-MMM-yyyy dates'
    );

    const week = getAmfiLastWeekHistoryUrl('2026-09-24');
    assert(week.fromIso === '2026-09-17', `last-week from mismatch: ${week.fromIso}`);
    assert(week.toIso === '2026-09-24', `last-week to mismatch: ${week.toIso}`);
    assert(week.href.includes('frmdt=17-Sep-2026') && week.href.includes('todt=24-Sep-2026'), 'last-week URL dates mismatch');

    const historyText = [
        'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date',
        '',
        '120503;Axis ELSS Tax Saver Fund - Direct Plan - Growth Option;Direct Plan;Growth Option;INF846K01EW2;;112.0096;22-Sep-2026',
        '120503;Axis ELSS Tax Saver Fund - Direct Plan - Growth Option;Direct Plan;Growth Option;INF846K01EW2;;112.1000;23-Sep-2026',
    ].join('\n');
    const historyRows = parseAmfiNavRows(historyText);
    assert(historyRows.length === 2, `expected 2 history rows, got ${historyRows.length}`);

    const existing = snapshotPointsToSeries({
        apiSchemeName: 'Axis ELSS',
        latest: { nav: 112.0096, date: '22-09-2026' },
        prev1Day: { nav: 111.5, date: '21-09-2026' },
        oneYear: { nav: 90, date: '22-09-2025' },
    });
    assert(existing.length === 3, `expected 3 existing points, got ${existing.length}`);

    const merged = mergeMissingNavDates(existing, historyRows);
    assert(merged.added === 1, `should add only 23-Sep, added ${merged.added}`);
    const dates = merged.series.map((row) => row.dateIso).sort();
    assert(dates.includes('2026-09-21') && dates.includes('2026-09-22') && dates.includes('2026-09-23') && dates.includes('2025-09-22'), 'merged dates mismatch');

    const sameDayOverwrite = mergeMissingNavDates(existing, [
        { dateIso: '2026-09-22', nav: 999, date: '22-Sep-2026' },
    ]);
    assert(sameDayOverwrite.added === 0, 'existing date must not be overwritten');
    const kept = sameDayOverwrite.series.find((row) => row.dateIso === '2026-09-22');
    assert(kept.nav === 112.0096, `existing NAV was overwritten: ${kept.nav}`);

    console.log('AMFI NAV parser tests passed.');
}

main();

import {
    buildAmfiHistoryUrl,
    formatAmfiDate,
    historyWindowAround,
    parseAmfiNavRows,
} from '../app/infrastructure/api/amfiClient.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    assert(formatAmfiDate('2026-09-22') === '22-Sep-2026', 'formatAmfiDate should match AMFI URL style');
    assert(
        buildAmfiHistoryUrl('2026-09-22', '2026-09-23') ===
            'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?mf=&frmdt=22-Sep-2026&todt=23-Sep-2026',
        'history URL should use empty mf and dd-MMM-yyyy dates'
    );

    const window = historyWindowAround('2026-08-23', 8);
    assert(window.fromIso === '2026-08-15', `lookback window start mismatch: ${window.fromIso}`);
    assert(window.toIso === '2026-08-23', `lookback window end mismatch: ${window.toIso}`);

    const latestText = [
        'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
        '',
        'Open Ended Schemes(Children Fund)',
        '',
        'Axis Mutual Fund',
        '',
        "135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;30.0236;23-Sep-2026",
        'N.A. row should skip;INF;-;Bad;Direct;Growth;N.A.;23-Sep-2026',
    ].join('\n');

    const latestRows = parseAmfiNavRows(latestText);
    assert(latestRows.length === 1, `expected 1 latest row, got ${latestRows.length}`);
    assert(latestRows[0].schemeCode === '135762', 'latest scheme code mismatch');
    assert(latestRows[0].schemeName === "Axis Children's Fund", `latest name mismatch: ${latestRows[0].schemeName}`);
    assert(latestRows[0].nav === 30.0236, 'latest NAV mismatch');
    assert(latestRows[0].dateIso === '2026-09-23', 'latest date ISO mismatch');

    const historyText = [
        'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date',
        '',
        '139619;Taurus Investor Education Pool - Unclaimed Dividend - Growth;;;;;10.0000;22-Sep-2026',
        '139619;Taurus Investor Education Pool - Unclaimed Dividend - Growth;;;;;10.1000;23-Sep-2026',
        '120503;Axis ELSS Tax Saver Fund - Direct Plan - Growth Option;Direct Plan;Growth Option;INF846K01EW2;;112.0096;22-Sep-2026',
    ].join('\n');

    const historyRows = parseAmfiNavRows(historyText);
    assert(historyRows.length === 3, `expected 3 history rows, got ${historyRows.length}`);
    const axis = historyRows.find((row) => row.schemeCode === '120503');
    assert(axis.schemeName.startsWith('Axis ELSS'), `history name should come from NAV Name, got ${axis.schemeName}`);
    assert(axis.dateIso === '2026-09-22', 'history date ISO mismatch');
    assert(axis.nav === 112.0096, 'history NAV mismatch');

    console.log('AMFI NAV parser tests passed.');
}

main();

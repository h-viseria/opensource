# MF Holdings App

A pure HTML/CSS/JavaScript + IndexedDB app to calculate current valuation of mutual fund holdings.

## Structure

- `index.html` - UI for CAS upload, sync actions, and valuation report
- `main.js` - App entrypoint
- `styles.css` - App styling and responsive wide-table support
- `app/infrastructure/parsers/mfcCasParser.js` - Parses Mutual Fund Central XLSX
- `app/infrastructure/db/indexedDb.js` - IndexedDB storage for holdings, scheme codes, and NAV snapshots
- `app/infrastructure/api/mfApiClient.js` - MFAPI client (`/mf` and `/mf/{schemeCode}`)
- `app/application/services/*.js` - Import, scheme mapping, NAV snapshot, and report services
- `app/ui/appController.js` - UI orchestration
- `tests/smoke.mjs` - File integrity smoke test

## Quick start

1. Open `index.html` in a browser.
2. Upload Mutual Fund Central CAS file (example path you shared: `C:\Users\Hitesh.Viseria\Downloads\cas_detailed_report_2026_04_25_113826.xlsx`).
3. Click `Load Holdings to IndexedDB`.
4. Click `Map Scheme Codes` (uses MFAPI scheme master lookup).
5. Click `Fetch NAV Snapshots`.
6. Open `Report` tab and click `Refresh Report`.

Report includes:
- Scheme Name, Scheme Code, Invested Value, Units
- Latest NAV and Current Value (`latest NAV * units`)
- 1 day, 1 month, 1 Jan, and 1 year NAV references
- % change of latest NAV vs each reference NAV

Notes:
- Scheme code mapping uses normalized name matching against `https://api.mfapi.in/mf`.
- NAV snapshots use `https://api.mfapi.in/mf/{schemeCode}`.
- Data persists in IndexedDB between page refreshes.

## Smoke test

Run:

```powershell
node --check .\main.js
node .\tests\smoke.mjs
```

## Scheme Code Manager

The **Scheme Codes** tab allows you to review and manually correct MFAPI scheme codes mapped to each holding:

1. Open the **Scheme Codes** tab.
2. Review the auto-mapped scheme codes and MFAPI names.
3. Edit any scheme code in the text input (e.g. if the fuzzy matcher chose the wrong variant).
4. Click **Apply** — the system validates against MFAPI and saves to IndexedDB.
5. After corrections, run **Fetch NAV Snapshots** on the Import tab to refresh valuations.

## Backup & Restore

### Export IndexedDB Dump

On the **Import** tab, click **Export IndexedDB Dump** to download:

- All holdings with current invested and current values (from XLS)
- All scheme code mappings
- All NAV snapshots

Saved as `mf-holdings-backup-YYYY-MM-DD.json`.

### Import IndexedDB Dump

On the **Import** tab, click **Import IndexedDB Dump**, select a previously exported JSON file, and the system will:

- Restore all holdings
- Restore all scheme code mappings
- Restore all NAV snapshots
- Auto-refresh the UI

Useful for moving data between devices or creating point-in-time backups.

## Reports with Totals

All three report subtabs now display a **totals summary section** at the top:

- **Scheme Report**: Total Invested Value, Total Current Value, Total Returns (₹ + %), color-coded
- **AMC Summary**: Total Invested Value, Total Current Value, Total Returns (₹ + %), color-coded
- **XLS vs Calc Comparison**: Total Invested Value, Total XLS Current Value, Total Calc Current Value, Total Delta (₹ + %), color-coded

## Two New Columns in Scheme Report

The **Scheme Report** now includes:

1. **Current Value (XLS)**: Current value from the original CAS file per scheme
2. **Current Value (Calc)**: Calculated from latest NAV × units
3. **Difference**: Calculated − XLS (useful for spotting reconciliation gaps)
4. **Diff %**: Percentage delta

**XLS vs Calc Comparison** tab provides a dedicated side-by-side view with deltas highlighted.## Compare XLS current value vs MFAPI current value

Run this to parse a CAS XLSX, map scheme codes, fetch latest NAV, and compare per-scheme current value:

```powershell
npm run portfolio:compare -- "C:\Users\Hitesh.Viseria\Downloads\cas_detailed_report_2026_04_29_094624.xlsx"
```

Output:
- Console summary (mapped/unmatched/NAV status + total delta)
- Detailed CSV at `tests/output/portfolio-compare-<timestamp>.csv`


# MF Holdings App — Latest Features

## Summary of Updates (April 29, 2026)

### 1. Scheme Code Manager Tab
- **New Tab**: "Scheme Codes" between Import and Reports
- View all holdings with auto-mapped MFAPI scheme codes
- Edit scheme codes per holding (e.g., fix fuzzy-matcher mistakes like "Large Cap" vs "Large & Mid Cap")
- Click **Apply** to validate against MFAPI and save to IndexedDB
- Useful after importing problematic portfolio files

### 2. XLS vs Calculated Current Value Comparison
- **New Report Subtab**: "XLS vs Calc Comparison" under Reports
- Side-by-side comparison: Current Value from XLS vs. calculated from latest NAV
- Shows: AMC | Scheme | Code | Invested | Units | XLS Current | Calc Current | Delta (₹ + %)
- Color-coded deltas (green = positive, red = negative)
- Total delta footer row
- Helps identify reconciliation gaps and NAV mismatches

### 3. Report Totals Summary
All three report subtabs now display a totals section **at the top** of each report:
- **Scheme Report**: Total Invested, Total Current, Total Returns (₹ + %), color-coded
- **AMC Summary**: Total Invested, Total Current, Total Returns (₹ + %), color-coded
- **XLS vs Calc Comparison**: Total Invested, XLS Current, Calc Current, Total Delta (₹ + %), color-coded

### 4. IndexedDB Backup & Restore
- **New buttons in Import tab**:
  - **Export IndexedDB Dump**: Download all holdings + scheme codes + NAV snapshots as JSON
  - **Import IndexedDB Dump**: Upload a previously exported JSON to restore all data
- Enables easy backup/restore and data migration between browsers/devices

### 5. Parser Enhancement
- `mfcCasParser.js` now captures the **Current Value** column from CAS XLSX
- Aggregates per scheme (across folios)
- Stores as `currentValueXls` on each holding

### 6. Data Storage in IndexedDB
Holdings now include:
```javascript
{
  amcName: "string",
  schemeName: "string",
  units: number,
  investedValue: number,
  currentValueXls: number  // ← NEW: from CAS file
}
```

---

## Usage Workflow

### Typical Import & Analysis
1. **Import Tab** → Upload CAS XLSX → Load Holdings
2. **Import Tab** → Map Scheme Codes (MFAPI auto-match)
3. **Scheme Codes Tab** → Review & fix wrong mappings (e.g., Direct vs Regular plans)
4. **Import Tab** → Fetch NAV Snapshots (latest prices)
5. **Reports Tab**:
   - **Scheme Report**: View all holdings + NAV returns
   - **AMC Summary**: Aggregate by fund house
   - **XLS vs Calc Comparison**: Spot any current-value discrepancies

### Backup Workflow
- **Import Tab** → **Export IndexedDB Dump** → save JSON file
- Later: **Import Tab** → **Import IndexedDB Dump** → restore from JSON

---

## Technical Notes

### Fixed Scheme Code Mappings
Portfolio comparison script (`tests/portfolio-compare.mjs`) includes manual overrides for known fuzzy-matcher failures:
- ABSL Large Cap (was picking Large & Mid Cap) → code 103174
- DSP Mid Cap (was picking Large & Mid Cap) → code 104481
- Axis Mid Cap (was picking Large & Mid Cap) → code 114564
- Franklin Large & Mid Cap (was picking Direct) → code 102884
- Kotak Bond Short Term (was picking full-duration) → code 101373
- Nippon India schemes (were picking Direct plans) → regular plan codes

### CSV Export
Download reports includes new sheet: **"XLS vs Calc Comparison"** with all per-scheme deltas.

---

## Files Modified
- `index.html` — Added Scheme Codes tab, totals sections, export/import UI
- `app/ui/appController.js` — Wired up scheme manager, export/import, totals rendering
- `app/infrastructure/parsers/mfcCasParser.js` — Captures currentValueXls
- `app/application/services/reportService.js` — Exposes valueDelta, valueDeltaPct
- `styles.css` — Added .report-totals-grid, .totals-card styles
- `README.md` — Documented new features

---

## Known Limitations

1. **Unclaimed IDCW accounts**: Placeholder accounts without live NAV are skipped in comparison (marked as "no NAV")
2. **Fuzzy matching**: Some older or renamed schemes may still need manual code correction
3. **IndexedDB export size**: Very large portfolios (10k+ holdings) may hit browser's JSON string limits; split exports if needed

---

Generated: April 29, 2026


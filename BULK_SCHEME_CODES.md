# Scheme Codes Bulk Management

## Download CSV

**Button**: "↓ Download CSV" in the Scheme Codes tab

### What it does
Exports all current scheme code mappings to a CSV file with three columns:
1. **Scheme Name** — The scheme name from your CAS file
2. **Scheme Code** — The currently mapped MFAPI scheme code
3. **API Scheme Name** — The official scheme name from MFAPI (for reference)

### Use Case
- Back up your scheme code mappings
- Share with team members
- Edit codes in bulk using a spreadsheet tool
- Import back using **Bulk Override from CSV**

### File Format
```csv
Scheme Name,Scheme Code,API Scheme Name
HDFC Arbitrage Fund - Regular Growth,105000,HDFC Arbitrage Fund - Regular Growth
Nippon India Pharma Fund - Growth Plan,102431,Nippon India Pharma Fund-Growth Plan-Growth Option
...
```

### Example Workflow
1. Click **↓ Download CSV** on Scheme Codes tab
2. Open the CSV file in Excel or Google Sheets
3. Keep column headers intact
4. Edit only the "Scheme Code" column with corrected codes
5. Save the file as CSV
6. Return to Scheme Codes tab
7. Click **↑ Bulk Override from CSV** and select the edited file
8. Review the status messages for success/failure feedback
9. Click **Refresh List** to reload from IndexedDB and verify

---

## Bulk Override from CSV

**Button**: "↑ Bulk Override from CSV" in the Scheme Codes tab

### What it does
1. Accepts a CSV file in the same format as the download
2. Parses each row and extracts scheme name and code
3. For each valid row:
   - Looks up the scheme in current holdings
   - Validates the scheme code against MFAPI (fetches scheme history)
   - If valid, saves to IndexedDB and updates the API scheme name
   - If invalid, records failure reason
4. Shows summary: `Bulk override: X code(s) saved. Skipped: Y row(s). Failed: Z row(s).`
5. Lists first 3 failures with line numbers and reasons
6. Auto-refreshes the scheme list after import

### CSV Requirements
- **Header row** must contain columns: `Scheme Name` and `Scheme Code`
- Other columns are optional but will be ignored
- Column names are case-insensitive (e.g., `scheme name` = `Scheme Name`)
- Scheme names must match holdings exactly (after normalization)
- Scheme codes must be valid MFAPI codes (validated against MFAPI)

### Valid CSV Examples

**Minimal CSV** (only required columns):
```csv
Scheme Name,Scheme Code
HDFC Arbitrage Fund - Regular Growth,105000
Nippon India Pharma Fund - Growth Plan,102431
```

**CSV with extra columns** (extra columns ignored):
```csv
Scheme Name,Scheme Code,API Scheme Name,Status
HDFC Arbitrage Fund - Regular Growth,105000,HDFC Arbitrage Fund - Regular Growth,verified
Nippon India Pharma Fund - Growth Plan,102431,Nippon India Pharma Fund-Growth Plan-Growth Option,verified
```

### Error Handling

| Error | Reason | Fix |
|-------|--------|-----|
| "Scheme Name" column not found | CSV header missing required column | Ensure header row has "Scheme Name" column |
| "Scheme Code" column not found | CSV header missing required column | Ensure header row has "Scheme Code" column |
| Skipped: blank rows | Row has empty Scheme Name or Code | Remove blank rows or fill in missing data |
| Line X: not found in holdings | Scheme name doesn't match any holdings | Verify spelling matches exactly (case-sensitive after normalization) |
| Line X: invalid code | Scheme code doesn't exist on MFAPI | Check code on https://api.mfapi.in/mf |

### Status Messages After Import

**Success Case**:
```
Bulk override: 67 code(s) saved. Skipped: 0 row(s). Failed: 0 row(s).
```

**Mixed Results**:
```
Bulk override: 65 code(s) saved. Skipped: 2 row(s). Failed: 1 row(s).
Failures: Line 12: Old Scheme Name (not found in holdings) | Line 45: Wrong Code (invalid code on MFAPI)
```

---

## Quick Start Workflow

### Scenario 1: Correct a Few Wrong Codes
1. Open Scheme Codes tab
2. Manually edit scheme codes using the inline inputs (one at a time)
3. Click Apply for each
4. When done, click Fetch NAV Snapshots on Import tab

### Scenario 2: Fix Many Wrong Codes at Once
1. Click **↓ Download CSV** on Scheme Codes tab
2. Open CSV in Excel
3. Edit the "Scheme Code" column for all incorrect mappings at once
4. Save as CSV
5. Click **↑ Bulk Override from CSV**
6. Select your edited CSV file
7. Review status and failures
8. Click **Refresh List** to verify
9. Click Fetch NAV Snapshots on Import tab to recompute values

### Scenario 3: Share Mappings with Team
1. Click **↓ Download CSV** on your app
2. Email the CSV to team members
3. They can review and edit codes in a spreadsheet
4. Return edited CSV to you
5. Import using **↑ Bulk Override from CSV**

---

## Tips & Tricks

### Validating Your CSV
Before uploading, ensure:
- No extra spaces in scheme names (they must match holdings exactly)
- All scheme codes are 5-6 digit numbers (e.g., 105000, 118665)
- CSV is saved as `.csv` format (not `.xlsx`)
- Header row uses exact column names: `Scheme Name`, `Scheme Code`

### Finding Correct Scheme Codes
If you don't know the correct code, visit:
https://api.mfapi.in/mf

Search by scheme name to find the correct `schemeCode`. Example:
```json
{
  "schemeCode": "102431",
  "schemeName": "Nippon India Pharma Fund-Growth Plan-Growth Option"
}
```

### After Bulk Override
Always run **Fetch NAV Snapshots** on the Import tab to:
- Refresh all valuations with latest NAV
- Ensure correct schemes are being priced

---

## Troubleshooting

**Q: Upload fails with "CSV must have 'Scheme Name' and 'Scheme Code' columns"**
- A: Check your CSV header row. Column names must be exact: `Scheme Name` and `Scheme Code` (case-insensitive)

**Q: Bulk override shows many failures with "not found in holdings"**
- A: Scheme names in CSV don't match your holdings. Verify spelling and use the exact names from the Download CSV

**Q: After bulk override, some codes show old values when I click Refresh List**
- A: The values shown are from the previous import. Click **Fetch NAV Snapshots** to recalculate with new codes

**Q: Can I upload a CSV from a different portfolio?**
- A: Only scheme names in your current holdings will be updated. Others are skipped silently.

---

Generated: April 29, 2026


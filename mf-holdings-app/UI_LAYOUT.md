# 🎨 UI Layout Guide — MF Holdings App

## Main Navigation (Tab Bar)
```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Import]  [Scheme Codes]  [Reports]                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Import Tab
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Import Mutual Fund Central XLSX                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  CAS File: [Choose File...]                                             │
│                                                                          │
│  [Load Holdings to IndexedDB]  [Map Scheme Codes]  [Fetch NAV Snapsho]  │
│  [Clear All IndexedDB Data]                                             │
│                                                                          │
│  Backup/Restore:                                                        │
│  [Export IndexedDB Dump]  [Import IndexedDB Dump]  [Browse File...]    │
│                                                                          │
│  Status: ✓ Loaded 69 holding(s)...                                      │
│  Error:  (if any)                                                       │
│                                                                          │
│  Holdings: 69              Mapped Codes: 67         NAV Snapshots: 67   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Scheme Codes Tab
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Scheme Code Manager                                                     │
│ Review and manually correct the MFAPI scheme code mapped to each        │
│ holding. After updating, click Fetch NAV Snapshots on the Import tab   │
│ to refresh valuations.                                                  │
│                                                                          │
│  [Refresh List]                                                         │
│                                                                          │
│  Status: 67 holding(s) loaded.                                          │
│  Error:  (if any)                                                       │
├─────────────────────────────────────────────────────────────────────────┤
│ AMC Name │ Scheme Name │ Scheme Code │ API Scheme Name │ Score │ Action │
├──────────┼─────────────┼─────────────┼─────────────────┼───────┼────────┤
│ HDFC Mutual│ HDFC Arb... │ [105000___]│ HDFC Arbitrage F│ 1.00  │[Apply] │
│            │            │            │                 │       │ ✓ Saved│
│ ABSL Mutual│ ABSL Large │ [103174___]│ ABSL Large Cap  │ 1.00  │[Apply] │
│            │            │            │                 │       │ ✗ Error│
│ DSP Mutual │ DSP Mid Cap│ [104481___]│ DSP Midcap Fund │ 1.00  │[Apply] │
│            │            │            │                 │       │ ⏳ Busy │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Reports Tab → Scheme Report
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Scheme Report  [Scheme Report] [AMC Summary] [AMC Dist] [XLS vs Calc]   │
├─────────────────────────────────────────────────────────────────────────┤
│ TOTALS SUMMARY                                                          │
│ ┌──────────────────┬──────────────────┬──────────────────┬──────────┐  │
│ │Total Invested    │Total Current     │Total Returns     │Returns % │  │
│ │38,500,000.00     │52,000,000.00     │13,500,000.00     │35.06%    │  │
│ │ (Blue)           │ (Blue)           │ (Green)          │ (Green)  │  │
│ └──────────────────┴──────────────────┴──────────────────┴──────────┘  │
│                                                                          │
│  [Refresh Report]                                                       │
│  Status: Report refreshed: 69/69 row(s) visible.                        │
├─────────────────────────────────────────────────────────────────────────┤
│ AMC Name │ Scheme Name │ Code │ Invested│ Units │ Latest NAV │ Current │
├──────────┼─────────────┼──────┼─────────┼───────┼────────────┼─────────┤
│ HDFC     │ HDFC Arb... │100... │ 50,000 │1,500 │ 100.50     │ 150,750 │
│ ABSL     │ ABSL Large  │103... │ 60,000 │  250 │ 900.50     │ 225,125 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Reports Tab → AMC Summary
```
┌─────────────────────────────────────────────────────────────────────────┐
│ AMC Level Summary                                                       │
├─────────────────────────────────────────────────────────────────────────┤
│ TOTALS SUMMARY                                                          │
│ ┌──────────────────┬──────────────────┬──────────────────┬──────────┐  │
│ │Total Invested    │Total Current     │Total Returns     │Returns % │  │
│ │38,500,000.00     │52,000,000.00     │13,500,000.00     │35.06%    │  │
│ └──────────────────┴──────────────────┴──────────────────┴──────────┘  │
│                                                                          │
│ AMC Filter: [Search AMC...]  Returns: [All ▼]  Top N: [All ▼]          │
│                                                                          │
│ [Bar Chart: Invested | Current | Returns]                              │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ AMC Name │ Invested Val │ Current Val │ Returns │ Returns % │ Schemes  │
├──────────┼──────────────┼─────────────┼─────────┼───────────┼──────────┤
│ HDFC     │ 10,000,000   │ 15,000,000  │ 5,000,0 │ 50.00%    │ 12       │
│ ABSL     │ 8,000,000    │ 10,000,000  │ 2,000,0 │ 25.00%    │ 8        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Reports Tab → XLS vs Calc Comparison
```
┌─────────────────────────────────────────────────────────────────────────┐
│ XLS vs Calculated Current Value                                         │
│ Compares the current value recorded in the imported CAS file against   │
│ the value calculated from the latest NAV (MFAPI) × units.             │
├─────────────────────────────────────────────────────────────────────────┤
│ TOTALS SUMMARY                                                          │
│ ┌──────────────┬──────────────┬──────────────┬──────────┬───────────┐  │
│ │Total Invested│Total XLS Curr│Total Calc    │Total Δ   │Δ %        │  │
│ │38,500,000.00 │52,000,000.00 │52,001,865.60 │ 1,865.60 │  0.00%   │  │
│ │              │              │              │ (Green)  │ (Green)  │  │
│ └──────────────┴──────────────┴──────────────┴──────────┴───────────┘  │
│                                                                          │
│  [Refresh Comparison]                                                   │
│  Status: 67 scheme(s) | 0 with delta > ₹1                              │
├─────────────────────────────────────────────────────────────────────────┤
│ AMC │ Scheme Name │ Code │ Invested │ Units │ XLS Current │ Calc Curr │
├─────┼─────────────┼──────┼──────────┼───────┼─────────────┼───────────┤
│ HDFc│ HDFC Arb... │100...│  50,000  │1,500 │ 150,000.00  │ 150,750.0 │
│     │             │      │          │      │ (+750.00)   │ (Green)   │
│ ABSL│ ABSL Large  │103...│  60,000  │  250 │ 225,000.00  │ 225,125.0 │
│     │             │      │          │      │ (+125.00)   │ (Green)   │
└─────┴─────────────┴──────┴──────────┴───────┴─────────────┴───────────┘
```

---

## Color Scheme

### Card/Panel Colors
- **Background**: `#0f1420` (dark navy)
- **Panel**: `#182132` (slightly lighter)
- **Border**: `#2b3a53` (muted blue)
- **Text**: `#dde7f4` (light grey-blue)
- **Muted**: `#9ab0cb` (dim blue)
- **Accent**: `#45a6ff` (bright blue)

### Delta/Status Colors
- **Positive Return**: `#4bd37b` (green)
- **Negative Return**: `#ff7a8a` (red)
- **Neutral/Zero**: `#9ab0cb` (muted)
- **Button Hover**: Darker shade of current color

### Status Indicators
- ✓ **Saved** (green)
- ✗ **Error** (red)
- ⏳ **Fetching** (muted)

---

## Form Elements

### Input Fields
```
Label:
[Input field with placeholder]
```
Example:
```
Scheme Code:
[100377________________] (placeholder: e.g. 100377)
```

### Buttons
```
Primary Action:   [Load Holdings to IndexedDB]  (Blue background)
Secondary Action: [Map Scheme Codes]            (Dark background)
Danger Action:    [Clear All IndexedDB Data]    (Dark background)
```

### Tables
- Header: Dark background with white text
- Alternating rows: None (single background)
- Numeric columns: Right-aligned, monospace font
- Sortable headers: Clickable with ↑/↓ indicators
- Filter inputs: Per column, below header

### Totals Cards
```
┌────────────────────┐
│ Total Invested     │
│ Value Label        │
├────────────────────┤
│  38,500,000.00     │
│ (Large blue text)  │
└────────────────────┘
```

---

## Responsive Behavior

### Desktop (>960px)
- 3-column tab bar
- Full-width tables (horizontal scroll if needed)
- Side-by-side pie charts

### Tablet (600-960px)
- Tabs wrap (may show 2 lines)
- Tables horizontal scroll on smaller screen
- Pie charts stack vertically

### Mobile (<600px)
- Tabs stack vertically
- Tables heavily scrolled
- Full-width cards

---

## Keyboard Navigation

- **Tab**: Move through buttons, inputs, table cells
- **Enter**: Activate button, submit form
- **Space**: Toggle select inputs
- **Arrow keys**: Navigate table rows (if implemented)
- **Ctrl+S / Cmd+S**: Export (can be implemented later)

---

## Accessibility

- **ARIA labels**: All interactive elements
- **Semantic HTML**: `<table>`, `<button>`, `<input>`
- **Color not only**: Status indicated by text (✓/✗) + color
- **Focus visible**: Tab order logical
- **Screen reader**: Table structure preserved, status messages live regions

---

Generated: April 29, 2026


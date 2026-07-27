# js/engine/ — domain math (no UI)

Pure calculation / validation used by services. Prefer no repository imports (or minimal read-free helpers).

| File | Domain |
|------|--------|
| `accountingEngine.js` | Double-entry validation, voucher line totals |
| `inventoryEngine.js` | Weighted-average stock buckets |
| `taxEngine.js` | Tax amount calc + period summaries |
| `reportingEngine.js` | TB, P&L, BS, ledger, day book, cash flow, accounts summary |
| `personalFinanceEngine.js` | Net worth, cashflow metrics, budget variance, goals |

## Rules

- Money: use `js/utils/money.js` (`roundMoney`).
- Reports must derive from openings + voucher lines (no stored report totals).
- Keep engines testable: inputs in, structures out.

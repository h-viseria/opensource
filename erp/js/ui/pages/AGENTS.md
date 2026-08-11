# js/ui/pages/ — route screens

Each file exports `renderX(ctx, outlet, hooks?)`. Register in `js/routes.js`.

## Patterns

- Load session via `bookService.getSessionContext()`; show muted message if book/FY missing when required.
- Build HTML strings; bind listeners after `outlet.innerHTML = …`.
- Use `formModal` / `confirmModal` for CRUD popups; `showToast` for feedback.
- Deep links: prefer hub children in `layout.js` NAV over many top-level items.

## Notable pages

| Area | Files |
|------|--------|
| Books / settings / guide | `books.js`, `settings.js`, `driveActivityCompare.js`, `userGuide.js`, `portfolio.js`, `dashboard.js` |
| Masters | `masters.js`, `chartOfAccounts.js`, `ledgerGroups.js`, `ledgers.js`, `gnuCashImport.js` |
| Vouchers | `transactions.js`, `voucherList.js`, `voucherForm.js` |
| Invoices | `invoices.js`, `invoiceForm.js`, `invoiceDetail.js`, `invoiceReturn.js`, `invoiceTemplates.js` |
| Inventory | `inventory.js`, `catalogueTypes.js`, `inventoryItems.js`, `inventoryMovements.js`, … |
| Tax / finance | `tax.js`, `taxCodes.js`, `finance.js`, `budgets.js`, `goals.js` |
| Reports | `trialBalance.js`, `profitAndLoss.js`, `balanceSheet.js`, `ledgerReport.js`, `ledgerDetailReport.js`, `accountSummary.js`, … |

## User Guide

`userGuide.js` documents screens for end users. When adding a screen, add a section + TOC entry and an “Open screen” link.

import assert from 'node:assert/strict';
import { parseAccounts, parseTransactions, dedupeMirroredTransactions } from '../js/csv-parser.js';
import { signedEffect, signedEffectAsTarget } from '../js/models.js';
import { buildTrialBalance, buildProfitAndLoss, buildAssetClassification, buildAssetPieData, buildBankAccountSummaryReport } from '../js/reports-core.js';
import { parseHdfcCsv } from '../js/import-hdfc.js';
import { parseGnuCashCsv } from '../js/import-gnucash.js';
import { normalizeAccountTypeLabel } from '../js/models.js';
import { flattenHierarchy } from '../js/reports-core.js';
import { mergeTransactionUpdates } from '../js/ui-update-transactions.js';

const coaCsv = `Opening Date,Account Name,Description,Account ShortCode,Full Account Name,Account Type,Opening Balance
01-Apr-2026,Assets,Top group,AST,Assets,Asset,0
01-Apr-2026,Savings Bank,Bank account,SAV,Assets:Savings Bank,Asset,1000
01-Apr-2026,Salary Income,Salary receipts,SAL,Income:Salary Income,Income,0
01-Apr-2026,Income,Top group,INC,Income,Income,0`;

const txCsv = `Main Account,Transaction Date,Value Date,Description,Comments1,Comments2,Deposit Amount,Withdrawal Amount,Target Account
SAV,20-apr-2026,20-Apr-2026,Salary credit,Monthly salary,C1,5000,0,SAL
SAV,21-Apr-2026,21-Apr-2026,ATM withdrawal,Self,Cash,0,200,EXP`;

const accounts = parseAccounts(coaCsv);
assert.equal(accounts.length, 4);
assert.equal(accounts[1].shortCode, 'SAV');
assert.equal(accounts[1].type, 'Asset');
assert.equal(accounts[1].parentShortCode, 'AST');

const coaCsvReordered = `Extra Col,Account Type,Opening Balance,Full Account Name,Description,Account Name,Opening Date,Account ShortCode
ignore,Asset,0,Assets,Top group,Assets,01-Apr-2026,AST
ignore,Asset,1000,Assets:Savings Bank,Bank account,Savings Bank,01-Apr-2026,SAV`;
const accountsReordered = parseAccounts(coaCsvReordered);
assert.equal(accountsReordered.length, 2);
assert.equal(accountsReordered[1].shortCode, 'SAV');
assert.equal(accountsReordered[1].parentShortCode, 'AST');

const coaExpandedTypes = `Opening Date,Account Name,Description,Account ShortCode,Full Account Name,Account Type,Opening Balance
01-Apr-2026,Assets,Root,AST,Assets,Asset,0
01-Apr-2026,Liabilities,Root,LIA,Liabilities,Liability,0
01-Apr-2026,Bank,Bank account,BANK,Assets:Bank,CASH / BANK,100
01-Apr-2026,Card Outstanding,Credit card due,CC,Liabilities:Credit Card,CREDIT (Card),200`;
const expanded = parseAccounts(coaExpandedTypes);
assert.equal(expanded[2].type, 'Asset');
assert.equal(expanded[3].type, 'Liability');

const transactions = parseTransactions(txCsv);
assert.equal(transactions.length, 2);
assert.equal(transactions[0].transactionDate, '20-Apr-2026');

assert.equal(signedEffect('Asset', 100, 0), 100);
assert.equal(signedEffect('Asset', 0, 50), -50);
assert.equal(signedEffect('Income', 100, 0), -100);
assert.equal(signedEffect('Income', 0, 50), 50);
assert.equal(signedEffectAsTarget('Asset', 100, 0), -100);

let invalidDateError = false;
try {
    parseTransactions(`Main Account,Transaction Date,Value Date,Description,Comments1,Comments2,Deposit Amount,Withdrawal Amount,Target Account
SAV,2026-04-20,20-Apr-2026,Bad date,,,,0,0,TGT`);
} catch (e) {
    invalidDateError = true;
}
assert.equal(invalidDateError, true);

const leafAccounts = [
    { shortCode: 'SAV', name: 'Savings Bank', type: 'Asset', description: 'Bank account', balance: 5800 },
    { shortCode: 'SAL', name: 'Salary', type: 'Income', description: 'Monthly salary', balance: 5000 },
    { shortCode: 'FOOD', name: 'Food', type: 'Expense', description: 'Groceries', balance: 1200 },
];

const tb = buildTrialBalance(leafAccounts);
assert.equal(tb.totalDebit, 7000);
assert.equal(tb.totalCredit, 5000);

const pl = buildProfitAndLoss(leafAccounts);
assert.equal(pl.totalIncome, 5000);
assert.equal(pl.totalExpense, 1200);
assert.equal(pl.netProfit, 3800);

const assetClass = buildAssetClassification(leafAccounts);
assert.equal(assetClass.totals['Current Assets'], 5800);

const mirrored = dedupeMirroredTransactions([
    {
        mainAccount: 'SAV', targetAccount: 'CASH',
        transactionDate: '10-Apr-2026', valueDate: '10-Apr-2026',
        description: 'ATM', comments1: 'A', comments2: 'B',
        depositAmount: 0, withdrawalAmount: 300
    },
    {
        mainAccount: 'CASH', targetAccount: 'SAV',
        transactionDate: '10-Apr-2026', valueDate: '10-Apr-2026',
        description: 'ATM', comments1: 'A', comments2: 'B',
        depositAmount: 300, withdrawalAmount: 0
    }
]);
assert.equal(mirrored.length, 1);

console.log('Smoke tests passed.');

// ─── HDFC parser tests ─────────────────────────────────────────────────────
const hdfcCsv = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Account,Extra Col
05/04/2026,Salary April,REF001,05/04/2026,,50000.00,Income:Salary Income,ignored
07/04/26,ATM Withdrawal,REF002,07/04/26,3000.00,,Assets:Current Assets:Cash in Hand,ignored`;

const hdfcTx = parseHdfcCsv(hdfcCsv);
assert.equal(hdfcTx.length, 2);
assert.equal(hdfcTx[0].transactionDate, '05-Apr-2026');
assert.equal(hdfcTx[0].valueDate, '05-Apr-2026');
assert.equal(hdfcTx[0].description, 'Salary April');
assert.equal(hdfcTx[0].comments1, 'REF001');
assert.equal(hdfcTx[0].depositAmount, 50000);
assert.equal(hdfcTx[0].withdrawalAmount, 0);
assert.equal(hdfcTx[0].targetFullName, 'Income:Salary Income');
assert.equal(hdfcTx[1].transactionDate, '07-Apr-2026');
assert.equal(hdfcTx[1].withdrawalAmount, 3000);
assert.equal(hdfcTx[1].depositAmount, 0);

// reordered headers + TSV with preamble lines
const hdfcTsv = `Account Name\tBank of India
Period\t01-Apr-2026 to 30-Apr-2026
Date\tNarration\tValue Dt\tWithdrawal Amt.\tDeposit Amt.\tChq./Ref.No.\tAccount
10/04/2026\tGroceries\t10/04/2026\t1200.00\t\tREF003\tExpenses:Food Expense`;

const hdfcTsvTx = parseHdfcCsv(hdfcTsv);
assert.equal(hdfcTsvTx.length, 1);
assert.equal(hdfcTsvTx[0].transactionDate, '10-Apr-2026');
assert.equal(hdfcTsvTx[0].withdrawalAmount, 1200);
assert.equal(hdfcTsvTx[0].comments1, 'REF003');

console.log('HDFC parser tests passed.');

const gnuCsv = `Date,Transaction Unique ID,Description,Notes,Memo,Full Account,Amount Num.
04/05/2026,TXN1,Salary,Payroll,M1,Assets:Current Assets:Savings Bank,5000
04/05/2026,TXN1,Salary,Payroll,M1,Income:Salary,-5000
04/06/26,TXN2,Rent,Home,M2,Expenses:Rent,-1200
04/06/26,TXN2,Rent,Home,M2,Assets:Current Assets:Savings Bank,1200`;

const gnuRows = parseGnuCashCsv(gnuCsv);
assert.equal(gnuRows.length, 4);
assert.equal(gnuRows[0].transactionDate, '05-Apr-2026');
assert.equal(gnuRows[0].transactionId, 'TXN1');
assert.equal(gnuRows[0].fullAccount, 'Assets:Current Assets:Savings Bank');
assert.equal(gnuRows[0].amount, 5000);

// Bracket notation: (1,234.56) should parse as -1234.56
const gnuBracket = parseGnuCashCsv(`Date,Transaction Unique ID,Description,Notes,Memo,Full Account,Amount Num.
04/05/2026,TXN9,Test,,, Assets:Bank,(1234.56)
04/05/2026,TXN9,Test,,,Income:Salary,1234.56`);
assert.equal(gnuBracket[0].amount, -1234.56);
assert.equal(gnuBracket[1].amount, 1234.56);

const gnuSplit = parseGnuCashCsv(`Date,Transaction Unique ID,Description,Notes,Memo,Full Account,Amount Num.
04/10/2026,TXSPLIT,Split test,N1,M1,Assets:Current Assets:Bank,5
04/10/2026,TXSPLIT,Split test,N1,M1,Expenses:Food,-2
04/10/2026,TXSPLIT,Split test,N1,M1,Expenses:Rent,-2
04/10/2026,TXSPLIT,Split test,N1,M1,Expenses:Tax,-1`);
assert.equal(gnuSplit.length, 4);
assert.equal(gnuSplit.filter(r => r.transactionId === 'TXSPLIT').length, 4);

assert.equal(normalizeAccountTypeLabel('Credit'), 'Liability');

const hierarchyRoots = [{
    shortCode: 'AST',
    name: 'Assets',
    type: 'Asset',
    aggregateBalance: 100,
    children: [
        { shortCode: 'ZERO', name: 'Zero Leaf', type: 'Asset', aggregateBalance: 0, children: [] },
        { shortCode: 'NZ', name: 'Non Zero Leaf', type: 'Asset', aggregateBalance: 100, children: [] },
    ],
}];
const flattened = flattenHierarchy(hierarchyRoots, () => true);
assert.equal(flattened.some((r) => r.shortCode === 'ZERO'), true);

const pieRoots = [{
    shortCode: 'AST',
    name: 'Assets',
    type: 'Asset',
    aggregateBalance: 700,
    children: [
        {
            shortCode: 'CUR',
            name: 'Current Assets',
            type: 'Asset',
            aggregateBalance: 500,
            children: [
                { shortCode: 'SAV', name: 'Savings', type: 'Asset', aggregateBalance: 300, children: [] },
                { shortCode: 'CASH', name: 'Cash', type: 'Asset', aggregateBalance: 200, children: [] },
            ],
        },
        {
            shortCode: 'FIX',
            name: 'Fixed Assets',
            type: 'Asset',
            aggregateBalance: 200,
            children: [
                { shortCode: 'EQP', name: 'Equipment', type: 'Asset', aggregateBalance: 200, children: [] },
            ],
        },
    ],
}];
const pieData = buildAssetPieData(pieRoots);
assert.equal(pieData.total, 700);
assert.equal(pieData.levels.length, 3);
assert.equal(pieData.levels[0].total, 700);
assert.equal(pieData.levels[1].total, 700);
assert.equal(pieData.levels[2].total, 700);

const existingTx = [
    { id: 101, mainAccount: 'SAV', description: 'old-a', depositAmount: 10, withdrawalAmount: 0 },
    { id: 102, mainAccount: 'SAV', description: 'old-b', depositAmount: 0, withdrawalAmount: 5 },
    { id: 103, mainAccount: 'SAL', description: 'old-c', depositAmount: 12, withdrawalAmount: 0 },
];
const visibleUpdates = [
    { id: 102, mainAccount: 'SAV', description: 'edited-b', depositAmount: 2, withdrawalAmount: 0 },
];
const mergedTx = mergeTransactionUpdates(existingTx, visibleUpdates);
assert.equal(mergedTx.length, 3);
assert.equal(mergedTx.find((t) => t.id === 101).description, 'old-a');
assert.equal(mergedTx.find((t) => t.id === 102).description, 'edited-b');
assert.equal(mergedTx.find((t) => t.id === 103).description, 'old-c');

const summaryAccounts = [
    { shortCode: 'SAV', name: 'Savings', fullAccountName: 'Assets:Bank:Savings', type: 'Asset', openingBalance: 1000 },
    { shortCode: 'SAL', name: 'Salary', fullAccountName: 'Income:Salary', type: 'Income', openingBalance: 0 },
    { shortCode: 'CASH', name: 'Cash', fullAccountName: 'Assets:Cash', type: 'Asset', openingBalance: 100 },
    { shortCode: 'FOOD', name: 'Food', fullAccountName: 'Expenses:Food', type: 'Expense', openingBalance: 0 },
];
const summaryTx = [
    { mainAccount: 'SAV', targetAccount: 'SAL', valueDate: '25-Mar-2026', transactionDate: '25-Mar-2026', description: 'Prev FY salary', comments1: '', comments2: '', depositAmount: 500, withdrawalAmount: 0 },
    { mainAccount: 'SAV', targetAccount: 'SAL', valueDate: '10-Apr-2026', transactionDate: '10-Apr-2026', description: 'Salary', comments1: '', comments2: '', depositAmount: 2000, withdrawalAmount: 0 },
    { mainAccount: 'SAV', targetAccount: 'FOOD', valueDate: '11-Apr-2026', transactionDate: '11-Apr-2026', description: 'Groceries', comments1: '', comments2: '', depositAmount: 0, withdrawalAmount: 300 },
    { mainAccount: 'CASH', targetAccount: 'SAV', valueDate: '12-Apr-2026', transactionDate: '12-Apr-2026', description: 'Cash deposit', comments1: '', comments2: '', depositAmount: 400, withdrawalAmount: 0 },
];
const bankSummary = buildBankAccountSummaryReport({
    accountCode: 'SAV',
    accounts: summaryAccounts,
    transactions: summaryTx,
    financialYear: '2026-2027',
});
assert.equal(bankSummary.openingBalance, 1500);
assert.equal(bankSummary.depositTotal, 2000);
assert.equal(bankSummary.withdrawalTotal, 700);
assert.equal(bankSummary.remainingBalance, 2800);
assert.equal(bankSummary.deposits.length >= 1, true);
assert.equal(bankSummary.withdrawals.length >= 1, true);
const depIncomeGroup = bankSummary.deposits.find((g) => g.label === 'Income');
assert.equal(!!depIncomeGroup, true);
assert.equal(depIncomeGroup.counterGroups.length, 1);
assert.equal(depIncomeGroup.counterGroups[0].subtotal, 2000);
const wAssetGroup = bankSummary.withdrawals.find((g) => g.label === 'Assets');
const wExpenseGroup = bankSummary.withdrawals.find((g) => g.label === 'Expenses');
assert.equal(!!wAssetGroup, true);
assert.equal(!!wExpenseGroup, true);
assert.equal(wAssetGroup.counterGroups[0].subtotal, 400);
assert.equal(wExpenseGroup.counterGroups[0].subtotal, 300);


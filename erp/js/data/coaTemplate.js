/**
 * Default Chart of Accounts template — master specification section 7.
 * Roots = primary groups by nature; children = sub-groups; ledgers = default accounts.
 */

import { ACCOUNT_NATURES } from '../core/accountTypes.js';

/**
 * @typedef {{ name: string, code?: string, ledgers?: string[] }} CoaSubGroup
 * @typedef {{ name: string, nature: string, code: string, children: CoaSubGroup[] }} CoaRoot
 */

/** @type {CoaRoot[]} */
export const DEFAULT_COA_TEMPLATE = [
  {
    name: 'Assets',
    nature: ACCOUNT_NATURES.ASSET,
    code: '1000',
    children: [
      { name: 'Cash', code: '1100', ledgers: ['Cash in Hand'] },
      { name: 'Bank', code: '1200', ledgers: ['Bank Account'] },
      { name: 'Receivables', code: '1300', ledgers: ['Accounts Receivable'] },
      { name: 'Inventory', code: '1400', ledgers: ['Stock'] },
      { name: 'Investments', code: '1500', ledgers: ['Investments'] },
      { name: 'Fixed Assets', code: '1600', ledgers: ['Furniture & Fixtures', 'Computer Equipment'] },
      { name: 'Tax Receivable', code: '1700', ledgers: ['Input Tax'] },
    ],
  },
  {
    name: 'Liabilities',
    nature: ACCOUNT_NATURES.LIABILITY,
    code: '2000',
    children: [
      { name: 'Payables', code: '2100', ledgers: ['Accounts Payable'] },
      { name: 'Loans', code: '2200', ledgers: ['Loan Account'] },
      { name: 'Credit Cards', code: '2300', ledgers: ['Credit Card'] },
      { name: 'Tax Payable', code: '2400', ledgers: ['Tax Payable', 'Output Tax'] },
    ],
  },
  {
    name: 'Equity',
    nature: ACCOUNT_NATURES.EQUITY,
    code: '3000',
    children: [
      { name: 'Capital', code: '3100', ledgers: ['Owner Capital'] },
      { name: 'Retained Earnings', code: '3200', ledgers: ['Retained Earnings'] },
    ],
  },
  {
    name: 'Income',
    nature: ACCOUNT_NATURES.INCOME,
    code: '4000',
    children: [
      { name: 'Sales', code: '4100', ledgers: ['Sales'] },
      { name: 'Service Revenue', code: '4200', ledgers: ['Service Revenue'] },
      { name: 'Salary', code: '4300', ledgers: ['Salary Income'] },
      { name: 'Interest Income', code: '4400', ledgers: ['Interest Income'] },
      { name: 'Dividend Income', code: '4500', ledgers: ['Dividend Income'] },
    ],
  },
  {
    name: 'Expense',
    nature: ACCOUNT_NATURES.EXPENSE,
    code: '5000',
    children: [
      { name: 'Rent', code: '5100', ledgers: ['Rent Expense'] },
      { name: 'Utilities', code: '5200', ledgers: ['Utilities Expense'] },
      { name: 'Fuel', code: '5300', ledgers: ['Fuel Expense'] },
      { name: 'Groceries', code: '5400', ledgers: ['Groceries'] },
      { name: 'Travel', code: '5500', ledgers: ['Travel Expense'] },
      { name: 'Insurance', code: '5600', ledgers: ['Insurance Expense'] },
      { name: 'Medical', code: '5700', ledgers: ['Medical Expense'] },
      {
        name: 'Cost of Sales',
        code: '5800',
        ledgers: ['Cost of Goods Sold', 'Stock Adjustment'],
      },
    ],
  },
];

/**
 * Book industry templates — Chart of Accounts (+ optional catalogue) presets.
 * Used when creating a new book.
 */

import { ACCOUNT_NATURES } from '../core/accountTypes.js';
import { DEFAULT_COA_TEMPLATE } from './coaTemplate.js';

/**
 * @typedef {{ name: string, code?: string, ledgers?: string[] }} CoaSubGroup
 * @typedef {{ name: string, nature: string, code: string, children: CoaSubGroup[] }} CoaRoot
 * @typedef {{
 *   key: string,
 *   label: string,
 *   required?: boolean,
 *   options?: string[],
 * }} CatalogueExtra
 * @typedef {{
 *   name: string,
 *   code: string,
 *   extras?: CatalogueExtra[],
 * }} CatalogueTypeDef
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   coa: CoaRoot[],
 *   catalogueTypes?: CatalogueTypeDef[],
 *   categories?: { name: string, code: string }[],
 *   units?: { name: string, code: string, symbol: string }[],
 * }} BookTemplate
 */

/** @type {CatalogueTypeDef[]} */
const CATALOGUE_GENERAL = [
  {
    name: 'General merchandise',
    code: 'GEN',
    extras: [{ key: 'colour', label: 'Colour', required: false, options: [] }],
  },
];

/** @type {CatalogueTypeDef[]} */
const CATALOGUE_TEXTILE = [
  {
    name: 'Fabric',
    code: 'FAB',
    extras: [
      { key: 'colour', label: 'Colour', required: true, options: [] },
      { key: 'width', label: 'Width', required: false, options: [] },
    ],
  },
  {
    name: 'Garment',
    code: 'GAR',
    extras: [
      { key: 'colour', label: 'Colour', required: true, options: [] },
      { key: 'fit', label: 'Fit', required: false, options: ['Regular', 'Slim', 'Relaxed'] },
    ],
  },
  {
    name: 'Accessory',
    code: 'ACC',
    extras: [{ key: 'colour', label: 'Colour', required: false, options: [] }],
  },
];

/** @type {CatalogueTypeDef[]} */
const CATALOGUE_ELECTRONICS = [
  {
    name: 'Device',
    code: 'DEV',
    extras: [
      { key: 'colour', label: 'Colour', required: false, options: [] },
      { key: 'model', label: 'Model', required: false, options: [] },
    ],
  },
  {
    name: 'Accessory',
    code: 'ACC',
    extras: [
      { key: 'colour', label: 'Colour', required: false, options: [] },
      { key: 'length', label: 'Length', required: false, options: [] },
    ],
  },
  {
    name: 'Spare part',
    code: 'SPR',
    extras: [{ key: 'model', label: 'Compatible model', required: false, options: [] }],
  },
];

/** @type {CatalogueTypeDef[]} */
const CATALOGUE_GROCERY = [
  {
    name: 'Packaged goods',
    code: 'PKG',
    extras: [{ key: 'pack', label: 'Pack size', required: false, options: [] }],
  },
  {
    name: 'Fresh produce',
    code: 'FRH',
    extras: [{ key: 'grade', label: 'Grade', required: false, options: ['A', 'B', 'C'] }],
  },
  {
    name: 'Dairy & frozen',
    code: 'DRY',
    extras: [{ key: 'pack', label: 'Pack size', required: false, options: [] }],
  },
];

/** @type {CatalogueTypeDef[]} */
const CATALOGUE_RESTAURANT = [
  {
    name: 'Menu item',
    code: 'MNU',
    extras: [
      {
        key: 'course',
        label: 'Course',
        required: false,
        options: ['Starter', 'Main', 'Dessert', 'Beverage'],
      },
    ],
  },
  {
    name: 'Ingredient',
    code: 'ING',
    extras: [{ key: 'unit_hint', label: 'Stock unit', required: false, options: [] }],
  },
];

/** @type {CatalogueTypeDef[]} */
const CATALOGUE_PHARMACY = [
  {
    name: 'Medicine',
    code: 'MED',
    extras: [
      { key: 'strength', label: 'Strength', required: false, options: [] },
      {
        key: 'form',
        label: 'Form',
        required: false,
        options: ['Tablet', 'Syrup', 'Injection', 'Ointment'],
      },
    ],
  },
  {
    name: 'OTC / FMCG',
    code: 'OTC',
    extras: [{ key: 'pack', label: 'Pack', required: false, options: [] }],
  },
];

/**
 * Shared trading balance-sheet skeleton (cash, bank, AR/AP, stock, tax, capital).
 * @param {{ income: CoaSubGroup[], expense: CoaSubGroup[], extraAssets?: CoaSubGroup[], extraLiab?: CoaSubGroup[] }} parts
 * @returns {CoaRoot[]}
 */
function tradingChart(parts) {
  return [
    {
      name: 'Assets',
      nature: ACCOUNT_NATURES.ASSET,
      code: '1000',
      children: [
        { name: 'Cash', code: '1100', ledgers: ['Cash in Hand'] },
        { name: 'Bank', code: '1200', ledgers: ['Bank Account'] },
        { name: 'Receivables', code: '1300', ledgers: ['Accounts Receivable'] },
        { name: 'Inventory', code: '1400', ledgers: ['Stock'] },
        { name: 'Fixed Assets', code: '1600', ledgers: ['Furniture & Fixtures', 'Computer Equipment'] },
        { name: 'Tax Receivable', code: '1700', ledgers: ['Input Tax'] },
        ...(parts.extraAssets || []),
      ],
    },
    {
      name: 'Liabilities',
      nature: ACCOUNT_NATURES.LIABILITY,
      code: '2000',
      children: [
        { name: 'Payables', code: '2100', ledgers: ['Accounts Payable'] },
        { name: 'Loans', code: '2200', ledgers: ['Loan Account'] },
        { name: 'Tax Payable', code: '2400', ledgers: ['Tax Payable', 'Output Tax'] },
        ...(parts.extraLiab || []),
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
      children: parts.income,
    },
    {
      name: 'Expense',
      nature: ACCOUNT_NATURES.EXPENSE,
      code: '5000',
      children: [
        ...parts.expense,
        {
          name: 'Cost of Sales',
          code: '5800',
          ledgers: ['Cost of Goods Sold', 'Stock Adjustment'],
        },
        { name: 'Rent', code: '5100', ledgers: ['Rent Expense'] },
        { name: 'Utilities', code: '5200', ledgers: ['Utilities Expense'] },
        { name: 'Staff', code: '5300', ledgers: ['Salaries & Wages'] },
        { name: 'Transport', code: '5400', ledgers: ['Freight & Transport'] },
        { name: 'Admin', code: '5500', ledgers: ['Office Expenses', 'Bank Charges'] },
      ],
    },
  ];
}

/** @type {CoaRoot[]} */
const PERSONAL_COA = [
  {
    name: 'Assets',
    nature: ACCOUNT_NATURES.ASSET,
    code: '1000',
    children: [
      { name: 'Cash', code: '1100', ledgers: ['Cash in Hand'] },
      { name: 'Bank', code: '1200', ledgers: ['Salary Account', 'Savings Account'] },
      {
        name: 'Investments',
        code: '1500',
        ledgers: ['Mutual Funds', 'Stocks & Equity', 'Fixed Deposits'],
      },
      { name: 'Receivables', code: '1300', ledgers: ['Money Lent / Receivable'] },
      { name: 'Fixed Assets', code: '1600', ledgers: ['Vehicle', 'Electronics', 'Furniture'] },
    ],
  },
  {
    name: 'Liabilities',
    nature: ACCOUNT_NATURES.LIABILITY,
    code: '2000',
    children: [
      { name: 'Credit Cards', code: '2300', ledgers: ['Credit Card'] },
      {
        name: 'Loans',
        code: '2200',
        ledgers: ['Home Loan', 'Personal Loan', 'Vehicle Loan'],
      },
      { name: 'Other Payables', code: '2100', ledgers: ['Other Payables'] },
    ],
  },
  {
    name: 'Equity',
    nature: ACCOUNT_NATURES.EQUITY,
    code: '3000',
    children: [
      { name: 'Net Worth', code: '3100', ledgers: ['Opening Net Worth'] },
      { name: 'Retained Earnings', code: '3200', ledgers: ['Retained Earnings'] },
    ],
  },
  {
    name: 'Income',
    nature: ACCOUNT_NATURES.INCOME,
    code: '4000',
    children: [
      { name: 'Employment', code: '4100', ledgers: ['Salary Income'] },
      { name: 'Self-employment', code: '4200', ledgers: ['Freelance / Business Income'] },
      {
        name: 'Investments',
        code: '4300',
        ledgers: ['Interest Income', 'Dividend Income', 'Capital Gains'],
      },
      { name: 'Other', code: '4400', ledgers: ['Rental Income', 'Other Income'] },
    ],
  },
  {
    name: 'Expense',
    nature: ACCOUNT_NATURES.EXPENSE,
    code: '5000',
    children: [
      {
        name: 'Housing',
        code: '5100',
        ledgers: ['Rent / EMI', 'Society Maintenance', 'Home Repairs'],
      },
      {
        name: 'Living',
        code: '5200',
        ledgers: ['Groceries', 'Utilities', 'Internet & Phone'],
      },
      {
        name: 'Transport',
        code: '5300',
        ledgers: ['Fuel', 'Public Transport', 'Vehicle Maintenance'],
      },
      {
        name: 'Health & Education',
        code: '5400',
        ledgers: ['Medical Expense', 'Education / Courses'],
      },
      {
        name: 'Lifestyle',
        code: '5500',
        ledgers: ['Dining Out', 'Entertainment', 'Subscriptions', 'Shopping'],
      },
      {
        name: 'Insurance & Tax',
        code: '5600',
        ledgers: ['Insurance Premium', 'Income Tax'],
      },
      { name: 'Giving', code: '5700', ledgers: ['Donations & Gifts'] },
    ],
  },
];

/** @type {CoaRoot[]} */
const HOUSING_SOCIETY_COA = [
  {
    name: 'Assets',
    nature: ACCOUNT_NATURES.ASSET,
    code: '1000',
    children: [
      { name: 'Cash', code: '1100', ledgers: ['Petty Cash'] },
      {
        name: 'Bank',
        code: '1200',
        ledgers: ['Society Current Account', 'Sinking Fund Account', 'Reserve Fund Account'],
      },
      {
        name: 'Receivables',
        code: '1300',
        ledgers: ['Member Dues Receivable', 'Other Receivables'],
      },
      {
        name: 'Deposits',
        code: '1400',
        ledgers: ['Utility Deposits', 'Security Deposits Given'],
      },
      {
        name: 'Fixed Assets',
        code: '1600',
        ledgers: ['Common Equipment', 'Furniture & Fixtures', 'CCTV & Security Systems'],
      },
    ],
  },
  {
    name: 'Liabilities',
    nature: ACCOUNT_NATURES.LIABILITY,
    code: '2000',
    children: [
      {
        name: 'Payables',
        code: '2100',
        ledgers: ['Contractor Payable', 'Vendor Payable', 'Staff Payable'],
      },
      {
        name: 'Member Funds',
        code: '2200',
        ledgers: ['Sinking Fund Liability', 'Maintenance Deposit', 'Member Advances'],
      },
      { name: 'Loans', code: '2300', ledgers: ['Society Loan'] },
      { name: 'Tax Payable', code: '2400', ledgers: ['Tax Payable', 'TDS Payable'] },
    ],
  },
  {
    name: 'Equity',
    nature: ACCOUNT_NATURES.EQUITY,
    code: '3000',
    children: [
      { name: 'Corpus', code: '3100', ledgers: ['Corpus / Society Fund'] },
      { name: 'Reserves', code: '3200', ledgers: ['Reserve Fund', 'Surplus / Deficit'] },
    ],
  },
  {
    name: 'Income',
    nature: ACCOUNT_NATURES.INCOME,
    code: '4000',
    children: [
      {
        name: 'Member Charges',
        code: '4100',
        ledgers: [
          'Maintenance Charges',
          'Parking Charges',
          'Water Charges',
          'Transfer / NOC Fees',
        ],
      },
      {
        name: 'Other Income',
        code: '4200',
        ledgers: [
          'Interest Income',
          'Rental of Common Amenities',
          'Penalty / Late Fees',
          'Other Income',
        ],
      },
    ],
  },
  {
    name: 'Expense',
    nature: ACCOUNT_NATURES.EXPENSE,
    code: '5000',
    children: [
      {
        name: 'Operations',
        code: '5100',
        ledgers: [
          'Security Expense',
          'Housekeeping',
          'Gardening',
          'Common Electricity',
          'Common Water',
          'Diesel / Generator',
        ],
      },
      {
        name: 'Maintenance',
        code: '5200',
        ledgers: [
          'Repairs & Maintenance',
          'Lift AMC',
          'Fire Safety',
          'Plumbing & Electrical',
        ],
      },
      {
        name: 'Admin',
        code: '5300',
        ledgers: [
          'Manager / Staff Salary',
          'Professional Fees',
          'Insurance',
          'Printing & Stationery',
          'Bank Charges',
        ],
      },
    ],
  },
];

/** @type {BookTemplate[]} */
export const BOOK_TEMPLATES = [
  {
    id: 'general',
    name: 'General business',
    description: 'Balanced trading + personal chart — good default if you are unsure.',
    coa: DEFAULT_COA_TEMPLATE,
    catalogueTypes: [
      ...CATALOGUE_GENERAL,
      {
        name: 'Stationery',
        code: 'STAT',
        extras: [
          {
            key: 'colour',
            label: 'Colour',
            required: false,
            options: ['Blue', 'Black', 'Red', 'Green'],
          },
        ],
      },
      {
        name: 'Apparel',
        code: 'APP',
        extras: [
          { key: 'colour', label: 'Colour', required: true, options: [] },
          {
            key: 'fit',
            label: 'Fit',
            required: false,
            options: ['Regular', 'Slim', 'Relaxed'],
          },
        ],
      },
      {
        name: 'Electronics accessory',
        code: 'ELEC',
        extras: [
          { key: 'colour', label: 'Colour', required: false, options: [] },
          { key: 'length', label: 'Length', required: false, options: [] },
        ],
      },
    ],
  },
  {
    id: 'personal',
    name: 'Personal finance',
    description: 'Salary, investments, loans, and household spending — no shop inventory focus.',
    coa: PERSONAL_COA,
    catalogueTypes: [],
  },
  {
    id: 'housing_society',
    name: 'Housing society',
    description: 'Maintenance, sinking fund, member dues, contractors, and common-area costs.',
    coa: HOUSING_SOCIETY_COA,
    catalogueTypes: [],
  },
  {
    id: 'textile',
    name: 'Textile / garment shop',
    description: 'Fabric & garment sales, stitching income, and retail stock.',
    coa: tradingChart({
      income: [
        {
          name: 'Sales',
          code: '4100',
          ledgers: ['Fabric Sales', 'Garment Sales', 'Accessory Sales'],
        },
        {
          name: 'Services',
          code: '4200',
          ledgers: ['Stitching Charges', 'Alteration Charges'],
        },
        { name: 'Other', code: '4300', ledgers: ['Other Income'] },
      ],
      expense: [
        {
          name: 'Production',
          code: '5050',
          ledgers: ['Stitching Wages', 'Packaging Materials'],
        },
      ],
    }),
    catalogueTypes: CATALOGUE_TEXTILE,
    categories: [
      { name: 'Fabric', code: 'FAB' },
      { name: 'Garments', code: 'GAR' },
      { name: 'Accessories', code: 'ACC' },
    ],
    units: [
      { name: 'Numbers', code: 'NOS', symbol: 'Nos' },
      { name: 'Meter', code: 'MTR', symbol: 'm' },
      { name: 'Yard', code: 'YRD', symbol: 'yd' },
      { name: 'Kilogram', code: 'KG', symbol: 'Kg' },
      { name: 'Box', code: 'BOX', symbol: 'Box' },
    ],
  },
  {
    id: 'electronics',
    name: 'Electronics shop',
    description: 'Device & accessory sales, repair income, and warranty-related costs.',
    coa: tradingChart({
      income: [
        { name: 'Sales', code: '4100', ledgers: ['Product Sales', 'Accessory Sales'] },
        {
          name: 'Services',
          code: '4200',
          ledgers: ['Repair Service', 'Extended Warranty Income'],
        },
        { name: 'Other', code: '4300', ledgers: ['Other Income'] },
      ],
      expense: [
        {
          name: 'After-sales',
          code: '5050',
          ledgers: ['Warranty Expense', 'Installation Expense'],
        },
      ],
    }),
    catalogueTypes: CATALOGUE_ELECTRONICS,
    categories: [
      { name: 'Devices', code: 'DEV' },
      { name: 'Accessories', code: 'ACC' },
      { name: 'Spares', code: 'SPR' },
    ],
  },
  {
    id: 'grocery',
    name: 'Grocery shop',
    description: 'Retail grocery sales with wastage, packaging, and supplier payables.',
    coa: tradingChart({
      income: [
        { name: 'Sales', code: '4100', ledgers: ['Retail Sales', 'Wholesale Sales'] },
        { name: 'Other', code: '4300', ledgers: ['Other Income'] },
      ],
      expense: [
        {
          name: 'Store',
          code: '5050',
          ledgers: ['Spoilage & Wastage', 'Packaging', 'Cold Storage / Refrigeration'],
        },
      ],
    }),
    catalogueTypes: CATALOGUE_GROCERY,
    categories: [
      { name: 'Packaged', code: 'PKG' },
      { name: 'Fresh', code: 'FRH' },
      { name: 'Dairy & frozen', code: 'DRY' },
    ],
    units: [
      { name: 'Numbers', code: 'NOS', symbol: 'Nos' },
      { name: 'Kilogram', code: 'KG', symbol: 'Kg' },
      { name: 'Litre', code: 'LTR', symbol: 'L' },
      { name: 'Packet', code: 'PKT', symbol: 'Pkt' },
      { name: 'Box', code: 'BOX', symbol: 'Box' },
    ],
  },
  {
    id: 'restaurant',
    name: 'Restaurant / cafe',
    description: 'Food & beverage sales, kitchen costs, and dine-in operations.',
    coa: tradingChart({
      income: [
        {
          name: 'Sales',
          code: '4100',
          ledgers: ['Food Sales', 'Beverage Sales', 'Takeaway Sales', 'Catering Income'],
        },
        { name: 'Other', code: '4300', ledgers: ['Other Income'] },
      ],
      expense: [
        {
          name: 'Kitchen',
          code: '5050',
          ledgers: ['Kitchen Consumables', 'Gas & Fuel', 'Packaging'],
        },
      ],
    }),
    catalogueTypes: CATALOGUE_RESTAURANT,
    categories: [
      { name: 'Menu', code: 'MNU' },
      { name: 'Ingredients', code: 'ING' },
    ],
    units: [
      { name: 'Numbers', code: 'NOS', symbol: 'Nos' },
      { name: 'Kilogram', code: 'KG', symbol: 'Kg' },
      { name: 'Litre', code: 'LTR', symbol: 'L' },
      { name: 'Portion', code: 'POR', symbol: 'Por' },
    ],
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy / medical store',
    description: 'Medicine & OTC sales with expiry write-offs.',
    coa: tradingChart({
      income: [
        {
          name: 'Sales',
          code: '4100',
          ledgers: ['Medicine Sales', 'OTC Sales', 'Surgical Sales'],
        },
        { name: 'Other', code: '4300', ledgers: ['Other Income'] },
      ],
      expense: [
        {
          name: 'Compliance',
          code: '5050',
          ledgers: ['Expired Stock Write-off', 'License & Compliance'],
        },
      ],
    }),
    catalogueTypes: CATALOGUE_PHARMACY,
    categories: [
      { name: 'Medicines', code: 'MED' },
      { name: 'OTC', code: 'OTC' },
    ],
  },
  {
    id: 'freelancer',
    name: 'Professional / freelancer',
    description: 'Consulting and fee income with light operating expenses — no stock focus.',
    coa: [
      {
        name: 'Assets',
        nature: ACCOUNT_NATURES.ASSET,
        code: '1000',
        children: [
          { name: 'Cash', code: '1100', ledgers: ['Cash in Hand'] },
          { name: 'Bank', code: '1200', ledgers: ['Business Bank Account'] },
          { name: 'Receivables', code: '1300', ledgers: ['Accounts Receivable'] },
          {
            name: 'Fixed Assets',
            code: '1600',
            ledgers: ['Laptop & Equipment', 'Furniture'],
          },
          {
            name: 'Tax Receivable',
            code: '1700',
            ledgers: ['Input Tax', 'TDS Receivable'],
          },
        ],
      },
      {
        name: 'Liabilities',
        nature: ACCOUNT_NATURES.LIABILITY,
        code: '2000',
        children: [
          { name: 'Payables', code: '2100', ledgers: ['Accounts Payable'] },
          {
            name: 'Tax Payable',
            code: '2400',
            ledgers: ['Tax Payable', 'Output Tax', 'TDS Payable'],
          },
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
          {
            name: 'Professional fees',
            code: '4100',
            ledgers: ['Consulting Income', 'Project Fees', 'Retainership'],
          },
          { name: 'Other', code: '4200', ledgers: ['Interest Income', 'Other Income'] },
        ],
      },
      {
        name: 'Expense',
        nature: ACCOUNT_NATURES.EXPENSE,
        code: '5000',
        children: [
          {
            name: 'Operations',
            code: '5100',
            ledgers: [
              'Software & Tools',
              'Internet & Phone',
              'Office Rent',
              'Travel',
              'Marketing',
              'Subcontractor Fees',
              'Professional Development',
              'Bank Charges',
            ],
          },
        ],
      },
    ],
    catalogueTypes: [],
  },
];

export const DEFAULT_BOOK_TEMPLATE_ID = 'general';

/** @returns {BookTemplate[]} */
export function listBookTemplates() {
  return BOOK_TEMPLATES;
}

/**
 * @param {string} [id]
 * @returns {BookTemplate}
 */
export function getBookTemplate(id) {
  const key = String(id || DEFAULT_BOOK_TEMPLATE_ID).trim();
  return BOOK_TEMPLATES.find((t) => t.id === key) || BOOK_TEMPLATES[0];
}

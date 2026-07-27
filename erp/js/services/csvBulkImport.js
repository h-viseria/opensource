/**
 * CSV bulk create handlers — label-keyed rows from parseCsvByLabels.
 */

import { ACCOUNT_NATURES, NATURE_ORDER } from '../core/accountTypes.js';
import { BUDGET_PERIODS, GOAL_CATEGORIES } from '../core/constants.js';
import { TAX_COMPONENT_LIST, TAX_TYPE_LIST } from '../engine/taxEngine.js';
import { INVENTORY_TYPE_LIST } from '../engine/inventoryEngine.js';
import { VOUCHER_TYPE_LIST } from '../engine/accountingEngine.js';
import {
  findByName,
  formatCsvDate,
  parseCsvDate,
  parseMonthValue,
  parseYesNo,
  requireCsvDate,
} from '../utils/csv.js';
import * as bookService from './bookService.js';
import * as coaService from './coaService.js';
import * as inventoryService from './inventoryService.js';
import * as taxService from './taxService.js';
import * as financeService from './personalFinanceService.js';
import * as voucherService from './voucherService.js';

/**
 * @typedef {{ created: number, failed: number, errors: string[] }} BulkResult
 */

/** @returns {BulkResult} */
function emptyResult() {
  return { created: 0, failed: 0, errors: [] };
}

/**
 * @param {BulkResult} result
 * @param {number} rowNum
 * @param {unknown} err
 */
function pushRowError(result, rowNum, err) {
  result.failed += 1;
  result.errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : String(err)}`);
}

function cell(row, label) {
  return String(row[label] ?? '').trim();
}

function isBlankRow(row, labels) {
  return labels.every((lab) => !cell(row, lab));
}

/* ── Label sets (fixed — do not rename without updating templates) ── */

export const CSV_LABELS = Object.freeze({
  books: Object.freeze(['Book name', 'Currency', 'FY start month', 'Legal name', 'Country']),
  /** Combined chart of accounts — Kind is Group or Ledger. */
  chartOfAccounts: Object.freeze([
    'Kind',
    'Name',
    'Code',
    'Nature',
    'Parent group',
    'Group',
    'Opening balance',
    'Opening type',
    'Notes',
  ]),
  groups: Object.freeze(['Name', 'Code', 'Nature', 'Parent group']),
  ledgers: Object.freeze([
    'Name',
    'Group',
    'Code',
    'Opening balance',
    'Opening type',
    'Notes',
  ]),
  units: Object.freeze(['Name', 'Code', 'Symbol']),
  categories: Object.freeze(['Name', 'Code']),
  warehouses: Object.freeze(['Name', 'Code', 'Address', 'Default warehouse']),
  items: Object.freeze([
    'Name',
    'Code',
    'Unit',
    'Category',
    'Reorder level',
    'Purchase rate',
    'Sale rate',
    'Notes',
  ]),
  movements: Object.freeze([
    'Type',
    'Date',
    'Item',
    'Warehouse',
    'To warehouse',
    'Adjustment direction',
    'Quantity',
    'Rate (cost)',
    'Counter ledger',
    'Narration',
    'Post linked accounting voucher',
  ]),
  taxCodes: Object.freeze([
    'Name',
    'Code',
    'Type',
    'Component',
    'Rate %',
    'Posting ledger',
    'Notes',
  ]),
  budgets: Object.freeze(['Name', 'Ledger', 'Period type', 'Period', 'Amount', 'Notes']),
  goals: Object.freeze([
    'Name',
    'Category',
    'Target amount',
    'Current amount',
    'Linked asset ledger',
    'Target date',
    'Notes',
  ]),
  vouchers: Object.freeze([
    'Number',
    'Date',
    'Type',
    'Narration',
    'Ledger',
    'Tax',
    'Debit',
    'Credit',
  ]),
});

export const CSV_SAMPLES = Object.freeze({
  books: [
    {
      'Book name': 'Demo Company',
      Currency: 'INR',
      'FY start month': 'April',
      'Legal name': 'Demo Company Pvt Ltd',
      Country: 'India',
    },
  ],
  chartOfAccounts: [
    {
      Kind: 'Group',
      Name: 'Current Assets',
      Code: 'CA',
      Nature: 'Asset',
      'Parent group': '',
      Group: '',
      'Opening balance': '',
      'Opening type': '',
      Notes: '',
    },
    {
      Kind: 'Group',
      Name: 'Bank Accounts',
      Code: 'BANK',
      Nature: 'Asset',
      'Parent group': 'Current Assets',
      Group: '',
      'Opening balance': '',
      'Opening type': '',
      Notes: '',
    },
    {
      Kind: 'Ledger',
      Name: 'Cash',
      Code: 'CASH',
      Nature: '',
      'Parent group': '',
      Group: 'Current Assets',
      'Opening balance': '5000',
      'Opening type': 'Debit',
      Notes: '',
    },
    {
      Kind: 'Ledger',
      Name: 'HDFC Current',
      Code: 'HDFC',
      Nature: '',
      'Parent group': '',
      Group: 'Bank Accounts',
      'Opening balance': '25000',
      'Opening type': 'Debit',
      Notes: 'Operating account',
    },
  ],
  groups: [
    {
      Name: 'Bank Accounts',
      Code: 'BANK',
      Nature: 'Asset',
      'Parent group': 'Current Assets',
    },
  ],
  ledgers: [
    {
      Name: 'HDFC Current',
      Group: 'Bank Accounts',
      Code: 'HDFC',
      'Opening balance': '10000',
      'Opening type': 'Debit',
      Notes: '',
    },
  ],
  units: [{ Name: 'Piece', Code: 'PCS', Symbol: 'pc' }],
  categories: [{ Name: 'Finished Goods', Code: 'FG' }],
  warehouses: [
    {
      Name: 'Main Store',
      Code: 'MAIN',
      Address: 'Warehouse A',
      'Default warehouse': 'Yes',
    },
  ],
  items: [
    {
      Name: 'Widget',
      Code: 'W001',
      Unit: 'Piece',
      Category: 'Finished Goods',
      'Reorder level': '10',
      'Purchase rate': '100',
      'Sale rate': '150',
      Notes: '',
    },
  ],
  movements: [
    {
      Type: 'Opening',
      Date: formatCsvDate(new Date()),
      Item: 'Widget',
      Warehouse: 'Main Store',
      'To warehouse': '',
      'Adjustment direction': '',
      Quantity: '50',
      'Rate (cost)': '100',
      'Counter ledger': '',
      Narration: 'Opening stock',
      'Post linked accounting voucher': 'No',
    },
  ],
  taxCodes: [
    {
      Name: 'GST 18% Output',
      Code: 'GST18O',
      Type: 'GST',
      Component: 'Output',
      'Rate %': '18',
      'Posting ledger': 'Output Tax',
      Notes: '',
    },
  ],
  budgets: [
    {
      Name: 'Office rent',
      Ledger: 'Rent Expense',
      'Period type': 'Month',
      Period: '2026-07',
      Amount: '25000',
      Notes: '',
    },
  ],
  goals: [
    {
      Name: 'Emergency Fund',
      Category: 'Emergency Fund',
      'Target amount': '300000',
      'Current amount': '50000',
      'Linked asset ledger': '',
      'Target date': '31-DEC-2026',
      Notes: '',
    },
  ],
  vouchers: [
    {
      Number: 'JV-0001',
      Date: formatCsvDate(new Date()),
      Type: 'Journal',
      Narration: 'Sample journal',
      Ledger: 'Cash',
      Tax: '',
      Debit: '1000',
      Credit: '',
    },
    {
      Number: 'JV-0001',
      Date: formatCsvDate(new Date()),
      Type: 'Journal',
      Narration: 'Sample journal',
      Ledger: 'Capital',
      Tax: '',
      Debit: '',
      Credit: '1000',
    },
  ],
});

/* ── Importers ─────────────────────────────────────────── */

/**
 * @param {Record<string, string>[]} rows
 * @returns {Promise<BulkResult>}
 */
export async function importBooks(rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.books;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      const name = cell(row, 'Book name');
      if (!name) throw new Error('Book name is required');
      const fyRaw = cell(row, 'FY start month');
      const fyStartMonth = fyRaw ? parseMonthValue(fyRaw) : 4;
      await bookService.createBook({
        name,
        currency: cell(row, 'Currency') || 'INR',
        fyStartMonth: fyStartMonth || 4,
        legalName: cell(row, 'Legal name') || name,
        country: cell(row, 'Country'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * Load a full chart of accounts from one CSV (groups + ledgers).
 * Kind = Group | Ledger. Groups are created first (multi-pass for parents), then ledgers.
 *
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 * @returns {Promise<BulkResult & { groupsCreated: number, ledgersCreated: number }>}
 */
export async function importChartOfAccounts(bookId, rows) {
  const result = emptyResult();
  /** @type {number} */
  result.groupsCreated = 0;
  /** @type {number} */
  result.ledgersCreated = 0;
  const labels = CSV_LABELS.chartOfAccounts;

  /** @type {{ row: Record<string, string>, rowNum: number }[]} */
  const groupEntries = [];
  /** @type {{ row: Record<string, string>, rowNum: number }[]} */
  const ledgerEntries = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;

    const kind = cell(row, 'Kind').toLowerCase();
    if (kind === 'group' || kind === 'groups') {
      groupEntries.push({
        rowNum,
        row: {
          Name: cell(row, 'Name'),
          Code: cell(row, 'Code'),
          Nature: cell(row, 'Nature'),
          'Parent group': cell(row, 'Parent group'),
        },
      });
    } else if (kind === 'ledger' || kind === 'ledgers' || kind === 'account') {
      ledgerEntries.push({
        rowNum,
        row: {
          Name: cell(row, 'Name'),
          Group: cell(row, 'Group'),
          Code: cell(row, 'Code'),
          'Opening balance': cell(row, 'Opening balance'),
          'Opening type': cell(row, 'Opening type'),
          Notes: cell(row, 'Notes'),
        },
      });
    } else {
      pushRowError(result, rowNum, new Error('Kind must be Group or Ledger'));
    }
  }

  /**
   * @param {BulkResult} sub
   * @param {{ rowNum: number }[]} entries
   */
  function mergeSubResult(sub, entries) {
    result.created += sub.created;
    result.failed += sub.failed;
    for (const e of sub.errors) {
      const m = e.match(/^Row (\d+): (.*)$/);
      if (m) {
        const idx = Number(m[1]) - 2;
        const orig = entries[idx]?.rowNum;
        result.errors.push(orig != null ? `Row ${orig}: ${m[2]}` : e);
      } else {
        result.errors.push(e);
      }
    }
  }

  if (groupEntries.length) {
    const gResult = await importGroups(
      bookId,
      groupEntries.map((x) => x.row)
    );
    result.groupsCreated = gResult.created;
    mergeSubResult(gResult, groupEntries);
  }

  if (ledgerEntries.length) {
    const lResult = await importLedgers(
      bookId,
      ledgerEntries.map((x) => x.row)
    );
    result.ledgersCreated = lResult.created;
    mergeSubResult(lResult, ledgerEntries);
  }

  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importGroups(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.groups;
  // Two passes so parents can be created in the same file
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (isBlankRow(row, labels)) continue;
      try {
        const name = cell(row, 'Name');
        if (!name) throw new Error('Name is required');
        const existing = (await coaService.listGroups(bookId)).find(
          (g) => g.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          if (pass === 0) continue; // already there
          continue;
        }
        const parentName = cell(row, 'Parent group');
        let parentId = null;
        if (parentName) {
          const groups = await coaService.listGroups(bookId);
          const parent = findByName(groups, parentName);
          if (!parent) {
            if (pass === 0) continue; // retry on pass 2
            throw new Error(`Parent group "${parentName}" not found`);
          }
          parentId = parent.id;
        }
        const natureRaw = cell(row, 'Nature');
        const nature =
          NATURE_ORDER.find((n) => n.toLowerCase() === natureRaw.toLowerCase()) ||
          (parentId ? undefined : null);
        if (!parentId && !nature) {
          throw new Error(`Nature must be one of: ${NATURE_ORDER.join(', ')}`);
        }
        await coaService.createGroup({
          bookId,
          name,
          code: cell(row, 'Code'),
          nature: nature || ACCOUNT_NATURES.ASSET,
          parentId,
        });
        result.created += 1;
      } catch (err) {
        if (pass === 1) pushRowError(result, rowNum, err);
      }
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importLedgers(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.ledgers;
  const groups = await coaService.listGroups(bookId);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      const name = cell(row, 'Name');
      if (!name) throw new Error('Name is required');
      const groupName = cell(row, 'Group');
      if (!groupName) throw new Error('Group is required');
      const group = findByName(groups, groupName);
      if (!group) throw new Error(`Group "${groupName}" not found`);

      const openingTypeRaw = cell(row, 'Opening type').toLowerCase();
      let openingBalanceType = undefined;
      if (openingTypeRaw === 'debit' || openingTypeRaw === 'dr') openingBalanceType = 'debit';
      else if (openingTypeRaw === 'credit' || openingTypeRaw === 'cr') openingBalanceType = 'credit';
      else if (openingTypeRaw) throw new Error('Opening type must be Debit or Credit');

      await coaService.createLedger({
        bookId,
        groupId: group.id,
        name,
        code: cell(row, 'Code'),
        openingBalance: Number(cell(row, 'Opening balance') || 0),
        openingBalanceType,
        notes: cell(row, 'Notes'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importUnits(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.units;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      await inventoryService.createUnit(bookId, {
        name: cell(row, 'Name'),
        code: cell(row, 'Code'),
        symbol: cell(row, 'Symbol'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importCategories(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.categories;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      await inventoryService.createCategory(bookId, {
        name: cell(row, 'Name'),
        code: cell(row, 'Code'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importWarehouses(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.warehouses;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      await inventoryService.createWarehouse(bookId, {
        name: cell(row, 'Name'),
        code: cell(row, 'Code'),
        address: cell(row, 'Address'),
        isDefault: parseYesNo(cell(row, 'Default warehouse'), false),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importItems(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.items;
  const [units, categories] = await Promise.all([
    inventoryService.listUnits(bookId),
    inventoryService.listCategories(bookId),
  ]);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      const unitName = cell(row, 'Unit');
      if (!unitName) throw new Error('Unit is required');
      const unit = findByName(units, unitName, { byCode: true });
      if (!unit) throw new Error(`Unit "${unitName}" not found`);

      let categoryId = null;
      const catName = cell(row, 'Category');
      if (catName) {
        const cat = findByName(categories, catName, { byCode: true });
        if (!cat) throw new Error(`Category "${catName}" not found`);
        categoryId = cat.id;
      }

      await inventoryService.createItem(bookId, {
        name: cell(row, 'Name'),
        code: cell(row, 'Code'),
        unitId: unit.id,
        categoryId,
        reorderLevel: Number(cell(row, 'Reorder level') || 0),
        purchaseRate: Number(cell(row, 'Purchase rate') || 0),
        saleRate: Number(cell(row, 'Sale rate') || 0),
        notes: cell(row, 'Notes'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importMovements(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.movements;
  const [items, warehouses, ledgers] = await Promise.all([
    inventoryService.listItems(bookId),
    inventoryService.listWarehouses(bookId),
    coaService.listLedgers(bookId),
  ]);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      const typeRaw = cell(row, 'Type');
      const type = INVENTORY_TYPE_LIST.find((t) => t.toLowerCase() === typeRaw.toLowerCase());
      if (!type) throw new Error(`Type must be one of: ${INVENTORY_TYPE_LIST.join(', ')}`);

      const item = findByName(items, cell(row, 'Item'), { byCode: true });
      if (!item) throw new Error(`Item "${cell(row, 'Item')}" not found`);

      const whName = cell(row, 'Warehouse');
      const warehouse = findByName(warehouses, whName, { byCode: true });
      if (!warehouse) throw new Error(`Warehouse "${whName}" not found`);

      let toWarehouseId = null;
      const toWhName = cell(row, 'To warehouse');
      if (toWhName) {
        const toWh = findByName(warehouses, toWhName, { byCode: true });
        if (!toWh) throw new Error(`To warehouse "${toWhName}" not found`);
        toWarehouseId = toWh.id;
      }

      let adjustmentSign = undefined;
      const adj = cell(row, 'Adjustment direction').toLowerCase();
      if (adj) {
        if (adj.includes('increase') || adj === '+' || adj === 'plus') adjustmentSign = 1;
        else if (adj.includes('decrease') || adj === '-' || adj === 'minus') adjustmentSign = -1;
        else throw new Error('Adjustment direction must be Increase or Decrease');
      }

      let counterLedgerId = null;
      const ledName = cell(row, 'Counter ledger');
      if (ledName) {
        const led = findByName(ledgers, ledName, { byCode: true });
        if (!led) throw new Error(`Counter ledger "${ledName}" not found`);
        counterLedgerId = led.id;
      }

      await inventoryService.postMovement({
        bookId,
        type,
        date: requireCsvDate(cell(row, 'Date'), 'Date'),
        itemId: item.id,
        warehouseId: warehouse.id,
        toWarehouseId,
        quantity: Number(cell(row, 'Quantity') || 0),
        rate: Number(cell(row, 'Rate (cost)') || 0),
        adjustmentSign,
        counterLedgerId,
        narration: cell(row, 'Narration'),
        postAccounting: parseYesNo(cell(row, 'Post linked accounting voucher'), false),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importTaxCodes(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.taxCodes;
  const ledgers = await taxService.listTaxLedgers(bookId);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      const taxType = TAX_TYPE_LIST.find(
        (t) => t.toLowerCase() === cell(row, 'Type').toLowerCase()
      );
      if (!taxType) throw new Error(`Type must be one of: ${TAX_TYPE_LIST.join(', ')}`);

      const component = TAX_COMPONENT_LIST.find(
        (c) => c.toLowerCase() === cell(row, 'Component').toLowerCase()
      );
      if (!component) {
        throw new Error(`Component must be one of: ${TAX_COMPONENT_LIST.join(', ')}`);
      }

      let ledgerId = null;
      const ledName = cell(row, 'Posting ledger');
      if (ledName) {
        const led = findByName(ledgers, ledName, { byCode: true });
        if (!led) throw new Error(`Posting ledger "${ledName}" not found`);
        ledgerId = led.id;
      }

      await taxService.createTaxCode(bookId, {
        name: cell(row, 'Name'),
        code: cell(row, 'Code'),
        taxType,
        component,
        rate: Number(cell(row, 'Rate %') || 0),
        ledgerId,
        notes: cell(row, 'Notes'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importBudgets(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.budgets;
  const ledgers = await financeService.listBudgetLedgers(bookId);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      const led = findByName(ledgers, cell(row, 'Ledger'), { byCode: true });
      if (!led) throw new Error(`Ledger "${cell(row, 'Ledger')}" not found`);

      const ptRaw = cell(row, 'Period type').toLowerCase();
      let periodType = BUDGET_PERIODS.MONTH;
      if (ptRaw === 'year' || ptRaw === 'yearly' || ptRaw === 'annual') {
        periodType = BUDGET_PERIODS.YEAR;
      } else if (ptRaw === 'month' || ptRaw === 'monthly' || !ptRaw) {
        periodType = BUDGET_PERIODS.MONTH;
      } else {
        throw new Error('Period type must be Month or Year');
      }

      const periodKey = cell(row, 'Period');
      if (!periodKey) throw new Error('Period is required (YYYY-MM or YYYY)');

      await financeService.createBudget(bookId, {
        name: cell(row, 'Name'),
        ledgerId: led.id,
        periodType,
        periodKey,
        amount: Number(cell(row, 'Amount') || 0),
        notes: cell(row, 'Notes'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * @param {string} bookId
 * @param {Record<string, string>[]} rows
 */
export async function importGoals(bookId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.goals;
  const assetLedgers = await financeService.listGoalLedgers(bookId);
  const categories = Object.values(GOAL_CATEGORIES);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;
    try {
      const catRaw = cell(row, 'Category');
      const category =
        categories.find((c) => c.toLowerCase() === catRaw.toLowerCase()) ||
        GOAL_CATEGORIES.OTHER;

      let linkedLedgerId = null;
      const ledName = cell(row, 'Linked asset ledger');
      if (ledName) {
        const led = findByName(assetLedgers, ledName, { byCode: true });
        if (!led) throw new Error(`Linked asset ledger "${ledName}" not found`);
        linkedLedgerId = led.id;
      }

      const dateRaw = cell(row, 'Target date');
      let targetDate = null;
      if (dateRaw) {
        targetDate = parseCsvDate(dateRaw);
        if (!targetDate) {
          throw new Error('Target date must be DD-MMM-YYYY (e.g. 01-JUL-2026)');
        }
      }

      await financeService.createGoal(bookId, {
        name: cell(row, 'Name'),
        category,
        targetAmount: Number(cell(row, 'Target amount') || 0),
        currentAmount: Number(cell(row, 'Current amount') || 0),
        linkedLedgerId,
        targetDate,
        notes: cell(row, 'Notes'),
      });
      result.created += 1;
    } catch (err) {
      pushRowError(result, rowNum, err);
    }
  }
  return result;
}

/**
 * Voucher CSV: one row per line. Rows with the same Number form one voucher.
 * @param {string} bookId
 * @param {string} financialYearId
 * @param {Record<string, string>[]} rows
 */
export async function importVouchers(bookId, financialYearId, rows) {
  const result = emptyResult();
  const labels = CSV_LABELS.vouchers;
  if (!financialYearId) {
    result.errors.push('Active financial year is required');
    result.failed = 1;
    return result;
  }

  const [ledgers, taxCodes] = await Promise.all([
    coaService.listLedgers(bookId),
    taxService.listTaxCodes(bookId, { activeOnly: true }),
  ]);

  /** @type {Map<string, { rowNums: number[], header: Record<string, string>, lines: object[] }>} */
  const groups = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isBlankRow(row, labels)) continue;

    const number = cell(row, 'Number');
    if (!number) {
      pushRowError(result, rowNum, new Error('Number is required'));
      continue;
    }

    let bucket = groups.get(number);
    if (!bucket) {
      bucket = { rowNums: [], header: row, lines: [] };
      groups.set(number, bucket);
    }
    bucket.rowNums.push(rowNum);

    try {
      const led = findByName(ledgers, cell(row, 'Ledger'), { byCode: true });
      if (!led) throw new Error(`Ledger "${cell(row, 'Ledger')}" not found`);

      let taxCodeId = null;
      const taxName = cell(row, 'Tax');
      if (taxName) {
        const tax = findByName(taxCodes, taxName, { byCode: true });
        if (!tax) throw new Error(`Tax "${taxName}" not found`);
        taxCodeId = tax.id;
      }

      bucket.lines.push({
        ledgerId: led.id,
        debit: Number(cell(row, 'Debit') || 0),
        credit: Number(cell(row, 'Credit') || 0),
        taxCodeId,
        narration: '',
        costCenterId: null,
      });
    } catch (err) {
      pushRowError(result, rowNum, err);
      groups.delete(number);
    }
  }

  for (const [number, bucket] of groups) {
    try {
      const typeRaw = cell(bucket.header, 'Type');
      const voucherType = VOUCHER_TYPE_LIST.find(
        (t) => t.toLowerCase() === typeRaw.toLowerCase()
      );
      if (!voucherType) {
        throw new Error(`Type must be one of: ${VOUCHER_TYPE_LIST.join(', ')}`);
      }

      await voucherService.createVoucher({
        bookId,
        financialYearId,
        voucherType,
        voucherNumber: number,
        date: requireCsvDate(cell(bucket.header, 'Date'), 'Date'),
        narration: cell(bucket.header, 'Narration'),
        lines: bucket.lines,
      });
      result.created += 1;
    } catch (err) {
      const rowNum = bucket.rowNums[0] || '?';
      pushRowError(result, rowNum, err);
    }
  }

  return result;
}

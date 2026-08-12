/**
 * GNUCash CSV import — accounts export + transaction export.
 * Columns are matched by header label (not position).
 *
 * Accounts (GNUCash export):
 *   Account Type (or Type), Full Account Name, Account Name, Account ShortCode,
 *   Description, Placeholder, …
 *
 * Transactions (GNUCash export):
 *   Date, Transaction ID, Number, Description, Full Account Name, Amount Num., …
 */

import { ACCOUNT_NATURES } from '../core/accountTypes.js';
import { VOUCHER_TYPES } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso, suggestFyLabel } from '../utils/date.js';
import { parseCsvByLabels, buildCsv } from '../utils/csv.js';
import { roundMoney } from '../utils/money.js';
import { financialYearRepository } from '../repositories/financialYearRepository.js';
import { ledgerGroupRepository } from '../repositories/ledgerGroupRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { voucherRepository } from '../repositories/voucherRepository.js';
import { voucherLineRepository } from '../repositories/voucherLineRepository.js';
import * as bookService from './bookService.js';
import * as coaService from './coaService.js';
import * as voucherService from './voucherService.js';

export const GNUCASH_ACCOUNT_LABELS = Object.freeze([
  'Account Type',
  'Type',
  'Full Account Name',
  'Account Name',
  'Account ShortCode',
  'Description',
  'Placeholder',
  'Hidden',
  'Notes',
]);

/** Core labels that must exist in an accounts export. */
export const GNUCASH_ACCOUNT_REQUIRED = Object.freeze([
  'Account Type',
  'Full Account Name',
  'Account Name',
  'Placeholder',
]);

export const GNUCASH_TXN_LABELS = Object.freeze([
  'Date',
  'Transaction ID',
  'Number',
  'Description',
  'Notes',
  'Void Reason',
  'Memo',
  'Full Account Name',
  'Account Name',
  'Amount Num.',
  'Value Num.',
]);

export const GNUCASH_TXN_REQUIRED = Object.freeze([
  'Date',
  'Transaction ID',
  'Full Account Name',
  'Amount Num.',
]);

const PATH_TAG = 'gnucash:';
const TYPE_TAG = 'gnucash-type:';
const PLACEHOLDER_TAG = 'gnucash-placeholder:';
const TXN_TAG = 'gnucash-txn:';

const TYPE_TO_NATURE = Object.freeze({
  ASSET: ACCOUNT_NATURES.ASSET,
  BANK: ACCOUNT_NATURES.ASSET,
  CASH: ACCOUNT_NATURES.ASSET,
  STOCK: ACCOUNT_NATURES.ASSET,
  MUTUAL: ACCOUNT_NATURES.ASSET,
  RECEIVABLE: ACCOUNT_NATURES.ASSET,
  LIABILITY: ACCOUNT_NATURES.LIABILITY,
  PAYABLE: ACCOUNT_NATURES.LIABILITY,
  CREDIT: ACCOUNT_NATURES.LIABILITY,
  EQUITY: ACCOUNT_NATURES.EQUITY,
  INCOME: ACCOUNT_NATURES.INCOME,
  EXPENSE: ACCOUNT_NATURES.EXPENSE,
});

const NATURE_TO_TYPE = Object.freeze({
  [ACCOUNT_NATURES.ASSET]: 'ASSET',
  [ACCOUNT_NATURES.LIABILITY]: 'LIABILITY',
  [ACCOUNT_NATURES.EQUITY]: 'EQUITY',
  [ACCOUNT_NATURES.INCOME]: 'INCOME',
  [ACCOUNT_NATURES.EXPENSE]: 'EXPENSE',
});

/**
 * @param {Record<string, string>} row
 * @param {string} label
 */
function cell(row, label) {
  return String(row[label] ?? '').trim();
}

/**
 * Account type from a parsed row — accepts “Account Type” or “Type”.
 * @param {Record<string, string>} row
 */
export function accountTypeFromRow(row) {
  return cell(row, 'Account Type') || cell(row, 'Type');
}

/**
 * Required account columns, treating Type / Account Type as equivalents.
 * @param {string[]} missingLabels
 * @param {string[]} matchedLabels
 */
function missingRequiredAccountLabels(missingLabels, matchedLabels) {
  const matched = new Set(matchedLabels);
  return GNUCASH_ACCOUNT_REQUIRED.filter((l) => {
    if (l === 'Account Type') {
      return !matched.has('Account Type') && !matched.has('Type');
    }
    return missingLabels.includes(l);
  });
}

/**
 * Parse GNUCash T/F flags.
 * @param {string} value
 */
function isTrueFlag(value) {
  const v = String(value || '')
    .trim()
    .toUpperCase();
  return v === 'T' || v === 'TRUE' || v === 'Y' || v === 'YES' || v === '1';
}

/**
 * Map GNUCash account type → PicoERP nature.
 * @param {string} accountType
 */
export function natureFromGnuCashType(accountType) {
  const key = String(accountType || '')
    .trim()
    .toUpperCase();
  return TYPE_TO_NATURE[key] || null;
}

/**
 * Parent path of a colon-separated full account name.
 * @param {string} fullName
 */
export function parentPath(fullName) {
  const s = String(fullName || '');
  const i = s.lastIndexOf(':');
  return i === -1 ? '' : s.slice(0, i);
}

/**
 * Leaf segment of a full account name.
 * @param {string} fullName
 */
export function leafName(fullName) {
  const s = String(fullName || '');
  const i = s.lastIndexOf(':');
  return i === -1 ? s : s.slice(i + 1);
}

/**
 * GNUCash transaction dates are typically MM/DD/YYYY.
 * @param {string} text
 * @returns {string|null} YYYY-MM-DD
 */
export function parseGnuCashDate(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // MM/DD/YYYY or M/D/YYYY
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return raw;

  // DD-MMM-YYYY (our CSV convention)
  m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months = {
      JAN: 0,
      FEB: 1,
      MAR: 2,
      APR: 3,
      MAY: 4,
      JUN: 5,
      JUL: 6,
      AUG: 7,
      SEP: 8,
      OCT: 9,
      NOV: 10,
      DEC: 11,
    };
    const mon = months[m[2].toUpperCase()];
    if (mon == null) return null;
    const day = Number(m[1]);
    const year = Number(m[3]);
    const d = new Date(year, mon, day);
    if (d.getFullYear() !== year || d.getMonth() !== mon || d.getDate() !== day) return null;
    return `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parse Amount Num. values like 7798.91, (7798.91), -7798.91, 10,000.00
 * @param {string} text
 */
export function parseGnuCashAmount(text) {
  let t = String(text ?? '').trim();
  if (!t) return 0;
  t = t.replace(/,/g, '');
  const parenNeg = /^\(.*\)$/.test(t);
  if (parenNeg) t = t.slice(1, -1);
  const n = Number(t);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid amount "${text}"`);
  }
  const signed = parenNeg ? -Math.abs(n) : n;
  return roundMoney(signed);
}

/**
 * @param {string} notes
 * @param {{ path?: string, type?: string, placeholder?: boolean, extra?: string }} meta
 */
function withGnuMeta(notes, meta = {}) {
  let base = stripGnuTags(String(notes || '').trim());
  if (meta.extra) {
    const extra = stripGnuTags(meta.extra);
    if (extra) base = base ? `${base}\n${extra}` : extra;
  }
  const lines = [];
  if (base) lines.push(base);
  if (meta.path) lines.push(`${PATH_TAG}${meta.path}`);
  if (meta.type) lines.push(`${TYPE_TAG}${meta.type}`);
  if (meta.placeholder === true) lines.push(`${PLACEHOLDER_TAG}T`);
  if (meta.placeholder === false) lines.push(`${PLACEHOLDER_TAG}F`);
  return lines.join('\n');
}

/**
 * @param {string} notes
 */
export function stripGnuTags(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !l.startsWith(PATH_TAG) &&
        !l.startsWith(TYPE_TAG) &&
        !l.startsWith(PLACEHOLDER_TAG) &&
        !l.startsWith(TXN_TAG)
    )
    .join('\n')
    .trim();
}

/**
 * @param {string} notes
 */
export function pathFromNotes(notes) {
  const m = String(notes || '').match(/(?:^|\n)gnucash:([^\n\r]+)/);
  if (!m) return '';
  const val = m[1].trim();
  // Guard against older malformed tags
  if (/^(type|placeholder|txn):/i.test(val)) return '';
  return val;
}

/**
 * @param {string} notes
 */
export function typeFromNotes(notes) {
  const m = String(notes || '').match(/(?:^|\n)gnucash-type:([^\n\r]+)/i);
  return m ? m[1].trim().toUpperCase() : '';
}

/**
 * @param {string} notes
 * @returns {boolean|null}
 */
export function placeholderFromNotes(notes) {
  const m = String(notes || '').match(/(?:^|\n)gnucash-placeholder:([TF])/i);
  if (!m) return null;
  return m[1].toUpperCase() === 'T';
}

/**
 * @param {string} narration
 */
export function txnIdFromNarration(narration) {
  const m = String(narration || '').match(/(?:^|\n)gnucash-txn:([^\n\r]+)/i);
  return m ? m[1].trim() : '';
}

/**
 * @param {string} narration
 */
export function stripTxnTag(narration) {
  return String(narration || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(TXN_TAG))
    .join('\n')
    .trim();
}

/**
 * @param {string} notes
 * @param {string} fullPath
 * @deprecated use withGnuMeta
 */
function withPathTag(notes, fullPath) {
  return withGnuMeta(notes, { path: fullPath });
}

/**
 * Ensure a financial year covers the given ISO date (creates one if needed).
 * @param {string} bookId
 * @param {string} dateIso
 * @param {number} fyStartMonth 1–12
 */
export async function ensureFyForDate(bookId, dateIso, fyStartMonth = 4) {
  const years = await financialYearRepository.findByBook(bookId);
  const hit = years.find((y) => y.startDate <= dateIso && y.endDate >= dateIso);
  if (hit) return hit;

  const d = new Date(`${dateIso}T12:00:00`);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const startYear = month >= fyStartMonth ? year : year - 1;
  const startDate = `${startYear}-${String(fyStartMonth).padStart(2, '0')}-01`;
  const end = new Date(startYear + 1, fyStartMonth - 1, 1);
  end.setDate(end.getDate() - 1);
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(
    end.getDate()
  ).padStart(2, '0')}`;

  const now = nowIso();
  const fy = {
    id: uuid(),
    bookId,
    name: suggestFyLabel(new Date(`${startDate}T12:00:00`)),
    startDate,
    endDate,
    isActive: false,
    isClosed: false,
    createdAt: now,
  };
  await financialYearRepository.create(fy);
  return fy;
}

/**
 * Preview accounts CSV without writing.
 * @param {string} text
 */
export function previewAccounts(text) {
  const { rows, missingLabels, matchedLabels } = parseCsvByLabels(text, GNUCASH_ACCOUNT_LABELS);
  const missingRequired = missingRequiredAccountLabels(missingLabels, matchedLabels);
  if (missingRequired.length) {
    throw new Error(
      `Missing GNUCash account columns: ${missingRequired.join(', ')} (Account Type or Type is accepted)`
    );
  }

  const accounts = [];
  for (const row of rows) {
    const fullName = cell(row, 'Full Account Name');
    if (!fullName) continue;
    const accountType = accountTypeFromRow(row);
    accounts.push({
      accountType,
      fullName,
      name: cell(row, 'Account Name') || leafName(fullName),
      shortCode: cell(row, 'Account ShortCode'),
      description: cell(row, 'Description'),
      placeholder: isTrueFlag(cell(row, 'Placeholder')),
      hidden: isTrueFlag(cell(row, 'Hidden')),
      notes: cell(row, 'Notes'),
      nature: natureFromGnuCashType(accountType),
    });
  }

  const allPaths = new Set(accounts.map((a) => a.fullName));
  /** Paths that have at least one child account */
  const parentPaths = new Set();
  for (const full of allPaths) {
    let p = parentPath(full);
    while (p) {
      parentPaths.add(p);
      p = parentPath(p);
    }
  }

  let groups = 0;
  let ledgers = 0;
  for (const a of accounts) {
    const isParent = parentPaths.has(a.fullName);
    if (isParent) groups += 1;
    if (!isParent || !a.placeholder) ledgers += 1;
  }

  return {
    totalRows: accounts.length,
    groups,
    ledgers,
    byType: accounts.reduce((acc, a) => {
      acc[a.accountType || '?'] = (acc[a.accountType || '?'] || 0) + 1;
      return acc;
    }, /** @type {Record<string, number>} */ ({})),
    accounts,
  };
}

/**
 * Preview transactions CSV without writing.
 * @param {string} text
 */
export function previewTransactions(text) {
  const { rows, missingLabels } = parseCsvByLabels(text, GNUCASH_TXN_LABELS);
  const missingRequired = GNUCASH_TXN_REQUIRED.filter((l) => missingLabels.includes(l));
  if (missingRequired.length) {
    throw new Error(`Missing GNUCash transaction columns: ${missingRequired.join(', ')}`);
  }

  /** @type {Map<string, { id: string, date: string, description: string, lines: number, voided: boolean }>} */
  const byId = new Map();
  let lineCount = 0;
  let voided = 0;
  let badDates = 0;
  let minDate = '';
  let maxDate = '';

  for (const row of rows) {
    const id = cell(row, 'Transaction ID');
    if (!id) continue;
    lineCount += 1;
    const dateIso = parseGnuCashDate(cell(row, 'Date'));
    if (!dateIso) badDates += 1;
    else {
      if (!minDate || dateIso < minDate) minDate = dateIso;
      if (!maxDate || dateIso > maxDate) maxDate = dateIso;
    }
    const isVoid = Boolean(cell(row, 'Void Reason'));
    if (isVoid) voided += 1;

    let bucket = byId.get(id);
    if (!bucket) {
      bucket = {
        id,
        date: dateIso || '',
        description: cell(row, 'Description'),
        lines: 0,
        voided: isVoid,
      };
      byId.set(id, bucket);
    }
    bucket.lines += 1;
    if (isVoid) bucket.voided = true;
  }

  return {
    splitLines: lineCount,
    vouchers: byId.size,
    voidedSplits: voided,
    badDates,
    minDate,
    maxDate,
  };
}

/**
 * Import GNUCash accounts export into the active book.
 *
 * @param {string} bookId
 * @param {string} csvText
 * @param {{
 *   onProgress?: (msg: string) => void,
 *   mode?: 'merge'|'override',
 * }} [opts]
 */
export async function importGnuCashAccounts(bookId, csvText, opts = {}) {
  const mode = opts.mode === 'override' ? 'override' : 'merge';
  const preview = previewAccounts(csvText);
  const accounts = preview.accounts;
  const result = {
    mode,
    purgedGroups: 0,
    purgedLedgers: 0,
    createdGroups: 0,
    createdLedgers: 0,
    reusedGroups: 0,
    reusedLedgers: 0,
    failed: 0,
    errors: /** @type {string[]} */ ([]),
    pathToLedgerId: /** @type {Map<string, string>} */ (new Map()),
  };

  if (mode === 'override') {
    const vouchers = await voucherRepository.findByBook(bookId);
    if (vouchers.length > 0) {
      throw new Error(
        `Cannot replace the chart of accounts while ${vouchers.length} voucher(s) exist. Delete vouchers first, or use Merge.`
      );
    }
    opts.onProgress?.('Removing existing chart of accounts…');
    const purged = await coaService.purgeChartOfAccounts(bookId);
    result.purgedGroups = purged.groups || 0;
    result.purgedLedgers = purged.ledgers || 0;
  }

  const allPaths = new Set(accounts.map((a) => a.fullName));
  const parentPaths = new Set();
  for (const full of allPaths) {
    let p = parentPath(full);
    while (p) {
      parentPaths.add(p);
      p = parentPath(p);
    }
  }
  const hasChildren = (fullName) => parentPaths.has(fullName);

  // Depth-first order so parents exist first
  accounts.sort(
    (a, b) =>
      a.fullName.split(':').length - b.fullName.split(':').length ||
      a.fullName.localeCompare(b.fullName)
  );

  /** @type {Map<string, string>} */
  const pathToGroupId = new Map();
  /** @type {Map<string, string>} */
  const pathToLedgerId = new Map();

  // Seed maps from existing COA tagged with gnucash: path
  const [existingGroups, existingLedgers] = await Promise.all([
    coaService.listGroups(bookId),
    coaService.listLedgers(bookId),
  ]);
  for (const g of existingGroups) {
    const p = pathFromNotes(g.notes || '');
    if (p) pathToGroupId.set(p, g.id);
  }
  for (const l of existingLedgers) {
    const p = pathFromNotes(l.notes || '');
    if (p) pathToLedgerId.set(p, l.id);
  }

  /** @type {Set<string>} */
  const usedGroupNames = new Set(existingGroups.map((g) => g.name.toLowerCase()));
  /** @type {Set<string>} */
  const usedLedgerNames = new Set(existingLedgers.map((l) => l.name.toLowerCase()));

  /**
   * @param {string} preferred
   * @param {string} fullName
   * @param {Set<string>} used
   */
  function uniqueName(preferred, fullName, used) {
    const base = (preferred || leafName(fullName)).trim() || leafName(fullName);
    if (!used.has(base.toLowerCase())) {
      used.add(base.toLowerCase());
      return base;
    }
    const alt = fullName.replace(/:/g, ' › ');
    if (!used.has(alt.toLowerCase())) {
      used.add(alt.toLowerCase());
      return alt;
    }
    let i = 2;
    while (used.has(`${alt} (${i})`.toLowerCase())) i += 1;
    const name = `${alt} (${i})`;
    used.add(name.toLowerCase());
    return name;
  }

  opts.onProgress?.(`Importing ${accounts.length} GNUCash accounts (${mode})…`);

  /**
   * Root-level ledgers (e.g. Imbalance-INR) have no parent path — attach under
   * a nature primary group, creating one if needed. Imbalance* gets its own group.
   * @param {string} nature
   * @param {string} fullName
   * @param {string} accountName
   */
  async function resolveLedgerGroupId(nature, fullName, accountName) {
    const parent = parentPath(fullName);
    if (parent) {
      const id = pathToGroupId.get(parent);
      if (id) return id;
      throw new Error(`Parent group not found for "${fullName}" (missing "${parent}")`);
    }

    const isImbalance = /^(imbalance|orphan)/i.test(accountName) || /^imbalance/i.test(fullName);

    if (isImbalance) {
      const imbalanceKey = `__imbalance__:${nature}`;
      let imbId = pathToGroupId.get(imbalanceKey);
      if (imbId) return imbId;

      const existingImb = existingGroups.find(
        (g) =>
          g.nature === nature &&
          !g.parentId &&
          /^imbalance$/i.test(g.name)
      );
      if (existingImb) {
        pathToGroupId.set(imbalanceKey, existingImb.id);
        return existingImb.id;
      }

      // Nest Imbalance under the nature root when possible
      const natureRootId = await ensureNatureRootGroup(nature);
      const created = await coaService.createGroup({
        bookId,
        name: uniqueName('Imbalance', 'Imbalance', usedGroupNames),
        code: 'IMBAL',
        nature,
        parentId: natureRootId,
      });
      created.notes = withGnuMeta('GNUCash imbalance / suspense accounts', {
        path: 'Imbalance',
        type: 'ASSET',
        placeholder: true,
      });
      await ledgerGroupRepository.save(created);
      existingGroups.push(created);
      pathToGroupId.set(imbalanceKey, created.id);
      result.createdGroups += 1;
      return created.id;
    }

    return ensureNatureRootGroup(nature);
  }

  /**
   * @param {string} nature
   */
  async function ensureNatureRootGroup(nature) {
    const cacheKey = `__nature_root__:${nature}`;
    let id = pathToGroupId.get(cacheKey);
    if (id) return id;

    const preferredNames = {
      [ACCOUNT_NATURES.ASSET]: ['Assets', 'Asset'],
      [ACCOUNT_NATURES.LIABILITY]: ['Liabilities', 'Liability'],
      [ACCOUNT_NATURES.EQUITY]: ['Equity'],
      [ACCOUNT_NATURES.INCOME]: ['Income'],
      [ACCOUNT_NATURES.EXPENSE]: ['Expenses', 'Expense'],
    };
    const names = preferredNames[nature] || [nature];

    const existing = existingGroups.find(
      (g) =>
        g.nature === nature &&
        !g.parentId &&
        names.some((n) => n.toLowerCase() === g.name.toLowerCase())
    );
    if (existing) {
      pathToGroupId.set(cacheKey, existing.id);
      return existing.id;
    }

    const primary = existingGroups.find((g) => g.nature === nature && !g.parentId);
    if (primary) {
      pathToGroupId.set(cacheKey, primary.id);
      return primary.id;
    }

    const created = await coaService.createGroup({
      bookId,
      name: uniqueName(names[0], names[0], usedGroupNames),
      code: '',
      nature,
      parentId: null,
    });
    created.notes = withGnuMeta(`GNUCash root for ${nature}`, {
      path: `__nature__:${nature}`,
      type: NATURE_TO_TYPE[nature] || 'ASSET',
      placeholder: true,
    });
    await ledgerGroupRepository.save(created);
    existingGroups.push(created);
    pathToGroupId.set(cacheKey, created.id);
    result.createdGroups += 1;
    return created.id;
  }

  for (const acct of accounts) {
    try {
      if (!acct.nature) {
        throw new Error(`Unsupported Account Type "${acct.accountType}"`);
      }

      const parent = parentPath(acct.fullName);
      const parentGroupId = parent ? pathToGroupId.get(parent) || null : null;
      if (parent && !parentGroupId) {
        throw new Error(`Parent group not found for "${acct.fullName}" (missing "${parent}")`);
      }

      const isParent = hasChildren(acct.fullName);

      if (isParent) {
        let groupId = pathToGroupId.get(acct.fullName);
        if (groupId) {
          result.reusedGroups += 1;
        } else {
          // Prefer reuse by exact name under same parent when natures match
          const existing = existingGroups.find(
            (g) =>
              g.name.toLowerCase() === acct.name.toLowerCase() &&
              (g.parentId || null) === (parentGroupId || null) &&
              g.nature === acct.nature
          );
          if (existing) {
            groupId = existing.id;
            // Tag for future imports
            existing.notes = withGnuMeta(existing.notes || '', {
              path: acct.fullName,
              type: acct.accountType,
              placeholder: true,
              extra: acct.description || acct.notes || '',
            });
            await ledgerGroupRepository.save(existing);
            pathToGroupId.set(acct.fullName, groupId);
            result.reusedGroups += 1;
          } else {
            const name = uniqueName(acct.name, acct.fullName, usedGroupNames);
            const created = await coaService.createGroup({
              bookId,
              name,
              code: acct.shortCode || '',
              nature: acct.nature,
              parentId: parentGroupId,
            });
            created.notes = withGnuMeta(acct.description || acct.notes || '', {
              path: acct.fullName,
              type: acct.accountType,
              placeholder: true,
            });
            await ledgerGroupRepository.save(created);
            groupId = created.id;
            pathToGroupId.set(acct.fullName, groupId);
            existingGroups.push(created);
            result.createdGroups += 1;
          }
        }
      }

      const needsLedger = !isParent || !acct.placeholder;
      if (needsLedger) {
        let ledgerId = pathToLedgerId.get(acct.fullName);
        if (ledgerId) {
          result.reusedLedgers += 1;
        } else {
          const groupId = isParent
            ? pathToGroupId.get(acct.fullName)
            : await resolveLedgerGroupId(acct.nature, acct.fullName, acct.name);
          if (!groupId) {
            throw new Error(`No group to attach ledger "${acct.fullName}"`);
          }

          const name = uniqueName(acct.name, acct.fullName, usedLedgerNames);
          const created = await coaService.createLedger({
            bookId,
            groupId,
            name,
            code: acct.shortCode || '',
            notes: withGnuMeta(acct.description || acct.notes || '', {
              path: acct.fullName,
              type: acct.accountType,
              placeholder: false,
            }),
          });
          created.notes = withGnuMeta(created.notes || '', {
            path: acct.fullName,
            type: acct.accountType,
            placeholder: false,
          });
          await ledgerRepository.save(created);
          ledgerId = created.id;
          pathToLedgerId.set(acct.fullName, ledgerId);
          existingLedgers.push(created);
          result.createdLedgers += 1;
        }
      }
    } catch (err) {
      result.failed += 1;
      result.errors.push(
        `${acct.fullName}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  result.pathToLedgerId = pathToLedgerId;

  // After a full replace, restore system inventory/tax ledgers if the CSV omitted them
  if (mode === 'override') {
    try {
      opts.onProgress?.('Ensuring inventory and tax system ledgers…');
      await (await import('./inventoryService.js')).ensureInventoryMasters(bookId);
      await (await import('./taxService.js')).ensureTaxMasters(bookId);
    } catch (err) {
      result.errors.push(
        `System masters: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  opts.onProgress?.(
    `Accounts done — ${result.createdGroups} groups, ${result.createdLedgers} ledgers created`
  );
  return result;
}

/**
 * Import GNUCash transaction export as Journal / Opening vouchers.
 *
 * @param {string} bookId
 * @param {string} csvText
 * @param {{
 *   onProgress?: (msg: string, done?: number, total?: number) => void,
 *   skipVoided?: boolean,
 * }} [opts]
 */
export async function importGnuCashTransactions(bookId, csvText, opts = {}) {
  const skipVoided = opts.skipVoided !== false;
  const { rows, missingLabels } = parseCsvByLabels(csvText, GNUCASH_TXN_LABELS);
  const missingRequired = GNUCASH_TXN_REQUIRED.filter((l) => missingLabels.includes(l));
  if (missingRequired.length) {
    throw new Error(`Missing GNUCash transaction columns: ${missingRequired.join(', ')}`);
  }

  const book = await bookService.getBook(bookId);
  if (!book) throw new Error('Book not found');

  // Build Full Account Name → ledgerId from tagged notes + name fallback
  const ledgers = await coaService.listLedgers(bookId);
  /** @type {Map<string, string>} */
  const pathToLedgerId = new Map();
  for (const l of ledgers) {
    const p = pathFromNotes(l.notes || '');
    if (p) pathToLedgerId.set(p, l.id);
  }

  /** @type {Map<string, { date: string, number: string, description: string, notes: string, voided: boolean, splits: { fullName: string, amount: number, memo: string }[] }>} */
  const txns = new Map();

  for (const row of rows) {
    const id = cell(row, 'Transaction ID');
    if (!id) continue;
    if (skipVoided && cell(row, 'Void Reason')) continue;

    const dateIso = parseGnuCashDate(cell(row, 'Date'));
    if (!dateIso) continue;

    const fullName = cell(row, 'Full Account Name');
    if (!fullName) continue;

    let amount;
    try {
      amount = parseGnuCashAmount(cell(row, 'Amount Num.'));
    } catch {
      continue;
    }

    let bucket = txns.get(id);
    if (!bucket) {
      bucket = {
        date: dateIso,
        number: cell(row, 'Number'),
        description: cell(row, 'Description'),
        notes: cell(row, 'Notes'),
        voided: Boolean(cell(row, 'Void Reason')),
        splits: [],
      };
      txns.set(id, bucket);
    }
    bucket.splits.push({
      fullName,
      amount,
      memo: cell(row, 'Memo'),
    });
  }

  const result = {
    created: 0,
    failed: 0,
    skipped: 0,
    errors: /** @type {string[]} */ ([]),
  };

  const entries = [...txns.entries()];
  const total = entries.length;
  let index = 0;

  /** @type {Map<string, string>} */
  const fyCache = new Map();

  for (const [txnId, bucket] of entries) {
    index += 1;
    if (index % 20 === 0 || index === total) {
      opts.onProgress?.(`Importing transactions… ${index}/${total}`, index, total);
      await new Promise((r) => setTimeout(r, 0));
    }

    try {
      if (bucket.voided && skipVoided) {
        result.skipped += 1;
        continue;
      }

      // Drop zero-value splits (GNUCash often exports empty Opening Balance stubs)
      const nonZeroSplits = bucket.splits.filter((s) => s.amount !== 0);
      if (nonZeroSplits.length === 0) {
        result.skipped += 1;
        continue;
      }
      if (nonZeroSplits.length < 2) {
        throw new Error(
          `Need at least 2 non-zero splits (got ${nonZeroSplits.length} after dropping zeros)`
        );
      }

      const lines = [];
      for (const split of nonZeroSplits) {
        let ledgerId = pathToLedgerId.get(split.fullName);
        if (!ledgerId) {
          // Fallback: match ledger name = leaf
          const leaf = leafName(split.fullName);
          const hit = ledgers.find((l) => l.name.toLowerCase() === leaf.toLowerCase());
          if (hit) ledgerId = hit.id;
        }
        if (!ledgerId) {
          throw new Error(`No ledger mapped for "${split.fullName}" — import accounts first`);
        }
        const amt = split.amount;
        lines.push({
          ledgerId,
          debit: amt > 0 ? amt : 0,
          credit: amt < 0 ? Math.abs(amt) : 0,
          taxCodeId: null,
          narration: split.memo || '',
          costCenterId: null,
        });
      }

      let fyId = fyCache.get(bucket.date);
      if (!fyId) {
        const fy = await ensureFyForDate(bookId, bucket.date, book.fyStartMonth || 4);
        fyId = fy.id;
        fyCache.set(bucket.date, fyId);
      }

      const desc = bucket.description || '';
      const isOpening = /opening\s*balance/i.test(desc);
      const voucherType = isOpening ? VOUCHER_TYPES.OPENING : VOUCHER_TYPES.JOURNAL;
      const voucherNumber =
        bucket.number ||
        `GC-${txnId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;

      const body = [desc, bucket.notes].filter(Boolean).join(' — ');
      const txnTag = `${TXN_TAG}${txnId}`;
      const maxBody = Math.max(0, 480 - txnTag.length);
      const narration = body
        ? `${body.slice(0, maxBody)}\n${txnTag}`
        : txnTag;

      await voucherService.createVoucher({
        bookId,
        financialYearId: fyId,
        voucherType,
        voucherNumber,
        date: bucket.date,
        narration,
        lines,
      });
      result.created += 1;
    } catch (err) {
      result.failed += 1;
      if (result.errors.length < 40) {
        result.errors.push(
          `${txnId.slice(0, 8)}… (${bucket.date}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  opts.onProgress?.(`Transactions done — ${result.created} vouchers`, total, total);
  return result;
}

/* ── Export (same labels as import for round-trip) ───────── */

/**
 * @param {string} iso YYYY-MM-DD
 */
export function formatGnuCashDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || '');
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/**
 * GNUCash Amount Num. style: 1,234.56 or (1,234.56)
 * @param {number} n
 */
export function formatGnuCashAmount(n) {
  const v = roundMoney(n);
  if (v === 0) return '0.00';
  const abs = Math.abs(v).toFixed(2);
  const withCommas = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v < 0 ? `(${withCommas})` : withCommas;
}

/**
 * @param {import('../models/types.js').LedgerGroup} group
 * @param {Map<string, import('../models/types.js').LedgerGroup>} groupById
 */
function reconstructGroupPath(group, groupById) {
  const tagged = pathFromNotes(group.notes || '');
  if (tagged && !tagged.startsWith('__')) return tagged;
  const parts = [];
  /** @type {import('../models/types.js').LedgerGroup|undefined} */
  let cur = group;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? groupById.get(cur.parentId) : undefined;
  }
  return parts.join(':');
}

/**
 * Export accounts CSV matching import labels (GNUCash-compatible).
 * @param {string} bookId
 */
export async function exportGnuCashAccounts(bookId) {
  const book = await bookService.getBook(bookId);
  const [groups, ledgers] = await Promise.all([
    coaService.listGroups(bookId),
    coaService.listLedgers(bookId),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  /** @type {Map<string, Record<string, string>>} */
  const byPath = new Map();

  for (const g of groups) {
    const path = reconstructGroupPath(g, groupById);
    if (!path || path.startsWith('__')) continue;
    const type = typeFromNotes(g.notes || '') || NATURE_TO_TYPE[g.nature] || 'ASSET';
    const ph = placeholderFromNotes(g.notes || '');
    byPath.set(path, {
      'Account Type': type,
      'Full Account Name': path,
      'Account Name': leafName(path) || g.name,
      'Account ShortCode': g.code || '',
      Description: stripGnuTags(g.notes || '') || g.name,
      Placeholder: ph === false ? 'F' : 'T',
      Hidden: 'F',
      Notes: '',
    });
  }

  for (const led of ledgers) {
    const tagged = pathFromNotes(led.notes || '');
    let path = tagged;
    if (!path) {
      const g = groupById.get(led.groupId);
      const gp = g ? reconstructGroupPath(g, groupById) : '';
      path = gp ? `${gp}:${led.name}` : led.name;
    }
    if (!path || path.startsWith('__')) continue;
    const type = typeFromNotes(led.notes || '') || NATURE_TO_TYPE[led.nature] || 'ASSET';
    // Ledger / posting account — Placeholder F (overwrites group-only row at same path)
    byPath.set(path, {
      'Account Type': type,
      'Full Account Name': path,
      'Account Name': leafName(path) || led.name,
      'Account ShortCode': led.code || '',
      Description: stripGnuTags(led.notes || '') || led.name,
      Placeholder: 'F',
      Hidden: led.isActive === false ? 'T' : 'F',
      Notes: '',
    });
  }

  const rows = [...byPath.values()].sort(
    (a, b) =>
      a['Full Account Name'].split(':').length - b['Full Account Name'].split(':').length ||
      a['Full Account Name'].localeCompare(b['Full Account Name'])
  );

  const safe = String(book?.name || 'book')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  return {
    csvText: buildCsv([...GNUCASH_ACCOUNT_LABELS], rows),
    fileName: `${safe}_accounts.csv`,
    rowCount: rows.length,
  };
}

/**
 * Export transactions CSV matching import labels (GNUCash-compatible).
 * @param {string} bookId
 */
export async function exportGnuCashTransactions(bookId) {
  const book = await bookService.getBook(bookId);
  const [vouchers, lines, ledgers, groups] = await Promise.all([
    voucherRepository.findByBook(bookId),
    voucherLineRepository.findByBook(bookId),
    coaService.listLedgers(bookId),
    coaService.listGroups(bookId),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const ledgerById = new Map(ledgers.map((l) => [l.id, l]));

  /** @type {Map<string, string>} */
  const pathByLedgerId = new Map();
  for (const led of ledgers) {
    const tagged = pathFromNotes(led.notes || '');
    if (tagged) {
      pathByLedgerId.set(led.id, tagged);
      continue;
    }
    const g = groupById.get(led.groupId);
    const gp = g ? reconstructGroupPath(g, groupById) : '';
    pathByLedgerId.set(led.id, gp ? `${gp}:${led.name}` : led.name);
  }

  /** @type {Map<string, typeof lines>} */
  const linesByVoucher = new Map();
  for (const line of lines) {
    if (!linesByVoucher.has(line.voucherId)) linesByVoucher.set(line.voucherId, []);
    linesByVoucher.get(line.voucherId).push(line);
  }

  const sortedVouchers = [...vouchers].sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    if (d !== 0) return d;
    return String(a.voucherNumber).localeCompare(String(b.voucherNumber));
  });

  /** @type {Record<string, string>[]} */
  const rows = [];

  for (const v of sortedVouchers) {
    const splits = (linesByVoucher.get(v.id) || []).sort(
      (a, b) => (a.lineNo || 0) - (b.lineNo || 0)
    );
    if (splits.length === 0) continue;

    const txnId = txnIdFromNarration(v.narration) || v.id;
    const rawDesc = stripTxnTag(v.narration || '');
    let description = rawDesc;
    let notes = '';
    const sep = ' — ';
    const sepAt = rawDesc.indexOf(sep);
    if (sepAt >= 0) {
      description = rawDesc.slice(0, sepAt);
      notes = rawDesc.slice(sepAt + sep.length);
    }

    const number = /^GC-/i.test(v.voucherNumber || '') ? '' : v.voucherNumber || '';

    for (const line of splits) {
      const amt = roundMoney((line.debit || 0) - (line.credit || 0));
      if (amt === 0) continue;
      const fullName = pathByLedgerId.get(line.ledgerId) || ledgerById.get(line.ledgerId)?.name || '';
      rows.push({
        Date: formatGnuCashDate(v.date),
        'Transaction ID': txnId,
        Number: number,
        Description: description,
        Notes: notes,
        'Void Reason': '',
        Memo: line.narration || '',
        'Full Account Name': fullName,
        'Account Name': leafName(fullName),
        'Amount Num.': formatGnuCashAmount(amt),
        'Value Num.': formatGnuCashAmount(amt),
      });
    }
  }

  const safe = String(book?.name || 'book')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  return {
    csvText: buildCsv([...GNUCASH_TXN_LABELS], rows),
    fileName: `${safe}_transactions.csv`,
    rowCount: rows.length,
    voucherCount: sortedVouchers.length,
  };
}

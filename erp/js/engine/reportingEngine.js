/**
 * Reporting engine — all totals computed from openings + voucher lines.
 * Never persist report aggregates (spec section 12).
 */

import {
  ACCOUNT_NATURES,
  NATURE_ORDER,
  isBalanceSheetNature,
  isProfitAndLossNature,
  normalBalanceFor,
} from '../core/accountTypes.js';
import { roundMoney, moneyEquals } from '../utils/money.js';

/**
 * @typedef {import('../models/types.js').Ledger} Ledger
 * @typedef {import('../models/types.js').VoucherLine} VoucherLine
 * @typedef {import('../models/types.js').Voucher} Voucher
 * @typedef {import('../models/types.js').LedgerGroup} LedgerGroup
 *
 * @typedef {{
 *   ledgerId: string,
 *   openingDebit: number,
 *   openingCredit: number,
 *   periodDebit: number,
 *   periodCredit: number,
 *   closingDebit: number,
 *   closingCredit: number,
 *   signedClosing: number
 * }} LedgerMovement
 *
 * @typedef {{
 *   type: 'group',
 *   group: LedgerGroup,
 *   children: GroupNode[],
 *   ledgers: Ledger[]
 * }} GroupNode
 */

/**
 * Opening as debit/credit pair from ledger master.
 * @param {Ledger} ledger
 */
export function openingPair(ledger) {
  const amt = roundMoney(ledger.openingBalance || 0);
  if (amt === 0) return { debit: 0, credit: 0 };
  if (ledger.openingBalanceType === 'credit') {
    return { debit: 0, credit: amt };
  }
  return { debit: amt, credit: 0 };
}

/**
 * Signed balance: positive = debit, negative = credit.
 * Closing = OpeningDr - OpeningCr + PeriodDr - PeriodCr
 * @param {number} openingDebit
 * @param {number} openingCredit
 * @param {number} periodDebit
 * @param {number} periodCredit
 */
export function signedBalance(openingDebit, openingCredit, periodDebit, periodCredit) {
  return roundMoney(openingDebit - openingCredit + periodDebit - periodCredit);
}

/**
 * Present signed amount as closing Dr/Cr columns.
 * @param {number} signed
 */
export function toDrCr(signed) {
  const n = roundMoney(signed);
  if (n > 0) return { debit: n, credit: 0 };
  if (n < 0) return { debit: 0, credit: roundMoney(-n) };
  return { debit: 0, credit: 0 };
}

/**
 * Aggregate movements for every ledger.
 * When fromDate is set, lines before fromDate roll into opening (brought forward),
 * then opening is netted to a single Dr/Cr side via toDrCr.
 *
 * @param {Ledger[]} ledgers
 * @param {VoucherLine[]} lines
 * @param {{ fromDate?: string, toDate?: string, asOfDate?: string }} range
 * @returns {Map<string, LedgerMovement>}
 */
export function computeLedgerMovements(ledgers, lines, range = {}) {
  /** @type {Map<string, LedgerMovement>} */
  const map = new Map();

  for (const led of ledgers) {
    const open = openingPair(led);
    map.set(led.id, {
      ledgerId: led.id,
      openingDebit: open.debit,
      openingCredit: open.credit,
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
      signedClosing: 0,
    });
  }

  const from = range.fromDate || '';
  const to = range.toDate || range.asOfDate || '';

  for (const line of lines) {
    const m = map.get(line.ledgerId);
    if (!m) continue;
    const d = String(line.date || '');
    if (to && d > to) continue;

    if (from && d < from) {
      m.openingDebit = roundMoney(m.openingDebit + (line.debit || 0));
      m.openingCredit = roundMoney(m.openingCredit + (line.credit || 0));
      continue;
    }

    m.periodDebit = roundMoney(m.periodDebit + (line.debit || 0));
    m.periodCredit = roundMoney(m.periodCredit + (line.credit || 0));
  }

  for (const m of map.values()) {
    const open = toDrCr(roundMoney(m.openingDebit - m.openingCredit));
    m.openingDebit = open.debit;
    m.openingCredit = open.credit;

    m.signedClosing = signedBalance(
      m.openingDebit,
      m.openingCredit,
      m.periodDebit,
      m.periodCredit
    );
    const close = toDrCr(m.signedClosing);
    m.closingDebit = close.debit;
    m.closingCredit = close.credit;
  }

  return map;
}

/**
 * @param {{ sortOrder?: number, name: string }} a
 * @param {{ sortOrder?: number, name: string }} b
 */
function bySortThenName(a, b) {
  return (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
}

/**
 * Build COA forest (group tree with ledgers) sorted by sortOrder then name;
 * roots ordered by NATURE_ORDER.
 * @param {LedgerGroup[]} groups
 * @param {Ledger[]} ledgers
 * @returns {GroupNode[]}
 */
export function buildCoaForest(groups, ledgers) {
  /** @type {Map<string, Ledger[]>} */
  const ledgersByGroup = new Map();
  for (const led of ledgers) {
    if (!ledgersByGroup.has(led.groupId)) ledgersByGroup.set(led.groupId, []);
    ledgersByGroup.get(led.groupId).push(led);
  }
  for (const list of ledgersByGroup.values()) {
    list.sort(bySortThenName);
  }

  /** @type {Map<string, LedgerGroup[]>} */
  const childrenByParent = new Map();
  for (const g of groups) {
    const key = g.parentId || '__root__';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(g);
  }
  for (const list of childrenByParent.values()) {
    list.sort(bySortThenName);
  }

  /**
   * @param {string|null} parentId
   * @returns {GroupNode[]}
   */
  function buildNodes(parentId) {
    const kids = childrenByParent.get(parentId || '__root__') || [];
    return kids.map((g) => ({
      type: /** @type {'group'} */ ('group'),
      group: g,
      children: buildNodes(g.id),
      ledgers: ledgersByGroup.get(g.id) || [],
    }));
  }

  const roots = buildNodes(null);
  roots.sort((a, b) => {
    const ia = NATURE_ORDER.indexOf(a.group.nature);
    const ib = NATURE_ORDER.indexOf(b.group.nature);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.group.name.localeCompare(b.group.name);
  });
  return roots;
}

/**
 * Flatten a group forest into hierarchical display rows with rolled-up amounts.
 *
 * Emits per group: header → child blocks → ledgers → subtotal.
 * Skips empty groups unless `includeEmptyGroups`.
 * Row kinds: `group` | `ledger` | `subtotal`.
 *
 * @param {GroupNode[]} roots
 * @param {(ledger: Ledger) => Record<string, number>|null} leafValues
 * @param {{ includeEmptyGroups?: boolean }} [opts]
 * @returns {any[]}
 */
export function flattenHierarchy(roots, leafValues, opts = {}) {
  const includeEmpty = Boolean(opts.includeEmptyGroups);
  /** @type {any[]} */
  const rows = [];

  /**
   * @param {Record<string, number>} totals
   * @param {Record<string, number>|null|undefined} src
   */
  function mergeTotals(totals, src) {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== 'number') continue;
      totals[k] = roundMoney((totals[k] || 0) + v);
    }
  }

  /**
   * @param {GroupNode} node
   * @param {number} depth
   * @param {any[]} out
   * @returns {Record<string, number>|null}
   */
  function buildBlock(node, depth, out) {
    /** @type {any[]} */
    const body = [];
    /** @type {Record<string, number>} */
    const totals = {};

    for (const child of node.children) {
      const childRows = [];
      const childTotals = buildBlock(child, depth + 1, childRows);
      if (childTotals) {
        mergeTotals(totals, childTotals);
        body.push(...childRows);
      }
    }

    for (const led of node.ledgers) {
      const vals = leafValues(led);
      if (!vals) continue;
      mergeTotals(totals, vals);
      body.push({
        kind: 'ledger',
        depth: depth + 1,
        id: led.id,
        ledgerId: led.id,
        name: led.name,
        code: led.code || '',
        nature: led.nature,
        ...vals,
      });
    }

    const hasActivity = Object.values(totals).some((v) => roundMoney(v) !== 0);
    if (!hasActivity && !includeEmpty) return null;

    out.push({
      kind: 'group',
      depth,
      id: node.group.id,
      groupId: node.group.id,
      name: node.group.name,
      code: node.group.code || '',
      nature: node.group.nature,
    });
    out.push(...body);
    out.push({
      kind: 'subtotal',
      depth,
      id: `total:${node.group.id}`,
      groupId: node.group.id,
      name: `Total ${node.group.name}`,
      nature: node.group.nature,
      ...totals,
    });
    return totals;
  }

  for (const root of roots) {
    buildBlock(root, 0, rows);
  }
  return rows;
}

/**
 * Trial Balance — hierarchical with group subtotals.
 * Totals are summed from ledger rows only; `balanced` compares closing Dr/Cr.
 * @param {Ledger[]} ledgers
 * @param {LedgerGroup[]} groups
 * @param {Map<string, LedgerMovement>} movements
 * @param {{ includeZero?: boolean }} [opts]
 */
export function buildTrialBalance(ledgers, groups, movements, opts = {}) {
  const includeZero = Boolean(opts.includeZero);
  const forest = buildCoaForest(groups, ledgers);

  const rows = flattenHierarchy(
    forest,
    (led) => {
      const m = movements.get(led.id);
      if (!m) return null;
      const hasActivity =
        m.openingDebit ||
        m.openingCredit ||
        m.periodDebit ||
        m.periodCredit ||
        m.closingDebit ||
        m.closingCredit;
      if (!includeZero && !hasActivity) return null;
      return {
        openingDebit: m.openingDebit,
        openingCredit: m.openingCredit,
        periodDebit: m.periodDebit,
        periodCredit: m.periodCredit,
        closingDebit: m.closingDebit,
        closingCredit: m.closingCredit,
      };
    },
    { includeEmptyGroups: includeZero }
  );

  let totOpenDr = 0;
  let totOpenCr = 0;
  let totPerDr = 0;
  let totPerCr = 0;
  let totCloseDr = 0;
  let totCloseCr = 0;

  for (const r of rows) {
    if (r.kind !== 'ledger') continue;
    totOpenDr = roundMoney(totOpenDr + (r.openingDebit || 0));
    totOpenCr = roundMoney(totOpenCr + (r.openingCredit || 0));
    totPerDr = roundMoney(totPerDr + (r.periodDebit || 0));
    totPerCr = roundMoney(totPerCr + (r.periodCredit || 0));
    totCloseDr = roundMoney(totCloseDr + (r.closingDebit || 0));
    totCloseCr = roundMoney(totCloseCr + (r.closingCredit || 0));
  }

  return {
    rows,
    totals: {
      openingDebit: totOpenDr,
      openingCredit: totOpenCr,
      periodDebit: totPerDr,
      periodCredit: totPerCr,
      closingDebit: totCloseDr,
      closingCredit: totCloseCr,
    },
    balanced: moneyEquals(totCloseDr, totCloseCr),
  };
}

/**
 * Profit & Loss — hierarchical Income / Expense trees.
 * Income amount = -signed; expense amount = +signed; zeros skipped.
 * @param {Ledger[]} ledgers
 * @param {LedgerGroup[]} groups
 * @param {Map<string, LedgerMovement>} movements
 */
export function buildProfitAndLoss(ledgers, groups, movements) {
  const forest = buildCoaForest(groups, ledgers);
  const incomeRoots = forest.filter((n) => n.group.nature === ACCOUNT_NATURES.INCOME);
  const expenseRoots = forest.filter((n) => n.group.nature === ACCOUNT_NATURES.EXPENSE);

  /**
   * @param {Ledger} led
   * @param {'income'|'expense'} side
   */
  function leafAmount(led, side) {
    if (side === 'income' && led.nature !== ACCOUNT_NATURES.INCOME) return null;
    if (side === 'expense' && led.nature !== ACCOUNT_NATURES.EXPENSE) return null;
    const m = movements.get(led.id);
    if (!m) return null;
    const signed = signedBalance(0, 0, m.periodDebit, m.periodCredit);
    const amount = side === 'income' ? roundMoney(-signed) : roundMoney(signed);
    // Period-only: prior-year balances must not flow into this P&L
    if (amount === 0 && !m.periodDebit && !m.periodCredit) return null;
    if (amount === 0) return null;
    return { amount };
  }

  const incomeRows = flattenHierarchy(incomeRoots, (led) => leafAmount(led, 'income'));
  const expenseRows = flattenHierarchy(expenseRoots, (led) => leafAmount(led, 'expense'));

  let incomeTotal = 0;
  let expenseTotal = 0;
  for (const r of incomeRows) {
    if (r.kind === 'ledger') incomeTotal = roundMoney(incomeTotal + (r.amount || 0));
  }
  for (const r of expenseRows) {
    if (r.kind === 'ledger') expenseTotal = roundMoney(expenseTotal + (r.amount || 0));
  }

  const netProfit = roundMoney(incomeTotal - expenseTotal);

  return {
    incomeRows,
    expenseRows,
    incomeTotal,
    expenseTotal,
    netProfit,
    isProfit: netProfit >= 0,
  };
}

/**
 * Balance Sheet as-of date — hierarchical per nature; plugs net profit into equity.
 * @param {Ledger[]} ledgers
 * @param {LedgerGroup[]} groups
 * @param {Map<string, LedgerMovement>} movements
 * @param {{ netProfit: number }} pnl
 */
export function buildBalanceSheet(ledgers, groups, movements, pnl) {
  const forest = buildCoaForest(groups, ledgers);

  /**
   * @param {string} nature
   */
  function section(nature) {
    const roots = forest.filter((n) => n.group.nature === nature);
    const rows = flattenHierarchy(roots, (led) => {
      if (led.nature !== nature) return null;
      const m = movements.get(led.id);
      if (!m) return null;
      const signed = m.signedClosing;
      const normal = normalBalanceFor(nature);
      const amount =
        normal === 'debit' ? roundMoney(signed) : roundMoney(-signed);
      if (amount === 0) return null;
      return { amount };
    });

    let total = 0;
    for (const r of rows) {
      if (r.kind === 'ledger') total = roundMoney(total + (r.amount || 0));
    }
    return { rows, total };
  }

  const assets = section(ACCOUNT_NATURES.ASSET);
  const liabilities = section(ACCOUNT_NATURES.LIABILITY);
  const equity = section(ACCOUNT_NATURES.EQUITY);

  const netProfit = roundMoney(pnl.netProfit || 0);
  if (netProfit !== 0) {
    equity.rows.push({
      kind: 'ledger',
      depth: 1,
      ledgerId: '__net_profit__',
      id: '__net_profit__',
      name: netProfit >= 0 ? 'Current Period Profit' : 'Current Period Loss',
      amount: netProfit,
      isPlug: true,
    });
    equity.total = roundMoney(equity.total + netProfit);
  }

  const financing = roundMoney(liabilities.total + equity.total);
  const balanced = moneyEquals(assets.total, financing);

  return {
    assets,
    liabilities,
    equity,
    totals: {
      assets: assets.total,
      liabilities: liabilities.total,
      equity: equity.total,
      liabilitiesAndEquity: financing,
    },
    netProfit,
    balanced,
    difference: roundMoney(assets.total - financing),
  };
}

/**
 * Ledger statement with brought-forward opening and closing for the date range.
 * Opening always shown when fromDate is set; running balance is continuous.
 * When `pathByLedgerId` is provided, each period row includes `targetAccount`
 * (full colon-separated path of the opposite-side account(s) on the voucher).
 * @param {Ledger} ledger
 * @param {VoucherLine[]} lines
 * @param {Map<string, Voucher>} vouchersById
 * @param {{ fromDate?: string, toDate?: string, pathByLedgerId?: Map<string, string> }} range
 */
export function buildLedgerStatement(ledger, lines, vouchersById, range = {}) {
  const master = openingPair(ledger);
  const from = range.fromDate || '';
  const to = range.toDate || '';
  const pathByLedgerId = range.pathByLedgerId || null;

  /** @type {Map<string, VoucherLine[]>|null} */
  let linesByVoucher = null;
  if (pathByLedgerId) {
    linesByVoucher = new Map();
    for (const line of lines) {
      if (!linesByVoucher.has(line.voucherId)) linesByVoucher.set(line.voucherId, []);
      linesByVoucher.get(line.voucherId).push(line);
    }
  }

  const all = lines
    .filter((l) => l.ledgerId === ledger.id)
    .sort((a, b) => {
      const d = String(a.date).localeCompare(String(b.date));
      if (d !== 0) return d;
      return (a.lineNo || 0) - (b.lineNo || 0);
    });

  let running = roundMoney(master.debit - master.credit);

  for (const line of all) {
    const d = String(line.date || '');
    if (from && d < from) {
      running = roundMoney(running + (line.debit || 0) - (line.credit || 0));
    }
  }

  const opening = toDrCr(running);
  /** @type {any[]} */
  const entries = [];

  if (from || opening.debit || opening.credit) {
    entries.push({
      date: from || '',
      voucherId: null,
      voucherNumber: '',
      voucherType: 'Opening',
      narration: from ? 'Opening balance (brought forward)' : 'Opening balance',
      debit: opening.debit,
      credit: opening.credit,
      balance: Math.abs(running),
      balanceSide: running >= 0 ? 'Dr' : 'Cr',
      signedBalance: running,
      isOpening: true,
      targetAccount: '',
    });
  }

  let periodDebit = 0;
  let periodCredit = 0;

  for (const line of all) {
    const d = String(line.date || '');
    if (from && d < from) continue;
    if (to && d > to) continue;

    running = roundMoney(running + (line.debit || 0) - (line.credit || 0));
    periodDebit = roundMoney(periodDebit + (line.debit || 0));
    periodCredit = roundMoney(periodCredit + (line.credit || 0));
    const v = vouchersById.get(line.voucherId);
    entries.push({
      date: line.date,
      voucherId: line.voucherId,
      voucherNumber: v?.voucherNumber || '',
      voucherType: v?.voucherType || line.voucherType || '',
      narration: line.narration || v?.narration || '',
      debit: line.debit || 0,
      credit: line.credit || 0,
      balance: Math.abs(running),
      balanceSide: running >= 0 ? 'Dr' : 'Cr',
      signedBalance: running,
      targetAccount: pathByLedgerId
        ? resolveTargetAccount(line, ledger.id, linesByVoucher, pathByLedgerId)
        : '',
    });
  }

  const closing = toDrCr(running);

  if (to || opening.debit || opening.credit || periodDebit || periodCredit) {
    entries.push({
      date: to || '',
      voucherId: null,
      voucherNumber: '',
      voucherType: 'Closing',
      narration: 'Closing balance',
      debit: closing.debit,
      credit: closing.credit,
      balance: Math.abs(running),
      balanceSide: running >= 0 ? 'Dr' : 'Cr',
      signedBalance: running,
      isClosing: true,
      targetAccount: '',
    });
  }

  return {
    ledger,
    entries,
    opening,
    periodDebit,
    periodCredit,
    closing,
    signedClosing: running,
    ledgerPath: pathByLedgerId?.get(ledger.id) || ledger.name,
  };
}

/**
 * Opposite-side account path(s) on the same voucher (colon-separated full names).
 * @param {VoucherLine} line
 * @param {string} selfLedgerId
 * @param {Map<string, VoucherLine[]>|null} linesByVoucher
 * @param {Map<string, string>} pathByLedgerId
 */
function resolveTargetAccount(line, selfLedgerId, linesByVoucher, pathByLedgerId) {
  if (!linesByVoucher || !line.voucherId) return '';
  const siblings = linesByVoucher.get(line.voucherId) || [];
  const isDebit = (line.debit || 0) > 0;
  let others = siblings.filter((l) => l.ledgerId && l.ledgerId !== selfLedgerId);
  const opposite = others.filter((l) =>
    isDebit ? (l.credit || 0) > 0 : (l.debit || 0) > 0
  );
  if (opposite.length) others = opposite;

  /** @type {string[]} */
  const paths = [];
  const seen = new Set();
  for (const o of others) {
    if (seen.has(o.ledgerId)) continue;
    seen.add(o.ledgerId);
    paths.push(pathByLedgerId.get(o.ledgerId) || o.ledgerId);
  }
  return paths.join(', ');
}

/**
 * Truncate a colon-separated account path to the first `level` segments (1–6).
 * @param {string} fullPath
 * @param {number} level
 */
export function truncateAccountPath(fullPath, level) {
  const parts = String(fullPath || '')
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '(Unassigned)';
  const n = Math.max(1, Math.min(6, Number(level) || 1));
  return parts.slice(0, n).join(':');
}

/**
 * Accounts summary — debits and credits of a selected ledger, grouped by target
 * account path truncated to `groupLevel` (1 = top segment, up to 6).
 * @param {Ledger} ledger
 * @param {VoucherLine[]} lines
 * @param {Map<string, string>} pathByLedgerId
 * @param {{ fromDate?: string, toDate?: string, groupLevel?: number }} opts
 */
export function buildAccountSummary(ledger, lines, pathByLedgerId, opts = {}) {
  const from = opts.fromDate || '';
  const to = opts.toDate || '';
  const groupLevel = Math.max(1, Math.min(6, Number(opts.groupLevel) || 1));

  /** @type {Map<string, VoucherLine[]>} */
  const linesByVoucher = new Map();
  for (const line of lines) {
    if (!linesByVoucher.has(line.voucherId)) linesByVoucher.set(line.voucherId, []);
    linesByVoucher.get(line.voucherId).push(line);
  }

  /** @type {Map<string, { targetGroup: string, amount: number, entryCount: number }>} */
  const debitMap = new Map();
  /** @type {Map<string, { targetGroup: string, amount: number, entryCount: number }>} */
  const creditMap = new Map();

  /**
   * @param {Map<string, { targetGroup: string, amount: number, entryCount: number }>} map
   * @param {string} key
   * @param {number} amount
   */
  function add(map, key, amount) {
    const amt = roundMoney(amount);
    if (amt <= 0) return;
    const prev = map.get(key) || { targetGroup: key, amount: 0, entryCount: 0 };
    prev.amount = roundMoney(prev.amount + amt);
    prev.entryCount += 1;
    map.set(key, prev);
  }

  for (const line of lines) {
    if (line.ledgerId !== ledger.id) continue;
    const d = String(line.date || '');
    if (from && d < from) continue;
    if (to && d > to) continue;

    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit <= 0 && credit <= 0) continue;

    const isDebit = debit > 0;
    const amount = isDebit ? debit : credit;
    const siblings = linesByVoucher.get(line.voucherId) || [];
    const opposites = siblings.filter(
      (l) =>
        l.ledgerId &&
        l.ledgerId !== ledger.id &&
        (isDebit ? (Number(l.credit) || 0) > 0 : (Number(l.debit) || 0) > 0)
    );

    const targetMap = isDebit ? debitMap : creditMap;

    if (opposites.length === 0) {
      add(targetMap, '(No target)', amount);
      continue;
    }

    const oppAmounts = opposites.map((l) =>
      isDebit ? Number(l.credit) || 0 : Number(l.debit) || 0
    );
    const oppTotal = oppAmounts.reduce((s, n) => s + n, 0);
    if (oppTotal <= 0) {
      add(targetMap, '(No target)', amount);
      continue;
    }

    /** @type {{ key: string, share: number }[]} */
    const shares = [];
    let allocated = 0;
    for (let i = 0; i < opposites.length; i++) {
      const full = pathByLedgerId.get(opposites[i].ledgerId) || opposites[i].ledgerId;
      const key = truncateAccountPath(full, groupLevel);
      let share =
        i === opposites.length - 1
          ? roundMoney(amount - allocated)
          : roundMoney((amount * oppAmounts[i]) / oppTotal);
      if (share < 0) share = 0;
      allocated = roundMoney(allocated + share);
      shares.push({ key, share });
    }
    for (const s of shares) add(targetMap, s.key, s.share);
  }

  /**
   * @param {Map<string, { targetGroup: string, amount: number, entryCount: number }>} map
   */
  function sortedRows(map) {
    return [...map.values()].sort((a, b) => {
      const byAmt = b.amount - a.amount;
      if (byAmt !== 0) return byAmt;
      return a.targetGroup.localeCompare(b.targetGroup);
    });
  }

  const debits = sortedRows(debitMap);
  const credits = sortedRows(creditMap);
  const totalDebit = roundMoney(debits.reduce((s, r) => s + r.amount, 0));
  const totalCredit = roundMoney(credits.reduce((s, r) => s + r.amount, 0));

  return {
    ledger,
    ledgerPath: pathByLedgerId.get(ledger.id) || ledger.name,
    groupLevel,
    fromDate: from,
    toDate: to,
    debits,
    credits,
    totalDebit,
    totalCredit,
  };
}

/**
 * Day book — vouchers in date range with lines.
 * @param {Voucher[]} vouchers
 * @param {VoucherLine[]} lines
 * @param {{ fromDate?: string, toDate?: string }} range
 */
export function buildDayBook(vouchers, lines, range = {}) {
  const from = range.fromDate || '';
  const to = range.toDate || '';

  /** @type {Map<string, VoucherLine[]>} */
  const linesByVoucher = new Map();
  for (const line of lines) {
    if (!linesByVoucher.has(line.voucherId)) linesByVoucher.set(line.voucherId, []);
    linesByVoucher.get(line.voucherId).push(line);
  }

  const filtered = vouchers
    .filter((v) => {
      if (from && v.date < from) return false;
      if (to && v.date > to) return false;
      return true;
    })
    .sort((a, b) => {
      const d = String(a.date).localeCompare(String(b.date));
      if (d !== 0) return d;
      return String(a.voucherNumber).localeCompare(String(b.voucherNumber));
    });

  return filtered.map((v) => ({
    voucher: v,
    lines: (linesByVoucher.get(v.id) || []).sort(
      (a, b) => (a.lineNo || 0) - (b.lineNo || 0)
    ),
  }));
}

/**
 * Simple cash flow: receipts vs payments on Cash/Bank asset ledgers in period.
 * @param {Ledger[]} ledgers
 * @param {VoucherLine[]} lines
 * @param {{ fromDate?: string, toDate?: string }} range
 * @param {(ledger: Ledger) => boolean} isCashOrBank
 */
export function buildCashFlow(ledgers, lines, range, isCashOrBank) {
  const cashIds = new Set(ledgers.filter(isCashOrBank).map((l) => l.id));
  const from = range.fromDate || '';
  const to = range.toDate || '';

  let inflow = 0;
  let outflow = 0;
  /** @type {any[]} */
  const inflowRows = [];
  /** @type {any[]} */
  const outflowRows = [];

  for (const line of lines) {
    if (!cashIds.has(line.ledgerId)) continue;
    const d = String(line.date || '');
    if (from && d < from) continue;
    if (to && d > to) continue;

    const led = ledgers.find((l) => l.id === line.ledgerId);
    if ((line.debit || 0) > 0) {
      inflow = roundMoney(inflow + line.debit);
      inflowRows.push({
        date: line.date,
        ledgerName: led?.name || '',
        voucherId: line.voucherId,
        amount: line.debit,
      });
    }
    if ((line.credit || 0) > 0) {
      outflow = roundMoney(outflow + line.credit);
      outflowRows.push({
        date: line.date,
        ledgerName: led?.name || '',
        voucherId: line.voucherId,
        amount: line.credit,
      });
    }
  }

  return {
    inflow,
    outflow,
    net: roundMoney(inflow - outflow),
    inflowRows,
    outflowRows,
  };
}

export { NATURE_ORDER, isBalanceSheetNature, isProfitAndLossNature };

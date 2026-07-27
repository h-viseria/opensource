/**
 * Report application service — loads data and runs reporting engine.
 */

import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { ledgerGroupRepository } from '../repositories/ledgerGroupRepository.js';
import { voucherRepository } from '../repositories/voucherRepository.js';
import { voucherLineRepository } from '../repositories/voucherLineRepository.js';
import * as bookService from './bookService.js';
import {
  computeLedgerMovements,
  buildTrialBalance,
  buildProfitAndLoss,
  buildBalanceSheet,
  buildLedgerStatement,
  buildAccountSummary,
  buildDayBook,
  buildCashFlow,
} from '../engine/reportingEngine.js';
import { toDateInput, suggestFyLabel } from '../utils/date.js';
import { buildLedgerPathMap } from './coaService.js';

/**
 * Default report range = active financial year.
 */
export async function getDefaultRange() {
  const session = await bookService.getSessionContext();
  if (!session.book || !session.financialYear) {
    throw new Error('Open a book with an active financial year first');
  }
  const today = toDateInput(new Date());
  const fyStart = session.financialYear.startDate;
  const fyEnd = session.financialYear.endDate;
  const asOfDate = today >= fyStart && today <= fyEnd ? today : fyEnd;
  return {
    book: session.book,
    financialYear: session.financialYear,
    fromDate: fyStart,
    toDate: fyEnd,
    asOfDate,
  };
}

/**
 * FY options for report filters (label + from/to). Selecting one only sets dates.
 * Includes stored financial years plus years covering voucher activity.
 *
 * @param {string} bookId
 * @returns {Promise<{ id: string, label: string, fromDate: string, toDate: string }[]>}
 */
export async function listFyFilterOptions(bookId) {
  const book = await bookService.getBook(bookId);
  if (!book) return [];
  const startMonth = Number(book.fyStartMonth) || 4;
  const years = await bookService.listFinancialYears(bookId);
  const lines = await voucherLineRepository.findByBook(bookId);

  /** @type {Map<string, { id: string, label: string, fromDate: string, toDate: string }>} */
  const map = new Map();

  /**
   * @param {string} startDate
   * @param {string} endDate
   * @param {string} [id]
   */
  function addFy(startDate, endDate, id) {
    if (!startDate || !endDate) return;
    const key = `${startDate}|${endDate}`;
    if (map.has(key)) return;
    map.set(key, {
      id: id || key,
      label: formatFyFilterLabel(startDate, endDate),
      fromDate: startDate,
      toDate: endDate,
    });
  }

  for (const y of years) {
    addFy(y.startDate, y.endDate, y.id);
  }

  let minD = '';
  let maxD = '';
  for (const line of lines) {
    const d = String(line.date || '');
    if (!d) continue;
    if (!minD || d < minD) minD = d;
    if (!maxD || d > maxD) maxD = d;
  }

  // Always include active / current FY span around today
  const today = toDateInput(new Date());
  const todayBounds = fyBoundsForDate(today, startMonth);
  addFy(todayBounds.startDate, todayBounds.endDate);

  if (minD) {
    const startBounds = fyBoundsForDate(minD, startMonth);
    let cursor = startBounds.startDate;
    let guard = 0;
    while (guard++ < 40) {
      const bounds = fyBoundsFromStart(cursor, startMonth);
      addFy(bounds.startDate, bounds.endDate);
      if (bounds.endDate >= (maxD || today)) break;
      const next = new Date(`${bounds.startDate}T12:00:00`);
      next.setFullYear(next.getFullYear() + 1);
      cursor = toDateInput(next);
    }
  }

  return [...map.values()].sort((a, b) => b.fromDate.localeCompare(a.fromDate));
}

/**
 * @param {string} isoDate
 * @param {number} fyStartMonth 1–12
 */
export function fyBoundsForDate(isoDate, fyStartMonth = 4) {
  const d = new Date(`${isoDate}T12:00:00`);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const startYear = month >= fyStartMonth ? year : year - 1;
  return fyBoundsFromStart(
    `${startYear}-${String(fyStartMonth).padStart(2, '0')}-01`,
    fyStartMonth
  );
}

/**
 * @param {string} startDate YYYY-MM-DD
 * @param {number} fyStartMonth
 */
export function fyBoundsFromStart(startDate, fyStartMonth = 4) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return {
    startDate: toDateInput(start),
    endDate: toDateInput(end),
  };
}

/**
 * @param {string} startDate
 * @param {string} endDate
 */
export function formatFyFilterLabel(startDate, endDate) {
  const sy = Number(String(startDate).slice(0, 4));
  const ey = Number(String(endDate).slice(0, 4));
  if (!sy || !ey) return suggestFyLabel(new Date(`${startDate}T12:00:00`));
  if (sy === ey) return `FY ${sy}`;
  return `FY ${sy}-${String(ey).slice(-2)}`;
}

/**
 * Match current from/to to an FY option value (`from|to`), or ''.
 * @param {string} fromDate
 * @param {string} toDate
 * @param {{ fromDate: string, toDate: string }[]} fyOptions
 */
export function matchFyFilterValue(fromDate, toDate, fyOptions) {
  const hit = (fyOptions || []).find(
    (o) => o.fromDate === fromDate && o.toDate === toDate
  );
  return hit ? `${hit.fromDate}|${hit.toDate}` : '';
}

/**
 * @param {string} bookId
 */
async function loadBookData(bookId) {
  const [ledgers, groups, vouchers, lines] = await Promise.all([
    ledgerRepository.findByBook(bookId),
    ledgerGroupRepository.findByBook(bookId),
    voucherRepository.findByBook(bookId),
    voucherLineRepository.findByBook(bookId),
  ]);
  return { ledgers, groups, vouchers, lines };
}

/**
 * @param {string} bookId
 * @param {{ fromDate?: string, toDate?: string, includeZero?: boolean }} [opts]
 */
export async function trialBalance(bookId, opts = {}) {
  const { ledgers, groups, lines } = await loadBookData(bookId);
  const fromDate = opts.fromDate;
  const toDate = opts.toDate;
  const movements = computeLedgerMovements(ledgers, lines, { fromDate, toDate });
  const report = buildTrialBalance(ledgers, groups, movements, {
    includeZero: opts.includeZero,
  });
  return { ...report, fromDate, toDate };
}

/**
 * @param {string} bookId
 * @param {{ fromDate?: string, toDate?: string }} [opts]
 */
export async function profitAndLoss(bookId, opts = {}) {
  const { ledgers, groups, lines } = await loadBookData(bookId);
  const fromDate = opts.fromDate;
  const toDate = opts.toDate;
  const movements = computeLedgerMovements(ledgers, lines, { fromDate, toDate });
  const report = buildProfitAndLoss(ledgers, groups, movements);
  return { ...report, fromDate, toDate };
}

/**
 * Balance sheet as of toDate; P&L for fromDate..toDate plugged into equity.
 * @param {string} bookId
 * @param {{ fromDate?: string, toDate?: string }} [opts]
 */
export async function balanceSheet(bookId, opts = {}) {
  const { ledgers, groups, lines } = await loadBookData(bookId);
  const fromDate = opts.fromDate;
  const toDate = opts.toDate;

  // BS positions as of toDate (from start of time / openings through toDate)
  const bsMovements = computeLedgerMovements(ledgers, lines, {
    fromDate: undefined,
    toDate,
  });

  // P&L for the reporting period
  const pnlMovements = computeLedgerMovements(ledgers, lines, { fromDate, toDate });
  const pnl = buildProfitAndLoss(ledgers, groups, pnlMovements);

  // For BS, P&L account balances should not appear as assets/liabilities —
  // buildBalanceSheet only uses BS natures. Net profit is plugged.
  // But BS movements for Income/Expense accounts still sit in the map; ignored by section().

  // Important: Asset/Liability/Equity closings as-of toDate already include ALL postings
  // through toDate — including those that affected P&L via double-entry.
  // The net profit plug would double-count if we also keep P&L impact in equity from journals
  // that credited capital directly. Standard approach:
  // - BS accounts (A/L/E) show their closing balances as of date
  // - Current period P&L net is added to equity IF P&L accounts aren't closed to RE yet
  //
  // With open P&L accounts, the trial balance still balances (A+Exp = L+E+Inc).
  // For BS equation Assets = L+E+NetProfit where NetProfit = Inc-Exp, we must EXCLUDE
  // nothing from A/L/E and ADD net profit — but then TB identity says:
  //   Assets + Exp = Liab + Equity + Income
  //   Assets = Liab + Equity + (Income - Exp) = Liab + Equity + NetProfit
  // So plugging net profit is correct when P&L accounts are omitted from the BS body.

  const report = buildBalanceSheet(ledgers, groups, bsMovements, pnl);
  return { ...report, fromDate, toDate, pnl };
}

/**
 * @param {string} bookId
 * @param {string} ledgerId
 * @param {{ fromDate?: string, toDate?: string }} [opts]
 */
export async function ledgerReport(bookId, ledgerId, opts = {}) {
  const { ledgers, vouchers, lines } = await loadBookData(bookId);
  const ledger = ledgers.find((l) => l.id === ledgerId);
  if (!ledger) throw new Error('Ledger not found');
  const vouchersById = new Map(vouchers.map((v) => [v.id, v]));
  const statement = buildLedgerStatement(ledger, lines, vouchersById, opts);
  return { ...statement, fromDate: opts.fromDate, toDate: opts.toDate };
}

/**
 * Ledger statement that also shows the target (contra) account full path.
 * @param {string} bookId
 * @param {string} ledgerId
 * @param {{ fromDate?: string, toDate?: string }} [opts]
 */
export async function ledgerDetailReport(bookId, ledgerId, opts = {}) {
  const { ledgers, groups, vouchers, lines } = await loadBookData(bookId);
  const ledger = ledgers.find((l) => l.id === ledgerId);
  if (!ledger) throw new Error('Ledger not found');
  const pathByLedgerId = buildLedgerPathMap(ledgers, groups);
  const vouchersById = new Map(vouchers.map((v) => [v.id, v]));
  const statement = buildLedgerStatement(ledger, lines, vouchersById, {
    ...opts,
    pathByLedgerId,
  });
  return { ...statement, fromDate: opts.fromDate, toDate: opts.toDate };
}

/**
 * Debits / credits for a ledger, grouped by target account path level.
 * @param {string} bookId
 * @param {string} ledgerId
 * @param {{ fromDate?: string, toDate?: string, groupLevel?: number }} [opts]
 */
export async function accountSummaryReport(bookId, ledgerId, opts = {}) {
  const { ledgers, groups, lines } = await loadBookData(bookId);
  const ledger = ledgers.find((l) => l.id === ledgerId);
  if (!ledger) throw new Error('Ledger not found');
  const pathByLedgerId = buildLedgerPathMap(ledgers, groups);
  return buildAccountSummary(ledger, lines, pathByLedgerId, opts);
}

/**
 * @param {string} bookId
 * @param {{ fromDate?: string, toDate?: string }} [opts]
 */
export async function dayBook(bookId, opts = {}) {
  const { vouchers, lines, ledgers } = await loadBookData(bookId);
  const entries = buildDayBook(vouchers, lines, opts);
  const ledgersById = new Map(ledgers.map((l) => [l.id, l]));
  return {
    entries,
    ledgersById,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
  };
}

/**
 * Cash & Bank movement report (simplified cash flow).
 * @param {string} bookId
 * @param {{ fromDate?: string, toDate?: string }} [opts]
 */
export async function cashFlow(bookId, opts = {}) {
  const { ledgers, lines, groups } = await loadBookData(bookId);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const isCashOrBank = (ledger) => {
    const g = groupById.get(ledger.groupId);
    const gName = (g?.name || '').toLowerCase();
    const lName = (ledger.name || '').toLowerCase();
    return (
      gName.includes('cash') ||
      gName.includes('bank') ||
      lName.includes('cash') ||
      lName.includes('bank')
    );
  };

  const report = buildCashFlow(ledgers, lines, opts, isCashOrBank);
  return { ...report, fromDate: opts.fromDate, toDate: opts.toDate };
}

/**
 * Ledgers list for report filters.
 * @param {string} bookId
 */
export async function listLedgersForReport(bookId) {
  const ledgers = await ledgerRepository.findByBook(bookId);
  return ledgers
    .filter((l) => l.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
}

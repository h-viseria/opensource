/**
 * Portfolio service — cross-book summaries (not tied to active book).
 */

import * as bookService from './bookService.js';
import { financialYearRepository } from '../repositories/financialYearRepository.js';
import { ledgerRepository } from '../repositories/ledgerRepository.js';
import { voucherRepository } from '../repositories/voucherRepository.js';
import * as reportService from './reportService.js';
import { roundMoney } from '../utils/money.js';

/**
 * Summary card for every book in the database.
 */
export async function getPortfolioSummary() {
  const books = await bookService.listBooks();
  const activeId = await bookService.getActiveBookId();

  /** @type {any[]} */
  const items = [];

  for (const book of books) {
    const years = await financialYearRepository.findByBook(book.id);
    const fy = years.find((y) => y.isActive) || years[years.length - 1] || null;
    const [ledgerCount, vouchers] = await Promise.all([
      ledgerRepository.countByBook(book.id),
      voucherRepository.findByBook(book.id),
    ]);

    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    let netProfit = 0;
    let balanced = true;

    if (fy) {
      try {
        const range = { fromDate: fy.startDate, toDate: fy.endDate };
        const [bs, pnl] = await Promise.all([
          reportService.balanceSheet(book.id, range),
          reportService.profitAndLoss(book.id, range),
        ]);
        assets = bs.totals.assets;
        liabilities = bs.totals.liabilities;
        equity = bs.totals.equity;
        netProfit = pnl.netProfit;
        balanced = bs.balanced;
      } catch {
        balanced = false;
      }
    }

    items.push({
      book,
      financialYear: fy,
      isActive: book.id === activeId,
      ledgerCount,
      voucherCount: vouchers.length,
      assets,
      liabilities,
      equity,
      netProfit,
      balanced,
    });
  }

  const totals = items.reduce(
    (acc, row) => {
      acc.books += 1;
      acc.vouchers += row.voucherCount;
      acc.assets = roundMoney(acc.assets + row.assets);
      acc.liabilities = roundMoney(acc.liabilities + row.liabilities);
      acc.equity = roundMoney(acc.equity + row.equity);
      acc.netProfit = roundMoney(acc.netProfit + row.netProfit);
      return acc;
    },
    { books: 0, vouchers: 0, assets: 0, liabilities: 0, equity: 0, netProfit: 0 }
  );

  return { items, totals, activeBookId: activeId || null };
}

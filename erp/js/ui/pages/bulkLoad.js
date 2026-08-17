/**
 * Bulk Load hub.
 */

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderBulkLoad(_ctx, outlet) {
  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-header__title">Bulk Load</h1>
        <p class="page-header__desc">
          Import many transactions from external files into the active book.
        </p>
      </div>
    </div>

    <div class="master-grid">
      <a class="master-card" href="#/bulk-load/bank-statement">
        <div class="master-card__icon">⇄</div>
        <div class="master-card__title">Bank Statement</div>
        <div class="master-card__desc">
          Map a bank CSV (date, amount, narration, target account) and post Payment / Receipt vouchers
        </div>
      </a>
    </div>
  `;
}

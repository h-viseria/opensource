/**
 * Tally Import — XML masters + vouchers with an editable validation step.
 */

import { NATURE_ORDER } from '../../core/accountTypes.js';
import { VOUCHER_TYPE_LIST } from '../../engine/accountingEngine.js';
import { formatMoney } from '../../utils/money.js';
import * as bookService from '../../services/bookService.js';
import * as coaService from '../../services/coaService.js';
import * as voucherService from '../../services/voucherService.js';
import * as tally from '../../services/tallyImportService.js';
import { escapeHtml, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';

const VCH_PAGE_SIZE = 50;

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderTallyImport(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book. Select a book first.</p>`;
    return;
  }

  const [existingGroups, existingLedgers, existingVouchers] = await Promise.all([
    coaService.listGroups(book.id),
    coaService.listLedgers(book.id),
    voucherService.listVouchers(book.id),
  ]);

  let voucherCount = existingVouchers.length;
  let replaceChart = voucherCount === 0;

  /** @type {import('../../services/tallyImportService.js').TallyGroupRow[]} */
  let groups = [];
  /** @type {import('../../services/tallyImportService.js').TallyLedgerRow[]} */
  let ledgers = [];
  /** @type {import('../../services/tallyImportService.js').TallyVoucherRow[]} */
  let vouchers = [];
  /** @type {Record<string, string>} */
  let mapping = {};
  /** @type {Set<number>} */
  const expanded = new Set();

  let masterFileName = '';
  let voucherFileName = '';
  let masterFilter = '';
  let masterIssuesOnly = false;
  let vchFilter = '';
  let vchIssuesOnly = false;
  let vchHideSkipped = true;
  let vchPage = 0;
  let bookLedgers = existingLedgers;
  let importedGuids = await tally.loadImportedGuids(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/masters">Masters</a> / Tally Import</p>
        <h1 class="page-header__title">Tally Import</h1>
        <p class="page-header__desc">
          Load Tally XML into <strong>${escapeHtml(book.name)}</strong>.
          Review and correct the mapping, then import the chart before vouchers.
        </p>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">How to export from Tally</h2>
      <ol class="gnu-steps">
        <li>
          <strong>Masters:</strong> Gateway of Tally → Export → XML (or Data → Export).
          Export <strong>Groups</strong> and <strong>Ledgers</strong> (one file is fine).
        </li>
        <li>
          <strong>Vouchers:</strong> Export the day book / voucher statistics as XML
          for the period you need.
        </li>
        <li>A single XML that contains both masters and vouchers can be used in step 1.</li>
      </ol>
    </div>

    <div class="panel" id="tally-mode-panel">
      ${modeBannerHtml(replaceChart, voucherCount)}
    </div>

    <div class="panel">
      <h2 class="panel__title">1. Chart of accounts</h2>
      <p class="panel__desc">
        Groups and ledgers. Fix natures, parents, and names here — nothing is saved until you import.
      </p>
      <div class="csv-import__actions">
        <button type="button" class="btn btn--secondary" id="btn-masters">Choose masters XML</button>
        <input type="file" id="file-masters" accept=".xml,text/xml,application/xml" hidden />
      </div>
      <div id="masters-body"></div>
    </div>

    <div class="panel">
      <h2 class="panel__title">2. Vouchers</h2>
      <p class="panel__desc">
        Map Tally ledger names onto the chart, then correct dates, types, or amounts.
        Opening-balance vouchers are skipped because openings come from ledger masters.
      </p>
      <div class="csv-import__actions">
        <button type="button" class="btn btn--secondary" id="btn-vouchers">Choose vouchers XML</button>
        <input type="file" id="file-vouchers" accept=".xml,text/xml,application/xml" hidden />
      </div>
      <div id="vouchers-body"></div>
    </div>
  `;

  const fileMasters = /** @type {HTMLInputElement} */ (outlet.querySelector('#file-masters'));
  const fileVouchers = /** @type {HTMLInputElement} */ (outlet.querySelector('#file-vouchers'));
  const mastersBody = /** @type {HTMLElement} */ (outlet.querySelector('#masters-body'));
  const vouchersBody = /** @type {HTMLElement} */ (outlet.querySelector('#vouchers-body'));

  outlet.querySelector('#btn-masters')?.addEventListener('click', () => fileMasters.click());
  outlet.querySelector('#btn-vouchers')?.addEventListener('click', () => fileVouchers.click());

  fileMasters.addEventListener('change', async () => {
    const file = fileMasters.files?.[0];
    fileMasters.value = '';
    if (!file) return;
    try {
      const text = await tally.readTallyXmlFile(file);
      const parsed = tally.parseTallyXml(text);
      if (!parsed.groups.length && !parsed.ledgers.length) {
        throw new Error('No GROUP or LEDGER masters found in this file');
      }
      masterFileName = file.name;
      const draft = tally.buildMasterDraft(parsed, {
        existingGroups,
        existingLedgers: bookLedgers,
        replaceChart,
      });
      groups = draft.groups;
      ledgers = draft.ledgers;
      if (parsed.vouchers.length && vouchers.length === 0) {
        voucherFileName = file.name;
        vouchers = tally.buildVoucherDraft(parsed, { existingGuids: importedGuids });
        refreshMapping();
      }
      renderMasters();
      renderVouchers();
      showToast(
        `Loaded ${parsed.ledgers.length} ledgers, ${parsed.groups.length} groups` +
          (parsed.vouchers.length ? `, ${parsed.vouchers.length} vouchers` : ''),
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read masters XML', 'error');
    }
  });

  fileVouchers.addEventListener('change', async () => {
    const file = fileVouchers.files?.[0];
    fileVouchers.value = '';
    if (!file) return;
    try {
      const text = await tally.readTallyXmlFile(file);
      const parsed = tally.parseTallyXml(text);
      if (!parsed.vouchers.length) {
        throw new Error('No VOUCHER entries found in this file');
      }
      voucherFileName = file.name;
      vouchers = tally.buildVoucherDraft(parsed, { existingGuids: importedGuids });
      vchPage = 0;
      expanded.clear();
      refreshMapping();
      renderVouchers();
      showToast(`Loaded ${parsed.vouchers.length} vouchers`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not read vouchers XML', 'error');
    }
  });

  mastersBody.addEventListener('change', onMastersEvent);
  mastersBody.addEventListener('input', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.matches?.('[data-master-filter]')) onMastersEvent(e);
  });
  mastersBody.addEventListener('click', onMastersClick);

  vouchersBody.addEventListener('change', onVouchersEvent);
  vouchersBody.addEventListener('input', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.matches?.('[data-vch-filter]')) onVouchersEvent(e);
  });
  vouchersBody.addEventListener('click', onVouchersClick);

  function refreshMasters() {
    tally.annotateMasters(groups, ledgers, { replaceChart });
  }

  function refreshVouchers() {
    const targets = new Set(
      tally.availableLedgerTargets(ledgers, bookLedgers, replaceChart).map((n) => tally.normName(n))
    );
    tally.annotateVouchers(vouchers, mapping, targets);
  }

  function refreshMapping() {
    const names = tally.voucherLedgerNames(vouchers);
    const targets = tally.availableLedgerTargets(ledgers, bookLedgers, replaceChart);
    const next = tally.defaultLedgerMapping(names, targets);
    for (const name of names) {
      if (mapping[name]) next[name] = mapping[name];
    }
    mapping = next;
    refreshVouchers();
  }

  async function refreshMode() {
    const rows = await voucherService.listVouchers(book.id);
    voucherCount = rows.length;
    replaceChart = voucherCount === 0;
    const panel = outlet.querySelector('#tally-mode-panel');
    if (panel) panel.innerHTML = modeBannerHtml(replaceChart, voucherCount);
  }

  function renderMasters() {
    if (!groups.length && !ledgers.length) {
      mastersBody.innerHTML = '';
      return;
    }
    refreshMasters();
    const sum = tally.masterSummary(groups, ledgers);
    const groupRows = filterMasterRows(groups, masterFilter, masterIssuesOnly);
    const ledgerRows = filterMasterRows(ledgers, masterFilter, masterIssuesOnly);
    const natureOpts = NATURE_ORDER.map(
      (n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`
    ).join('');
    const parentOpts = [
      '<option value="">(top-level / Primary)</option>',
      ...groups
        .filter((g) => g.include)
        .map((g) => `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`),
    ].join('');

    mastersBody.innerHTML = `
      <p class="tally-file muted">${escapeHtml(masterFileName)}</p>
      <div class="tally-summary">
        <span class="badge badge--info">${sum.groups} groups</span>
        <span class="badge badge--info">${sum.ledgers} ledgers</span>
        ${
          sum.blocking
            ? `<span class="badge badge--danger">${sum.blocking} issue(s) to fix</span>`
            : `<span class="badge badge--success">Ready to import</span>`
        }
      </div>
      <div class="tally-toolbar">
        <input class="input" type="search" data-master-filter placeholder="Filter names…"
               value="${escapeHtml(masterFilter)}" />
        <label class="tally-check">
          <input type="checkbox" data-master-issues ${masterIssuesOnly ? 'checked' : ''} />
          Issues only
        </label>
      </div>

      <h3 class="tally-subhead">Groups</h3>
      <div class="table-wrap tally-validate">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Parent group</th>
              <th>Nature</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              groupRows.length
                ? groupRows
                    .map((g) => {
                      const idx = groups.indexOf(g);
                      const primary = !String(g.parent || '').trim();
                      return `
                        <tr class="${g.errors.length ? 'is-danger' : g.warnings.length ? 'is-warning' : ''}"
                            data-group-idx="${idx}">
                          <td><input type="checkbox" data-f="include" ${g.include ? 'checked' : ''} /></td>
                          <td><input class="input" data-f="name" value="${escapeHtml(g.name)}" /></td>
                          <td>
                            <select class="select" data-f="parent">
                              ${optionsWithValue(parentOpts, g.parent)}
                            </select>
                          </td>
                          <td>
                            <select class="select" data-f="nature" ${primary ? '' : 'disabled'}>
                              <option value="">Select…</option>
                              ${optionsWithValue(natureOpts, g.nature)}
                            </select>
                          </td>
                          <td>${statusHtml(g)}</td>
                        </tr>`;
                    })
                    .join('')
                : `<tr><td colspan="5" class="muted">No groups match the filter.</td></tr>`
            }
          </tbody>
        </table>
      </div>

      <h3 class="tally-subhead">Ledgers</h3>
      <div class="table-wrap tally-validate">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Group</th>
              <th>Opening</th>
              <th>Dr/Cr</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              ledgerRows.length
                ? ledgerRows
                    .map((led) => {
                      const idx = ledgers.indexOf(led);
                      const groupOpts = groups
                        .filter((g) => g.include)
                        .map(
                          (g) =>
                            `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`
                        )
                        .join('');
                      return `
                        <tr class="${led.errors.length ? 'is-danger' : led.warnings.length ? 'is-warning' : ''}"
                            data-ledger-idx="${idx}">
                          <td><input type="checkbox" data-f="include" ${led.include ? 'checked' : ''} /></td>
                          <td><input class="input" data-f="name" value="${escapeHtml(led.name)}" /></td>
                          <td>
                            <select class="select" data-f="group">
                              <option value="">Select…</option>
                              ${optionsWithValue(groupOpts, led.group)}
                            </select>
                          </td>
                          <td class="num">
                            <input class="input" data-f="opening" type="number" step="0.01"
                                   value="${escapeHtml(String(led.opening || 0))}" />
                          </td>
                          <td>
                            <select class="select" data-f="openingType">
                              <option value="debit" ${led.openingType === 'debit' ? 'selected' : ''}>Dr</option>
                              <option value="credit" ${led.openingType === 'credit' ? 'selected' : ''}>Cr</option>
                            </select>
                          </td>
                          <td>${statusHtml(led)}</td>
                        </tr>`;
                    })
                    .join('')
                : `<tr><td colspan="6" class="muted">No ledgers match the filter.</td></tr>`
            }
          </tbody>
        </table>
      </div>

      <div class="csv-import__actions" style="margin-top:0.75rem">
        <button type="button" class="btn btn--primary" data-import-masters ${
          sum.ok ? '' : 'disabled'
        }>
          ${replaceChart ? 'Replace chart from Tally' : 'Import new groups &amp; ledgers'}
        </button>
      </div>
      <div id="masters-result" class="csv-import__result muted" hidden></div>
    `;
  }

  function renderVouchers() {
    if (!vouchers.length) {
      vouchersBody.innerHTML = '';
      return;
    }
    refreshVouchers();
    const sum = tally.voucherSummary(vouchers);
    const mapNames = tally.voucherLedgerNames(vouchers);
    const targets = tally.availableLedgerTargets(ledgers, bookLedgers, replaceChart);
    const targetOpts = targets
      .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
      .join('');
    const unmapped = mapNames.filter((n) => !String(mapping[n] || '').trim()).length;
    const typeOpts = VOUCHER_TYPE_LIST.map(
      (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
    ).join('');

    const filtered = filterVoucherRows(vouchers, vchFilter, vchIssuesOnly, vchHideSkipped);
    const pages = Math.max(1, Math.ceil(filtered.length / VCH_PAGE_SIZE));
    if (vchPage >= pages) vchPage = pages - 1;
    const slice = filtered.slice(vchPage * VCH_PAGE_SIZE, (vchPage + 1) * VCH_PAGE_SIZE);

    const mappingHtml = mapNames.length
      ? `
        <h3 class="tally-subhead">Ledger mapping</h3>
        <p class="panel__desc">Tally names on voucher lines → PicoERP / Tally chart ledger.</p>
        <div class="table-wrap tally-validate tally-validate--map">
          <table class="data-table">
            <thead><tr><th>Tally ledger</th><th>Maps to</th></tr></thead>
            <tbody>
              ${mapNames
                .map((name) => {
                  const target = mapping[name] || '';
                  const bad = !target;
                  return `
                    <tr class="${bad ? 'is-danger' : ''}">
                      <td>${escapeHtml(name)}</td>
                      <td>
                        <select class="select" data-map-from="${escapeHtml(name)}">
                          <option value="">Select ledger…</option>
                          ${optionsWithValue(targetOpts, target)}
                        </select>
                      </td>
                    </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>`
      : '';

    vouchersBody.innerHTML = `
      <p class="tally-file muted">${escapeHtml(voucherFileName)}</p>
      <div class="tally-summary">
        <span class="badge badge--info">${sum.included} to import</span>
        <span class="badge badge--muted">${sum.skipped} skipped</span>
        ${
          unmapped
            ? `<span class="badge badge--danger">${unmapped} unmapped ledger(s)</span>`
            : ''
        }
        ${
          sum.blocking
            ? `<span class="badge badge--danger">${sum.blocking} voucher issue(s)</span>`
            : sum.included
              ? `<span class="badge badge--success">Ready to import</span>`
              : `<span class="badge badge--warning">Nothing selected to import</span>`
        }
      </div>
      ${mappingHtml}
      <div class="tally-toolbar">
        <input class="input" type="search" data-vch-filter placeholder="Filter number, type, narration…"
               value="${escapeHtml(vchFilter)}" />
        <label class="tally-check">
          <input type="checkbox" data-vch-issues ${vchIssuesOnly ? 'checked' : ''} />
          Issues only
        </label>
        <label class="tally-check">
          <input type="checkbox" data-vch-hide-skipped ${vchHideSkipped ? 'checked' : ''} />
          Hide skipped
        </label>
      </div>
      <div class="table-wrap tally-validate">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Date</th>
              <th>Number</th>
              <th>Type</th>
              <th>Narration</th>
              <th class="num">Dr</th>
              <th class="num">Cr</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              slice.length
                ? slice
                    .map((v) => {
                      const idx = vouchers.indexOf(v);
                      const dr = v.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
                      const cr = v.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
                      const open = expanded.has(idx);
                      return `
                        <tr class="${v.errors.length ? 'is-danger' : v.warnings.length ? 'is-warning' : ''} ${
                          v.include ? '' : 'is-muted'
                        }" data-vch-idx="${idx}">
                          <td><input type="checkbox" data-f="include" ${v.include ? 'checked' : ''} /></td>
                          <td><input class="input" data-f="date" value="${escapeHtml(v.date)}" placeholder="YYYY-MM-DD" /></td>
                          <td><input class="input" data-f="number" value="${escapeHtml(v.number)}" /></td>
                          <td>
                            <select class="select" data-f="voucherType">
                              ${optionsWithValue(typeOpts, v.voucherType)}
                            </select>
                          </td>
                          <td><input class="input" data-f="narration" value="${escapeHtml(v.narration)}" /></td>
                          <td class="num mono">${escapeHtml(formatMoney(dr))}</td>
                          <td class="num mono">${escapeHtml(formatMoney(cr))}</td>
                          <td>
                            ${statusHtml(v)}
                            <button type="button" class="btn btn--ghost btn--sm" data-expand="${idx}">
                              ${open ? 'Hide lines' : `${v.lines.length} lines`}
                            </button>
                          </td>
                        </tr>
                        ${
                          open
                            ? `<tr class="tally-lines-row" data-vch-idx="${idx}">
                                <td colspan="8">${voucherLinesHtml(v, idx, targets)}</td>
                               </tr>`
                            : ''
                        }`;
                    })
                    .join('')
                : `<tr><td colspan="8" class="muted">No vouchers match the filter.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div class="tally-pager">
        <button type="button" class="btn btn--secondary btn--sm" data-vch-prev ${
          vchPage <= 0 ? 'disabled' : ''
        }>Previous</button>
        <span class="muted">Page ${vchPage + 1} of ${pages} · ${filtered.length} shown</span>
        <button type="button" class="btn btn--secondary btn--sm" data-vch-next ${
          vchPage >= pages - 1 ? 'disabled' : ''
        }>Next</button>
      </div>
      <div class="csv-import__actions" style="margin-top:0.75rem">
        <button type="button" class="btn btn--primary" data-import-vouchers ${
          sum.ok && unmapped === 0 ? '' : 'disabled'
        }>
          Import vouchers
        </button>
      </div>
      <div id="vouchers-progress" class="gnu-progress muted" hidden></div>
      <div id="vouchers-result" class="csv-import__result muted" hidden></div>
    `;
  }

  /**
   * @param {Event} e
   */
  function onMastersEvent(e) {
    const t = /** @type {HTMLInputElement|HTMLSelectElement} */ (e.target);
    if (t.matches('[data-master-filter]')) {
      masterFilter = t.value;
      renderMasters();
      restoreCaret(mastersBody.querySelector('[data-master-filter]'), masterFilter);
      return;
    }
    if (t.matches('[data-master-issues]')) {
      masterIssuesOnly = /** @type {HTMLInputElement} */ (t).checked;
      renderMasters();
      return;
    }
    const gRow = t.closest('[data-group-idx]');
    if (gRow) {
      const idx = Number(gRow.getAttribute('data-group-idx'));
      const row = groups[idx];
      const field = t.getAttribute('data-f');
      if (row && field === 'include') row.include = /** @type {HTMLInputElement} */ (t).checked;
      else if (row && field === 'name') row.name = t.value;
      else if (row && field === 'parent') row.parent = t.value;
      else if (row && field === 'nature') row.nature = t.value;
      refreshMapping();
      renderMasters();
      if (vouchers.length) renderVouchers();
      return;
    }
    const lRow = t.closest('[data-ledger-idx]');
    if (lRow) {
      const idx = Number(lRow.getAttribute('data-ledger-idx'));
      const row = ledgers[idx];
      const field = t.getAttribute('data-f');
      if (row && field === 'include') row.include = /** @type {HTMLInputElement} */ (t).checked;
      else if (row && field === 'name') row.name = t.value;
      else if (row && field === 'group') row.group = t.value;
      else if (row && field === 'opening') row.opening = Number(t.value) || 0;
      else if (row && field === 'openingType') {
        row.openingType = t.value === 'credit' ? 'credit' : 'debit';
      }
      refreshMapping();
      renderMasters();
      if (vouchers.length) renderVouchers();
    }
  }

  /**
   * @param {MouseEvent} e
   */
  async function onMastersClick(e) {
    const t = /** @type {HTMLElement} */ (e.target);
    if (!t.closest('[data-import-masters]')) return;
    const btn = /** @type {HTMLButtonElement} */ (t.closest('[data-import-masters]'));
    refreshMasters();
    const sum = tally.masterSummary(groups, ledgers);
    if (!sum.ok) {
      showToast('Fix chart issues before importing', 'error');
      return;
    }
    if (replaceChart) {
      const ok = await confirmModal({
        title: 'Replace chart of accounts?',
        danger: true,
        confirmLabel: 'Delete template chart & import',
        bodyHtml: `
          <p>This book has <strong>no vouchers</strong>, so the current chart
          (including the template) will be <strong>deleted</strong> and replaced
          with ${sum.groups} Tally groups and ${sum.ledgers} ledgers.</p>
          <p class="muted" style="font-size:var(--text-sm)">
            Inventory/tax system ledgers are recreated after import if missing.
            Back up first if you might need the old chart.
          </p>`,
      });
      if (!ok) return;
    }
    btn.disabled = true;
    const resultEl = /** @type {HTMLElement} */ (mastersBody.querySelector('#masters-result'));
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.textContent = replaceChart ? 'Replacing chart…' : 'Importing chart…';
    }
    try {
      const result = await tally.importTallyMasters(book.id, groups, ledgers, {
        replaceChart,
        onProgress: (msg) => {
          if (resultEl) resultEl.textContent = msg;
        },
      });
      bookLedgers = await coaService.listLedgers(book.id);
      await refreshMode();
      refreshMapping();
      const errHtml = errorListHtml(result.errors);
      if (resultEl) {
        resultEl.innerHTML = `
          <p>
            ${
              result.mode === 'replace'
                ? `Replaced COA (removed ${result.purgedGroups} groups / ${result.purgedLedgers} ledgers). `
                : ''
            }
            Created <strong>${result.createdGroups}</strong> groups,
            <strong>${result.createdLedgers}</strong> ledgers
            ${
              result.reusedGroups || result.reusedLedgers
                ? ` · reused ${result.reusedGroups} groups / ${result.reusedLedgers} ledgers`
                : ''
            }
            ${result.failed ? ` · <strong>${result.failed}</strong> failed` : ''}
          </p>
          ${errHtml}
          <p><a href="#/masters/chart">Open Chart of Accounts</a></p>`;
      }
      showToast(
        result.mode === 'replace' ? 'Chart replaced from Tally' : 'Tally masters imported',
        result.failed ? 'error' : 'success'
      );
      renderVouchers();
    } catch (err) {
      if (resultEl) {
        resultEl.innerHTML = `<span class="text-danger">${escapeHtml(
          err instanceof Error ? err.message : 'Import failed'
        )}</span>`;
      }
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /**
   * @param {Event} e
   */
  function onVouchersEvent(e) {
    const t = /** @type {HTMLInputElement|HTMLSelectElement} */ (e.target);
    if (t.matches('[data-vch-filter]')) {
      vchFilter = t.value;
      vchPage = 0;
      renderVouchers();
      restoreCaret(vouchersBody.querySelector('[data-vch-filter]'), vchFilter);
      return;
    }
    if (t.matches('[data-vch-issues]')) {
      vchIssuesOnly = /** @type {HTMLInputElement} */ (t).checked;
      vchPage = 0;
      renderVouchers();
      return;
    }
    if (t.matches('[data-vch-hide-skipped]')) {
      vchHideSkipped = /** @type {HTMLInputElement} */ (t).checked;
      vchPage = 0;
      renderVouchers();
      return;
    }
    const mapFrom = t.getAttribute('data-map-from');
    if (mapFrom != null) {
      mapping[mapFrom] = t.value;
      renderVouchers();
      return;
    }
    const vRow = t.closest('[data-vch-idx]');
    if (!vRow) return;
    const idx = Number(vRow.getAttribute('data-vch-idx'));
    const row = vouchers[idx];
    if (!row) return;
    const lineIdx = t.getAttribute('data-line');
    if (lineIdx != null) {
      const line = row.lines[Number(lineIdx)];
      const field = t.getAttribute('data-f');
      if (line && field === 'ledgerName') line.ledgerName = t.value;
      else if (line && field === 'debit') {
        line.debit = Number(t.value) || 0;
        if (line.debit) line.credit = 0;
      } else if (line && field === 'credit') {
        line.credit = Number(t.value) || 0;
        if (line.credit) line.debit = 0;
      }
      refreshMapping();
      renderVouchers();
      return;
    }
    const field = t.getAttribute('data-f');
    if (field === 'include') row.include = /** @type {HTMLInputElement} */ (t).checked;
    else if (field === 'date') row.date = t.value.trim();
    else if (field === 'number') row.number = t.value;
    else if (field === 'voucherType') row.voucherType = t.value;
    else if (field === 'narration') row.narration = t.value;
    refreshMapping();
    renderVouchers();
  }

  /**
   * @param {MouseEvent} e
   */
  async function onVouchersClick(e) {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-vch-prev]')) {
      vchPage = Math.max(0, vchPage - 1);
      renderVouchers();
      return;
    }
    if (t.closest('[data-vch-next]')) {
      vchPage += 1;
      renderVouchers();
      return;
    }
    const exp = t.closest('[data-expand]');
    if (exp) {
      const idx = Number(exp.getAttribute('data-expand'));
      if (expanded.has(idx)) expanded.delete(idx);
      else expanded.add(idx);
      renderVouchers();
      return;
    }
    if (!t.closest('[data-import-vouchers]')) return;
    const btn = /** @type {HTMLButtonElement} */ (t.closest('[data-import-vouchers]'));
    refreshVouchers();
    const sum = tally.voucherSummary(vouchers);
    const unmapped = tally
      .voucherLedgerNames(vouchers)
      .filter((n) => !String(mapping[n] || '').trim()).length;
    if (!sum.ok || unmapped) {
      showToast('Fix voucher issues and ledger mapping before importing', 'error');
      return;
    }
    const ok = await confirmModal({
      title: 'Import Tally vouchers?',
      confirmLabel: `Import ${sum.included} vouchers`,
      bodyHtml: `
        <p>This will post <strong>${sum.included}</strong> voucher(s) to
        <strong>${escapeHtml(book.name)}</strong>. Ledgers must already exist
        (import the chart in step 1 first if you replaced it).</p>`,
    });
    if (!ok) return;
    btn.disabled = true;
    const progress = /** @type {HTMLElement} */ (vouchersBody.querySelector('#vouchers-progress'));
    const resultEl = /** @type {HTMLElement} */ (vouchersBody.querySelector('#vouchers-result'));
    if (progress) {
      progress.hidden = false;
      progress.textContent = 'Starting voucher import…';
    }
    if (resultEl) resultEl.hidden = true;
    try {
      const result = await tally.importTallyVouchers(book.id, vouchers, mapping, {
        onProgress: (msg) => {
          if (progress) progress.textContent = msg;
        },
      });
      importedGuids = await tally.loadImportedGuids(book.id);
      await refreshMode();
      if (progress) progress.hidden = true;
      if (resultEl) {
        resultEl.hidden = false;
        resultEl.innerHTML = `
          <p>
            Created <strong>${result.created}</strong> vouchers
            ${result.failed ? ` · <strong>${result.failed}</strong> failed` : ''}
            ${result.skipped ? ` · ${result.skipped} skipped` : ''}
          </p>
          ${errorListHtml(result.errors)}
          <p><a href="#/transactions/list">View vouchers</a>
            · <a href="#/reports/trial-balance">Trial Balance</a></p>`;
      }
      showToast(
        result.created ? `Imported ${result.created} vouchers` : result.errors[0] || 'No vouchers imported',
        result.created ? 'success' : 'error'
      );
    } catch (err) {
      if (progress) progress.hidden = true;
      if (resultEl) {
        resultEl.hidden = false;
        resultEl.innerHTML = `<span class="text-danger">${escapeHtml(
          err instanceof Error ? err.message : 'Import failed'
        )}</span>`;
      }
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      btn.disabled = false;
    }
  }
}

function modeBannerHtml(replaceChart, voucherCount) {
  if (replaceChart) {
    return `
      <p>
        This book has <strong>no vouchers</strong>. Importing the chart will
        <strong>replace</strong> the current template chart with Tally groups and ledgers.
      </p>`;
  }
  return `
    <p>
      This book already has <strong>${voucherCount}</strong> voucher(s), so the chart
      will <strong>not</strong> be replaced. Matching names are reused; only new
      Tally groups and ledgers are added.
    </p>`;
}

/**
 * @param {{ include: boolean, name?: string, errors: string[], warnings: string[] }[]} rows
 * @param {string} filter
 * @param {boolean} issuesOnly
 */
function filterMasterRows(rows, filter, issuesOnly) {
  const q = filter.trim().toLowerCase();
  return rows.filter((row) => {
    if (issuesOnly && !(row.include && row.errors.length)) return false;
    if (!q) return true;
    const blob = `${row.name || ''} ${row.errors.join(' ')} ${row.warnings.join(' ')}`.toLowerCase();
    return blob.includes(q);
  });
}

/**
 * @param {import('../../services/tallyImportService.js').TallyVoucherRow[]} rows
 * @param {string} filter
 * @param {boolean} issuesOnly
 * @param {boolean} hideSkipped
 */
function filterVoucherRows(rows, filter, issuesOnly, hideSkipped) {
  const q = filter.trim().toLowerCase();
  return rows.filter((row) => {
    if (hideSkipped && !row.include) return false;
    if (issuesOnly && !(row.include && row.errors.length)) return false;
    if (!q) return true;
    const blob = `${row.number} ${row.date} ${row.tallyType} ${row.voucherType} ${row.narration}`.toLowerCase();
    return blob.includes(q);
  });
}

/**
 * @param {import('../../services/tallyImportService.js').TallyVoucherRow} v
 * @param {number} vIdx
 * @param {string[]} targets
 */
function voucherLinesHtml(v, vIdx, targets) {
  const opts = targets
    .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
    .join('');
  const rows = v.lines
    .map((line, i) => {
      return `
        <tr data-vch-idx="${vIdx}">
          <td>
            <select class="select" data-line="${i}" data-f="ledgerName">
              <option value="">Select…</option>
              ${optionsWithValue(opts, line.ledgerName)}
              ${
                line.ledgerName && !targets.some((n) => n === line.ledgerName)
                  ? `<option value="${escapeHtml(line.ledgerName)}" selected>${escapeHtml(
                      line.ledgerName
                    )} (unmapped)</option>`
                  : ''
              }
            </select>
          </td>
          <td class="num">
            <input class="input" data-line="${i}" data-f="debit" type="number" step="0.01"
                   value="${escapeHtml(String(line.debit || 0))}" />
          </td>
          <td class="num">
            <input class="input" data-line="${i}" data-f="credit" type="number" step="0.01"
                   value="${escapeHtml(String(line.credit || 0))}" />
          </td>
        </tr>`;
    })
    .join('');
  return `
    <table class="data-table tally-lines">
      <thead><tr><th>Ledger</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3" class="muted">No lines</td></tr>`}</tbody>
    </table>`;
}

/**
 * @param {{ errors: string[], warnings: string[], action?: string }} row
 */
function statusHtml(row) {
  if (row.errors.length) {
    return `<span class="text-danger">${escapeHtml(row.errors[0])}${
      row.errors.length > 1 ? ` (+${row.errors.length - 1})` : ''
    }</span>`;
  }
  if (row.action === 'reuse') {
    return `<span class="badge badge--muted">Reuse</span>`;
  }
  if (row.warnings.length) {
    return `<span class="badge badge--warning" title="${escapeHtml(row.warnings.join(' · '))}">${escapeHtml(
      row.warnings[0]
    )}</span>`;
  }
  return `<span class="badge badge--success">OK</span>`;
}

/**
 * @param {string} optionsHtml
 * @param {string} value
 */
function optionsWithValue(optionsHtml, value) {
  const v = String(value || '');
  if (!v) return optionsHtml;
  const needle = `value="${escapeHtml(v)}"`;
  if (optionsHtml.includes(needle)) {
    return optionsHtml.replace(needle, `${needle} selected`);
  }
  return `${optionsHtml}<option value="${escapeHtml(v)}" selected>${escapeHtml(v)}</option>`;
}

/**
 * @param {string[]} errors
 */
function errorListHtml(errors) {
  if (!errors.length) return '';
  return `<ul class="csv-import__errors">${errors
    .slice(0, 12)
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join('')}${
    errors.length > 12 ? `<li>…and ${errors.length - 12} more</li>` : ''
  }</ul>`;
}

/**
 * @param {Element|null} el
 * @param {string} value
 */
function restoreCaret(el, value) {
  if (!(el instanceof HTMLInputElement)) return;
  el.focus();
  const pos = String(value || '').length;
  try {
    el.setSelectionRange(pos, pos);
  } catch {
    /* ignore */
  }
}


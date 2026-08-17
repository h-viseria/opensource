import { inspectCsv, previewRows, analyzeDuplicates, commitImport, IMPORT_FIELDS } from '../../services/importService.js';
import { listAccounts } from '../../services/accountService.js';
import { getBaseCurrency } from '../../services/currencyService.js';
import { listCategories } from '../../services/categoryService.js';
import { escapeHtml } from '../../utils/html.js';
import { showToast } from '../toast.js';

export async function renderImport() {
  const outlet = document.getElementById('outlet');
  const accounts = await listAccounts();
  const cats = await listCategories();
  const base = await getBaseCurrency();
  outlet.innerHTML = `
    <section class="page">
      <h2>CSV import</h2>
      <ol class="wizard muted">
        <li>Select file</li><li>Map columns</li><li>Preview</li><li>Duplicates</li><li>Import</li>
      </ol>
      <input class="input" type="file" id="csv-file" accept=".csv,text/csv" />
      <div id="wiz"></div>
    </section>
  `;
  /** @type {any} */
  let state = { accounts, base };
  outlet.querySelector('#csv-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      state.inspect = inspectCsv(text);
      renderMap();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Bad CSV', 'error');
    }
  });

  function renderMap() {
    const wiz = document.getElementById('wiz');
    const { headers, suggested, sample } = state.inspect;
    wiz.innerHTML = `
      <h3>Map columns</h3>
      <table class="plain">
        <thead><tr>${headers.map((h, i) => `<th>${escapeHtml(h)}<br/>
          <select data-col="${i}">${IMPORT_FIELDS.map((f) => `<option ${f === suggested[i] ? 'selected' : ''}>${f}</option>`).join('')}</select>
        </th>`).join('')}</tr></thead>
        <tbody>${sample.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <div class="field"><label class="field__label">Default account</label>
        <select class="input" id="def-acct">${accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="field__label">Default category (if required)</label>
        <select class="input" id="def-cat">${cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
      <button type="button" class="btn btn--primary" id="btn-preview">Preview</button>
    `;
    wiz.querySelector('#btn-preview')?.addEventListener('click', () => {
      const mapping = [...wiz.querySelectorAll('select[data-col]')].map((s) => s.value);
      const acct = wiz.querySelector('#def-acct').value;
      state.defaultCategoryId = wiz.querySelector('#def-cat').value;
      state.preview = previewRows(state.inspect.dataRows, mapping, {
        defaultAccountId: acct,
        defaultCurrency: base,
        accounts,
      });
      renderPreview();
    });
  }

  async function renderPreview() {
    const wiz = document.getElementById('wiz');
    const dupes = await analyzeDuplicates(state.preview.rows);
    const dupeSet = new Set(dupes.map((d) => d.index));
    wiz.innerHTML = `
      <h3>Preview (${state.preview.rows.length} ok, ${state.preview.errors.length} errors)</h3>
      ${state.preview.errors.length ? `<p class="banner">${state.preview.errors.slice(0, 8).map((e) => `Row ${e.index + 1}: ${escapeHtml(e.message)}`).join('<br/>')}</p>` : ''}
      <p>${dupes.length} possible duplicates — skip them or import anyway.</p>
      <label class="chip"><input type="checkbox" id="skip-dupes" checked /> Skip duplicates</label>
      <table class="plain"><thead><tr><th>Date</th><th>Amount</th><th>Desc</th><th></th></tr></thead>
      <tbody>${state.preview.rows
        .slice(0, 40)
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.date)}</td><td>${r.amountMinor}</td><td>${escapeHtml(r.description)}</td><td>${dupeSet.has(r.index) ? 'duplicate' : ''}</td></tr>`
        )
        .join('')}</tbody></table>
      <button type="button" class="btn btn--primary" id="btn-go">Import</button>
    `;
    wiz.querySelector('#btn-go')?.addEventListener('click', async () => {
      const skipDupes = wiz.querySelector('#skip-dupes').checked;
      const skip = new Set();
      const importAnyway = new Set();
      if (skipDupes) dupes.forEach((d) => skip.add(d.index));
      else dupes.forEach((d) => importAnyway.add(d.index));
      const result = await commitImport(state.preview.rows, { skip, importAnyway }, { defaultCategoryId: state.defaultCategoryId });
      showToast(`Imported ${result.imported}, skipped ${result.skipped}`, result.errors.length ? 'error' : 'success');
      wiz.innerHTML = `<p>Imported ${result.imported}. Skipped ${result.skipped}. Errors ${result.errors.length}.</p>`;
    });
  }
}

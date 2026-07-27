/**
 * Invoice templates — upload Word/ODT files with placeholders.
 */

import * as bookService from '../../services/bookService.js';
import * as invoiceTemplateService from '../../services/invoiceTemplateService.js';
import { escapeHtml, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';

/**
 * @param {import('../../core/router.js').RouteContext} _ctx
 * @param {HTMLElement} outlet
 */
export async function renderInvoiceTemplates(_ctx, outlet) {
  const { book } = await bookService.getSessionContext();
  if (!book) {
    outlet.innerHTML = `<p class="muted">No active book.</p>`;
    return;
  }

  const templates = await invoiceTemplateService.listTemplates(book.id);

  outlet.innerHTML = `
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><a href="#/invoices">Invoices</a> / Templates</p>
        <h1 class="page-header__title">Invoice templates</h1>
        <p class="page-header__desc">
          Upload a Microsoft Word (<span class="mono">.docx</span>) or OpenDocument
          (<span class="mono">.odt</span>) file with placeholders. Filled copies are
          downloaded from each invoice.
        </p>
      </div>
      <div class="page-header__actions">
        <a class="btn btn--secondary" href="#/invoices">Back to invoices</a>
      </div>
    </div>

    <div class="panel">
      <h2 class="panel__title">Ready-made shop templates</h2>
      <p class="panel__desc">
        Simple A4 Word layouts for a single-user shop. Download to edit in Word/LibreOffice,
        or install into this book so invoices can fill them automatically.
      </p>
      <div class="form-actions" style="justify-content:flex-start;border:0;padding:0;margin-top:0.75rem;flex-wrap:wrap;gap:0.5rem">
        <button type="button" class="btn btn--secondary" id="btn-dl-sales-sample">Download sales sample (.docx)</button>
        <button type="button" class="btn btn--secondary" id="btn-dl-purchase-sample">Download purchase sample (.docx)</button>
        <button type="button" class="btn btn--primary" id="btn-install-sales-sample">Install sales as default</button>
        <button type="button" class="btn btn--primary" id="btn-install-purchase-sample">Install purchase as default</button>
      </div>
    </div>

    <div class="panel" style="margin-top:1rem">
      <h2 class="panel__title">How to build a template</h2>
      <ol class="template-guide" style="margin:0.5rem 0 0;padding-left:1.25rem;line-height:1.55;font-size:var(--text-sm)">
        <li>Create a document in Word or LibreOffice Writer.</li>
        <li>Type placeholders <strong>exactly</strong> as shown below (keep each token on one continuous run of text — avoid splitting <span class="mono">{{…}}</span> across bold/italic).</li>
        <li>For item rows, either use <span class="mono">{{items_table}}</span> for a plain text list, or wrap a sample row with <span class="mono">{{#lines}}</span> … <span class="mono">{{/lines}}</span>.</li>
        <li>Save as <span class="mono">.docx</span> or <span class="mono">.odt</span> and upload here.</li>
        <li>Open an invoice → <em>Download template</em> to get a filled file, or use <em>PDF preview</em> for a print-ready PDF.</li>
      </ol>

      <h3 style="margin:1.25rem 0 0.5rem;font-size:var(--text-base)">Placeholders</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Placeholder</th><th>Meaning</th></tr></thead>
          <tbody>
            ${invoiceTemplateService.TEMPLATE_PLACEHOLDERS.map(
              (p) =>
                `<tr><td class="mono">${escapeHtml(p.key)}</td><td>${escapeHtml(p.desc)}</td></tr>`
            ).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel" style="margin-top:1rem">
      <h2 class="panel__title">Upload template</h2>
      <form id="tpl-form" class="form-grid">
        <label class="field">
          <span class="field__label">Display name</span>
          <input class="input" name="name" placeholder="Sales invoice A4" required />
        </label>
        <label class="field">
          <span class="field__label">Applies to</span>
          <select class="select" name="appliesTo">
            <option value="Both">Sales &amp; Purchase</option>
            <option value="Sales">Sales only</option>
            <option value="Purchase">Purchase only</option>
          </select>
        </label>
        <label class="field" style="grid-column: span 2">
          <span class="field__label">File (.docx or .odt)</span>
          <input class="input" type="file" name="file" accept=".docx,.odt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text" required />
        </label>
        <label class="field" style="grid-column: span 2;display:flex;align-items:center;gap:0.5rem">
          <input type="checkbox" name="isDefault" />
          <span>Set as default for this book</span>
        </label>
        <div class="form-actions" style="grid-column:1/-1;border:0;padding:0">
          <button type="submit" class="btn btn--primary">Upload</button>
        </div>
      </form>
    </div>

    <div class="panel" style="margin-top:1rem;padding:0;overflow:hidden">
      <div style="padding:0.85rem 1rem 0"><h2 class="panel__title" style="margin:0">Saved templates</h2></div>
      ${
        templates.length === 0
          ? `<p class="muted" style="padding:0.75rem 1rem 1rem">No templates uploaded yet.</p>`
          : `<div class="table-wrap"><table class="data-table">
               <thead><tr><th>Name</th><th>Format</th><th>Applies</th><th>Size</th><th></th></tr></thead>
               <tbody>
                 ${templates
                   .map(
                     (t) => `
                   <tr>
                     <td>${escapeHtml(t.name)}${t.isDefault ? ' <span class="badge badge--success">Default</span>' : ''}</td>
                     <td class="mono">${escapeHtml(t.format)}</td>
                     <td>${escapeHtml(t.appliesTo || 'Both')}</td>
                     <td class="mono">${Math.round((t.size || 0) / 1024)} KB</td>
                     <td class="row-actions">
                       <button type="button" class="btn btn--ghost btn--sm" data-default="${t.id}">Make default</button>
                       <button type="button" class="btn btn--ghost btn--sm" data-del="${t.id}">Delete</button>
                     </td>
                   </tr>`
                   )
                   .join('')}
               </tbody>
             </table></div>`
      }
    </div>
  `;

  outlet.querySelector('#btn-dl-sales-sample')?.addEventListener('click', () => {
    invoiceTemplateService.downloadSampleTemplate('Sales');
    showToast('Sales sample downloaded', 'success');
  });
  outlet.querySelector('#btn-dl-purchase-sample')?.addEventListener('click', () => {
    invoiceTemplateService.downloadSampleTemplate('Purchase');
    showToast('Purchase sample downloaded', 'success');
  });
  outlet.querySelector('#btn-install-sales-sample')?.addEventListener('click', async () => {
    try {
      await invoiceTemplateService.installSampleTemplate(book.id, 'Sales', { isDefault: true });
      showToast('Sales sample installed as default', 'success');
      await renderInvoiceTemplates(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Install failed', 'error');
    }
  });
  outlet.querySelector('#btn-install-purchase-sample')?.addEventListener('click', async () => {
    try {
      await invoiceTemplateService.installSampleTemplate(book.id, 'Purchase', { isDefault: true });
      showToast('Purchase sample installed as default', 'success');
      await renderInvoiceTemplates(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Install failed', 'error');
    }
  });

  outlet.querySelector('#tpl-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const fd = new FormData(form);
    const file = /** @type {File|null} */ (fd.get('file'));
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.docx') && !lower.endsWith('.odt')) {
      showToast('Please upload a .docx or .odt file', 'info');
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      await invoiceTemplateService.saveTemplate({
        bookId: book.id,
        name: String(fd.get('name') || file.name),
        fileName: file.name,
        format: lower.endsWith('.odt') ? 'odt' : 'docx',
        appliesTo: /** @type {any} */ (String(fd.get('appliesTo') || 'Both')),
        isDefault: Boolean(fd.get('isDefault')),
        bytes,
      });
      showToast('Template uploaded', 'success');
      await renderInvoiceTemplates(_ctx, outlet);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  });

  outlet.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del');
      if (!id) return;
      const ok = await confirmModal({
        title: 'Delete template?',
        danger: true,
        confirmLabel: 'Delete',
        bodyHtml: `<p>Remove this template from the book?</p>`,
      });
      if (!ok) return;
      try {
        await invoiceTemplateService.deleteTemplate(id);
        showToast('Template deleted', 'success');
        await renderInvoiceTemplates(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    });
  });

  outlet.querySelectorAll('[data-default]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-default');
      if (!id) return;
      try {
        await invoiceTemplateService.updateTemplate(id, { isDefault: true });
        showToast('Default template updated', 'success');
        await renderInvoiceTemplates(_ctx, outlet);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Update failed', 'error');
      }
    });
  });
}

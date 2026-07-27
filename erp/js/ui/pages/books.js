/**
 * Books — create, select, and manage accounting books.
 */

import * as bookService from '../../services/bookService.js';
import * as router from '../../core/router.js';
import { CSV_LABELS, CSV_SAMPLES, importBooks } from '../../services/csvBulkImport.js';
import { listBookTemplates, DEFAULT_BOOK_TEMPLATE_ID } from '../../data/bookTemplates.js';
import { showToast } from '../toast.js';
import { confirmModal, formModal, escapeHtml } from '../modal.js';
import { csvImportPanelHtml, wireCsvImport } from '../csvImport.js';
import { formatDisplayDate } from '../../utils/date.js';

/**
 * @param {import('../../core/router.js').RouteContext} ctx
 * @param {HTMLElement} outlet
 * @param {{ gateMode?: boolean, onBookActivated?: () => void }} [opts]
 */
export async function renderBooks(ctx, outlet, opts = {}) {
  const books = await bookService.listBooks();
  const session = await bookService.getSessionContext();
  const gateMode = Boolean(opts.gateMode);

  if (gateMode) {
    outlet.innerHTML = `
      <h1 class="book-gate__headline">Your books, offline.</h1>
      <p class="book-gate__lede">
        PicoERP keeps double-entry accounts in this browser with IndexedDB.
        Create a book to begin — no server required.
      </p>
      ${books.length === 0 ? emptyCreate() : booksList(books, session.book?.id, true)}
    `;
  } else {
    outlet.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-header__title">Books</h1>
          <p class="page-header__desc">
            Each book is a separate company or personal set of accounts.
          </p>
        </div>
        <div class="page-header__actions">
          <button type="button" class="btn btn--primary" id="btn-new-book">New book</button>
        </div>
      </div>
      ${csvImportPanelHtml()}
      ${books.length === 0 ? emptyCreate(false) : booksList(books, session.book?.id, false)}
    `;
  }

  bindBookActions(outlet, opts);

  if (!gateMode) {
    wireCsvImport(outlet, {
      labels: CSV_LABELS.books,
      sampleRows: CSV_SAMPLES.books,
      fileName: 'books_template.csv',
      onRows: (rows) => importBooks(rows),
      onDone: async (result) => {
        if (result.created > 0) await renderBooks(ctx, outlet, opts);
      },
    });
  }
}

function emptyCreate(gateMode = true) {
  return `
    <div class="${gateMode ? '' : 'panel'}">
      <div class="empty-state" style="${gateMode ? 'padding:0;text-align:left' : ''}">
        ${gateMode ? '' : '<div class="empty-state__icon">▤</div>'}
        ${gateMode ? '' : '<h2 class="empty-state__title">No books yet</h2>'}
        <form class="form" id="form-create-book" style="max-width:28rem;${gateMode ? '' : 'margin:0 auto;text-align:left'}">
          <div class="field">
            <label class="field__label" for="book-name">Book name</label>
            <input class="input" id="book-name" name="name" required maxlength="120" placeholder="e.g. Personal, Acme Trading" autocomplete="organization" />
          </div>
          ${templateFieldHtml('book-template')}
          <div class="form-row form-row--2">
            <div class="field">
              <label class="field__label" for="book-currency">Currency</label>
              <input class="input" id="book-currency" name="currency" maxlength="3" value="INR" />
            </div>
            <div class="field">
              <label class="field__label" for="book-fy">FY start month</label>
              <select class="select" id="book-fy" name="fyStartMonth">
                ${monthOptions(4)}
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn--primary ${gateMode ? 'btn--block' : ''}">Create book</button>
        </form>
      </div>
    </div>`;
}

/**
 * @param {import('../../models/types.js').Book[]} books
 * @param {string|undefined} activeId
 * @param {boolean} gateMode
 */
function booksList(books, activeId, gateMode) {
  const items = books
    .map((book) => {
      const isActive = book.id === activeId;
      return `
        <div class="list-item" data-book-id="${book.id}">
          <div class="list-item__body">
            <div class="list-item__title">
              ${escapeHtml(book.name)}
              ${isActive ? '<span class="badge badge--success" style="margin-left:0.5rem">Active</span>' : ''}
            </div>
            <div class="list-item__meta">
              ${escapeHtml(book.currency)}
              ${book.templateId ? ` · ${escapeHtml(templateLabel(book.templateId))}` : ''}
              · Updated ${formatDisplayDate(book.updatedAt)}
              ${book.legalName && book.legalName !== book.name ? ` · ${escapeHtml(book.legalName)}` : ''}
            </div>
          </div>
          <div class="list-item__actions">
            ${isActive
              ? ''
              : `<button type="button" class="btn btn--primary btn--sm" data-action="open">Open</button>`}
            <button type="button" class="btn btn--secondary btn--sm" data-action="edit">Edit</button>
            <button type="button" class="btn btn--ghost btn--sm" data-action="delete">Delete</button>
          </div>
        </div>`;
    })
    .join('');

  return `
    ${gateMode ? `<div style="margin-bottom:var(--space-4)"><button type="button" class="btn btn--primary" id="btn-new-book">New book</button></div>` : ''}
    <div class="list">${items}</div>`;
}

function templateLabel(templateId) {
  return listBookTemplates().find((t) => t.id === templateId)?.name || templateId;
}

function monthOptions(selected) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return names
    .map((n, i) => {
      const m = i + 1;
      return `<option value="${m}" ${m === selected ? 'selected' : ''}>${n}</option>`;
    })
    .join('');
}

/**
 * @param {string} fieldId
 * @param {string} [selectedId]
 */
function templateFieldHtml(fieldId, selectedId = DEFAULT_BOOK_TEMPLATE_ID) {
  const templates = listBookTemplates();
  const selected = templates.find((t) => t.id === selectedId) || templates[0];
  const options = templates
    .map(
      (t) =>
        `<option value="${escapeHtml(t.id)}" ${t.id === selected.id ? 'selected' : ''} data-desc="${escapeHtml(t.description)}">${escapeHtml(t.name)}</option>`
    )
    .join('');
  return `
    <div class="field">
      <label class="field__label" for="${escapeHtml(fieldId)}">Chart template</label>
      <select class="select" id="${escapeHtml(fieldId)}" name="templateId" data-template-select>
        ${options}
      </select>
      <p class="field__hint" data-template-hint>${escapeHtml(selected.description)}</p>
    </div>`;
}

/**
 * @param {ParentNode} root
 */
function wireTemplateHint(root) {
  root.querySelectorAll('[data-template-select]').forEach((sel) => {
    const select = /** @type {HTMLSelectElement} */ (sel);
    const hint = select.closest('.field')?.querySelector('[data-template-hint]');
    const update = () => {
      const opt = select.selectedOptions[0];
      if (hint) hint.textContent = opt?.dataset.desc || '';
    };
    select.addEventListener('change', update);
    update();
  });
}

/**
 * @param {HTMLElement} outlet
 * @param {{ gateMode?: boolean, onBookActivated?: () => void }} opts
 */
function bindBookActions(outlet, opts) {
  wireTemplateHint(outlet);

  outlet.querySelector('#form-create-book')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const fd = new FormData(form);
    try {
      await bookService.createBook({
        name: String(fd.get('name') || ''),
        currency: String(fd.get('currency') || 'INR'),
        fyStartMonth: Number(fd.get('fyStartMonth') || 4),
        templateId: String(fd.get('templateId') || DEFAULT_BOOK_TEMPLATE_ID),
      });
      showToast('Book created', 'success');
      if (opts.onBookActivated) opts.onBookActivated();
      else {
        await renderBooks(
          /** @type {import('../../core/router.js').RouteContext} */ ({ path: '/books', params: {}, query: {}, route: { path: '/books', title: 'Books', render: () => {} } }),
          outlet,
          opts
        );
        router.navigate('/dashboard');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create book', 'error');
    }
  });

  outlet.querySelector('#btn-new-book')?.addEventListener('click', async () => {
    const fd = await formModal({
      title: 'New book',
      confirmLabel: 'Create',
      fieldsHtml: `
        <div class="form">
          <div class="field">
            <label class="field__label" for="m-name">Book name</label>
            <input class="input" id="m-name" name="name" required maxlength="120" />
          </div>
          ${templateFieldHtml('m-template')}
          <div class="form-row form-row--2">
            <div class="field">
              <label class="field__label" for="m-currency">Currency</label>
              <input class="input" id="m-currency" name="currency" maxlength="3" value="INR" />
            </div>
            <div class="field">
              <label class="field__label" for="m-fy">FY start month</label>
              <select class="select" id="m-fy" name="fyStartMonth">${monthOptions(4)}</select>
            </div>
          </div>
        </div>`,
      onReady: (root) => wireTemplateHint(root),
    });
    if (!fd) return;
    try {
      await bookService.createBook({
        name: String(fd.get('name') || ''),
        currency: String(fd.get('currency') || 'INR'),
        fyStartMonth: Number(fd.get('fyStartMonth') || 4),
        templateId: String(fd.get('templateId') || DEFAULT_BOOK_TEMPLATE_ID),
      });
      showToast('Book created', 'success');
      if (opts.onBookActivated) opts.onBookActivated();
      else {
        router.navigate('/dashboard');
        // Remount may happen via BOOK_CHANGED in app.js
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create book', 'error');
    }
  });

  outlet.querySelectorAll('[data-book-id]').forEach((row) => {
    const bookId = row.getAttribute('data-book-id');
    if (!bookId) return;

    row.querySelector('[data-action="open"]')?.addEventListener('click', async () => {
      try {
        await bookService.setActiveBook(bookId);
        showToast('Book opened', 'success');
        if (opts.onBookActivated) opts.onBookActivated();
        else router.navigate('/dashboard');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not open book', 'error');
      }
    });

    row.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      const book = await bookService.getBook(bookId);
      if (!book) return;
      const fd = await formModal({
        title: 'Edit book',
        confirmLabel: 'Save',
        fieldsHtml: `
          <div class="form">
            <div class="field">
              <label class="field__label" for="m-name">Book name</label>
              <input class="input" id="m-name" name="name" required maxlength="120" value="${escapeHtml(book.name)}" />
            </div>
            <div class="field">
              <label class="field__label" for="m-legal">Legal name</label>
              <input class="input" id="m-legal" name="legalName" maxlength="200" value="${escapeHtml(book.legalName || '')}" />
            </div>
            <div class="form-row form-row--2">
              <div class="field">
                <label class="field__label" for="m-currency">Currency</label>
                <input class="input" id="m-currency" name="currency" maxlength="3" value="${escapeHtml(book.currency || 'INR')}" />
              </div>
              <div class="field">
                <label class="field__label" for="m-country">Country</label>
                <input class="input" id="m-country" name="country" maxlength="80" value="${escapeHtml(book.country || '')}" />
              </div>
            </div>
          </div>`,
      });
      if (!fd) return;
      try {
        await bookService.updateBook(bookId, {
          name: String(fd.get('name') || ''),
          legalName: String(fd.get('legalName') || ''),
          currency: String(fd.get('currency') || 'INR'),
          country: String(fd.get('country') || ''),
        });
        showToast('Book updated', 'success');
        await renderBooks(
          /** @type {import('../../core/router.js').RouteContext} */ ({ path: '/books', params: {}, query: {}, route: { path: '/books', title: 'Books', render: () => {} } }),
          outlet,
          opts
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not update book', 'error');
      }
    });

    row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const book = await bookService.getBook(bookId);
      if (!book) return;
      const ok = await confirmModal({
        title: 'Delete book?',
        danger: true,
        confirmLabel: 'Delete',
        bodyHtml: `<p>Delete <strong>${escapeHtml(book.name)}</strong> and all of its data (financial years, ledgers, vouchers, and related records)? This cannot be undone.</p>`,
      });
      if (!ok) return;
      try {
        await bookService.deleteBook(bookId);
        showToast('Book deleted', 'success');
        if (opts.onBookActivated) opts.onBookActivated();
        else {
          await renderBooks(
            /** @type {import('../../core/router.js').RouteContext} */ ({ path: '/books', params: {}, query: {}, route: { path: '/books', title: 'Books', render: () => {} } }),
            outlet,
            opts
          );
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not delete book', 'error');
      }
    });
  });
}

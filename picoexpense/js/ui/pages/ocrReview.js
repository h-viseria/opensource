import { extract as ocrExtract, picoScanAvailable } from '../../services/ocrService.js';
import { parseReceiptText } from '../../ocr/receiptParser.js';
import { readOcrDraft, clearOcrDraft } from '../picoscanFab.js';
import { renderTransactionForm } from './transactionForm.js';
import { storeReceipt } from '../../services/receiptService.js';
import { escapeHtml } from '../../utils/html.js';
import { showToast } from '../toast.js';
import * as router from '../../core/router.js';
import { suggestCategory } from '../../services/masterService.js';

export async function renderOcrReview() {
  const outlet = document.getElementById('outlet');
  const available = await picoScanAvailable();
  const draftDoc = readOcrDraft();
  let parsed = draftDoc
    ? (await import('../../services/ocrService.js')).normalizeScan(draftDoc)
    : parseReceiptText('');

  outlet.innerHTML = `
    <section class="page">
      <h2>Scan receipt</h2>
      <p class="muted">Extracted locally on this device. Nothing is saved until you confirm.</p>
      ${available ? '' : '<p class="banner">PicoScan is currently unavailable. You can enter the transaction manually.</p>'}
      <div class="field">
        <label class="field__label" for="file">Receipt image or PDF</label>
        <input class="input" id="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,capture=camera" />
      </div>
      <div id="review"></div>
    </section>
  `;

  const review = document.getElementById('review');
  const paint = () => {
    review.innerHTML = `
      ${parsed.previewDataUrl ? `<img class="receipt-preview" alt="Receipt preview" src="${parsed.previewDataUrl}" />` : ''}
      <form id="ocr-form" class="form">
        <div class="field"><label class="field__label">Merchant</label><input class="input" name="merchant" value="${escapeHtml(parsed.merchant || '')}" /></div>
        <div class="field"><label class="field__label">Date</label><input class="input" name="date" type="date" value="${escapeHtml(parsed.date || '')}" /></div>
        <div class="field"><label class="field__label">Total</label><input class="input" name="total" value="${escapeHtml(parsed.total || '')}" /></div>
        <div class="field"><label class="field__label">Currency</label><input class="input" name="currency" value="${escapeHtml(parsed.currency || '')}" /></div>
        <div class="field"><label class="field__label">Tax</label><input class="input" name="tax" value="${escapeHtml(parsed.tax || '')}" /></div>
        <div class="field"><label class="field__label">OCR text</label><textarea class="input" name="raw" rows="6">${escapeHtml(parsed.rawText || '')}</textarea></div>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary" data-mode="save">Save</button>
          <button type="submit" class="btn btn--secondary" data-mode="edit">Save &amp; Edit</button>
          <button type="button" class="btn btn--ghost" id="cancel">Cancel</button>
          <button type="button" class="btn btn--ghost" id="rescan">Rescan</button>
        </div>
      </form>
    `;
    const form = review.querySelector('#ocr-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = e.submitter?.getAttribute('data-mode') || 'save';
      const fd = new FormData(form);
      const draft = {
        merchant: String(fd.get('merchant')),
        date: String(fd.get('date')),
        total: String(fd.get('total')),
        currency: String(fd.get('currency')),
        paymentMethod: parsed.paymentMethod,
        type: 'EXPENSE',
      };
      const sug = await suggestCategory({ merchantName: draft.merchant });
      outlet.dataset.ocrDraft = JSON.stringify(draft);
      clearOcrDraft();
      await renderTransactionForm(outlet, { type: 'EXPENSE', draft: { ...draft, categoryId: sug?.categoryId } });
      if (mode === 'save') {
        /* user still confirms on the form */
      }
    });
    review.querySelector('#cancel')?.addEventListener('click', () => {
      clearOcrDraft();
      router.navigate('/add');
    });
    review.querySelector('#rescan')?.addEventListener('click', () => {
      document.getElementById('file')?.click();
    });
  };

  if (draftDoc) paint();
  else {
    review.innerHTML = '<p class="muted">Choose a file or use the PicoScan button.</p>';
  }

  outlet.querySelector('#file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      parsed = await ocrExtract({ file });
      try {
        await storeReceipt(file, { preserveOriginal: false });
      } catch {
        /* storage optional at review */
      }
      paint();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'OCR failed — enter manually', 'error');
      router.navigate('/add');
    }
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocument } from '../engine/classify.js';
import { extractFields } from '../engine/extract.js';
import { validateDocument } from '../engine/validate.js';
import { createEmptyDocument, normalizeField } from '../core/documentModel.js';
import { DOCUMENT_TYPES } from '../core/constants.js';

test('classifies invoice-like text', () => {
  const result = classifyDocument('TAX INVOICE\nInvoice No: INV-100\nBill To: Acme\nTotal: 1200.00\nGSTIN: 22AAAAA0000A1Z5');
  assert.equal(result.documentType, DOCUMENT_TYPES.INVOICE);
  assert.ok(result.confidence > 0.4);
});

test('extracts invoice number and total', () => {
  const fields = extractFields(
    'Invoice Number: INV-42\nDate: 12/03/2024\nSubtotal: 100.00\nTax: 18.00\nGrand Total: 118.00',
    DOCUMENT_TYPES.INVOICE
  );
  const map = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  assert.equal(map.invoice_number, 'INV-42');
  assert.equal(map.total, '118.00');
});

test('validate flags total mismatch', () => {
  const doc = createEmptyDocument({
    documentType: DOCUMENT_TYPES.INVOICE,
    fields: [
      normalizeField({ label: 'Subtotal', value: '100' }),
      normalizeField({ label: 'Tax', value: '10' }),
      normalizeField({ label: 'Total', value: '200' }),
    ],
  });
  const issues = validateDocument(doc);
  assert.ok(issues.some((i) => /mismatch/i.test(i.message)));
});

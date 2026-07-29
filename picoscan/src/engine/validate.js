/**
 * Validation over the editable document model.
 */

/**
 * @param {import('../core/documentModel.js').ScanDocument} doc
 * @param {import('../core/documentModel.js').ScanDocument[]} [history]
 * @returns {{ level: 'error'|'warn', message: string }[]}
 */
export function validateDocument(doc, history = []) {
  /** @type {{ level: 'error'|'warn', message: string }[]} */
  const issues = [];
  const map = Object.fromEntries(doc.fields.map((f) => [f.key, f.value]));

  const dateVal = map.date || '';
  if (dateVal && !isPlausibleDate(dateVal)) {
    issues.push({ level: 'error', message: `Date looks invalid: “${dateVal}”` });
  }

  const total = parseMoney(map.total);
  const subtotal = parseMoney(map.subtotal);
  const tax = parseMoney(map.tax);
  if (total != null && subtotal != null && tax != null) {
    const sum = round2(subtotal + tax);
    if (Math.abs(sum - total) > 0.05) {
      issues.push({
        level: 'warn',
        message: `Total mismatch: subtotal (${subtotal}) + tax (${tax}) ≠ ${sum}, total is ${total}`,
      });
    }
  }

  const mandatoryByType = {
    Invoice: ['invoice_number', 'date', 'total'],
    Receipt: ['date', 'total'],
    'Purchase Order': ['po_number', 'date'],
  };
  const needed = mandatoryByType[doc.documentType] || [];
  for (const key of needed) {
    if (!String(map[key] || '').trim()) {
      issues.push({ level: 'warn', message: `Missing field: ${key.replace(/_/g, ' ')}` });
    }
  }

  const inv = String(map.invoice_number || '').trim().toLowerCase();
  if (inv) {
    const dup = history.find(
      (h) =>
        h.id !== doc.id &&
        h.fields.some(
          (f) => f.key === 'invoice_number' && f.value.trim().toLowerCase() === inv
        )
    );
    if (dup) {
      issues.push({
        level: 'warn',
        message: `Possible duplicate invoice number “${map.invoice_number}” (seen in history)`,
      });
    }
  }

  return issues;
}

/**
 * @param {string} value
 */
function isPlausibleDate(value) {
  const m = String(value).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) return false;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/**
 * @param {string|undefined} value
 * @returns {number|null}
 */
function parseMoney(value) {
  if (!value) return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {number} n
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

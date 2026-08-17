/**
 * Duplicate detection for import (date + amount + account + description/merchant).
 */

/**
 * @param {object} a
 * @param {object} b
 */
export function likelyDuplicate(a, b) {
  if (a.date !== b.date) return false;
  if (Math.trunc(a.amountMinor) !== Math.trunc(b.amountMinor)) return false;
  if (a.accountId && b.accountId && a.accountId !== b.accountId) return false;
  if (a.reference && b.reference && String(a.reference) === String(b.reference)) return true;
  const da = normalize(a.merchantName || a.description || '');
  const dbn = normalize(b.merchantName || b.description || '');
  if (da && dbn && da === dbn) return true;
  if (!da && !dbn) return true;
  return false;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * @param {object[]} incoming
 * @param {object[]} existing
 */
export function findDuplicates(incoming, existing) {
  return incoming.map((row, index) => {
    const matches = existing.filter((e) => !e.deletedAt && likelyDuplicate(row, e));
    return { index, row, matches };
  }).filter((x) => x.matches.length);
}

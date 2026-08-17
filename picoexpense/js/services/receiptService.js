import { STORES } from '../core/constants.js';
import { uuid } from '../core/uuid.js';
import { nowIso } from '../utils/date.js';
import { receiptRepository, attachmentRepository, transactionRepository } from '../repositories/index.js';
import { markLocalDataChanged } from './settingsService.js';

const MAX_STORE_PX = 1600;
const THUMB_PX = 240;

/**
 * @param {File} file
 * @param {{ preserveOriginal?: boolean, transactionId?: string }} [opts]
 */
export async function storeReceipt(file, opts = {}) {
  if (!file) throw new Error('No file');
  const mime = file.type || 'application/octet-stream';
  const allowed = /^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/i.test(mime) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
  if (!allowed) throw new Error('Receipts must be JPG, PNG, WEBP, or PDF');

  let blob = file;
  let thumbnail = null;
  if (mime.startsWith('image/') && !opts.preserveOriginal) {
    const resized = await resizeImage(file, MAX_STORE_PX);
    blob = resized.blob;
    thumbnail = await resizeImage(file, THUMB_PX).then((r) => r.dataUrl);
  } else if (mime.startsWith('image/')) {
    thumbnail = await resizeImage(file, THUMB_PX).then((r) => r.dataUrl);
  }

  const rec = {
    id: uuid(),
    transactionId: opts.transactionId || null,
    fileName: file.name,
    mimeType: blob.type || mime,
    size: blob.size,
    createdAt: nowIso(),
    thumbnail,
    blob,
    preservedOriginal: Boolean(opts.preserveOriginal),
  };
  await receiptRepository.put(rec);
  const meta = {
    id: rec.id,
    transactionId: rec.transactionId,
    fileName: rec.fileName,
    mimeType: rec.mimeType,
    size: rec.size,
    createdAt: rec.createdAt,
    thumbnail: rec.thumbnail,
  };
  await attachmentRepository.put(meta);
  if (opts.transactionId) {
    const txn = await transactionRepository.getById(opts.transactionId);
    if (txn) {
      const ids = [...(txn.attachmentIds || []), rec.id];
      await transactionRepository.put({ ...txn, attachmentIds: ids, updatedAt: nowIso() });
    }
  }
  await markLocalDataChanged();
  return rec;
}

export async function listReceipts() {
  return receiptRepository.getAll();
}

export async function getReceipt(id) {
  return receiptRepository.getById(id);
}

export async function deleteReceipt(id) {
  const rec = await receiptRepository.getById(id);
  await receiptRepository.remove(id);
  await attachmentRepository.remove(id);
  if (rec?.transactionId) {
    const txn = await transactionRepository.getById(rec.transactionId);
    if (txn) {
      await transactionRepository.put({
        ...txn,
        attachmentIds: (txn.attachmentIds || []).filter((x) => x !== id),
        updatedAt: nowIso(),
      });
    }
  }
  await markLocalDataChanged();
}

export async function downloadReceipt(id) {
  const rec = await getReceipt(id);
  if (!rec?.blob) throw new Error('Receipt not found');
  const url = URL.createObjectURL(rec.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = rec.fileName || 'receipt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function linkReceipt(receiptId, transactionId) {
  const rec = await getReceipt(receiptId);
  if (!rec) throw new Error('Receipt not found');
  await receiptRepository.put({ ...rec, transactionId });
  const txn = await transactionRepository.getById(transactionId);
  if (txn) {
    const ids = Array.from(new Set([...(txn.attachmentIds || []), receiptId]));
    await transactionRepository.put({ ...txn, attachmentIds: ids, updatedAt: nowIso() });
  }
  await markLocalDataChanged();
}

/**
 * @param {File} file
 * @param {number} maxEdge
 */
async function resizeImage(file, maxEdge) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
    return { blob, dataUrl: canvas.toDataURL('image/jpeg', 0.7) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = url;
  });
}

export { STORES };

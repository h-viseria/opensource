import { PDFDocument, StandardFonts, degrees, rgb } from '../../vendor/pdf-lib.esm.min.js';
import { zipSync } from '../../vendor/fflate.js';

const load = (bytes) => PDFDocument.load(bytes, { updateMetadata: false });

export function parsePageRange(value, pageCount) {
  const selected = new Set();
  for (const token of String(value || '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const match = token.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`Invalid page range: ${token}`);
    const start = Number(match[1]);
    const finish = Number(match[2] || start);
    if (start < 1 || finish > pageCount || start > finish) throw new Error(`Page range out of bounds: ${token}`);
    for (let page = start; page <= finish; page += 1) selected.add(page - 1);
  }
  return [...selected];
}

export async function validatePdf(bytes) {
  const pdf = await load(bytes);
  const count = pdf.getPageCount();
  if (!count) throw new Error('The output PDF has no pages.');
  return count;
}

export async function mergePdfs(sources) {
  const output = await PDFDocument.create();
  for (const bytes of sources) {
    const source = await load(bytes);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  return output.save({ useObjectStreams: true });
}

export async function extractPages(bytes, indexes) {
  const source = await load(bytes);
  if (!indexes.length) throw new Error('Select at least one page.');
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indexes);
  pages.forEach((page) => output.addPage(page));
  return output.save({ useObjectStreams: true });
}

export async function deletePages(bytes, indexes) {
  const source = await load(bytes);
  [...indexes].sort((a, b) => b - a).forEach((index) => source.removePage(index));
  if (!source.getPageCount()) throw new Error('A PDF must contain at least one page.');
  return source.save({ useObjectStreams: true });
}

export async function reorderPages(bytes, order) {
  const source = await load(bytes);
  if (order.length !== source.getPageCount() || new Set(order).size !== order.length) throw new Error('Order must contain every page exactly once.');
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, order);
  pages.forEach((page) => output.addPage(page));
  return output.save({ useObjectStreams: true });
}

export async function rotatePages(bytes, indexes, angle) {
  const pdf = await load(bytes);
  indexes.forEach((index) => {
    const page = pdf.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + Number(angle)) % 360));
  });
  return pdf.save({ useObjectStreams: true });
}

export async function addPageNumbers(bytes, { indexes, position = 'bottom-center', size = 11, start = 1 }) {
  const pdf = await load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  indexes.forEach((index, sequence) => {
    const page = pdf.getPage(index);
    const { width, height } = page.getSize();
    const label = String(start + sequence);
    const textWidth = font.widthOfTextAtSize(label, size);
    const x = position.includes('left') ? 28 : position.includes('right') ? width - textWidth - 28 : (width - textWidth) / 2;
    const y = position.startsWith('top') ? height - size - 24 : 24;
    page.drawText(label, { x, y, size, font, color: rgb(0.15, 0.15, 0.15) });
  });
  return pdf.save({ useObjectStreams: true });
}

export async function addWatermark(bytes, { indexes, text, opacity = 0.2, rotation = 45, size = 44 }) {
  const pdf = await load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  indexes.forEach((index) => {
    const page = pdf.getPage(index);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      font, size, opacity, rotate: degrees(rotation), color: rgb(0.35, 0.35, 0.35),
    });
  });
  return pdf.save({ useObjectStreams: true });
}

export async function updateMetadata(bytes, metadata) {
  const pdf = await load(bytes);
  if (metadata.title != null) pdf.setTitle(metadata.title);
  if (metadata.author != null) pdf.setAuthor(metadata.author);
  if (metadata.subject != null) pdf.setSubject(metadata.subject);
  if (metadata.keywords != null) pdf.setKeywords(metadata.keywords.split(',').map((x) => x.trim()).filter(Boolean));
  pdf.setProducer('PicoOffice');
  return pdf.save({ useObjectStreams: true });
}

async function imageData(file) {
  if (/jpe?g/i.test(file.type)) return { kind: 'jpg', bytes: new Uint8Array(await file.arrayBuffer()) };
  if (/png/i.test(file.type)) return { kind: 'png', bytes: new Uint8Array(await file.arrayBuffer()) };
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return { kind: 'jpg', bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export async function imagesToPdf(files, { pageSize = 'image', margin = 0 } = {}) {
  if (!files.length || files.some((file) => !/^image\/(jpeg|png|webp)$/i.test(file.type))) {
    throw new Error('Choose JPG, PNG, or WebP images.');
  }
  if (files.some((file) => !file.size || file.size > 100 * 1024 * 1024)) {
    throw new Error('Each image must be non-empty and smaller than 100 MB.');
  }
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const data = await imageData(file);
    const image = data.kind === 'png' ? await pdf.embedPng(data.bytes) : await pdf.embedJpg(data.bytes);
    const natural = image.scale(1);
    const dimensions = pageSize === 'a4' ? [595.28, 841.89] : [natural.width + margin * 2, natural.height + margin * 2];
    const page = pdf.addPage(dimensions);
    const scale = Math.min((dimensions[0] - margin * 2) / natural.width, (dimensions[1] - margin * 2) / natural.height, 1);
    const width = natural.width * scale;
    const height = natural.height * scale;
    page.drawImage(image, { x: (dimensions[0] - width) / 2, y: (dimensions[1] - height) / 2, width, height });
  }
  return pdf.save({ useObjectStreams: true });
}

export function zipFiles(files) {
  return zipSync(Object.fromEntries(files.map(({ name, bytes }) => [name, bytes])), { level: 6 });
}

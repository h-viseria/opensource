import { PDFDocument } from '../../vendor/pdf-lib.esm.min.js';
import { pdfjsLib } from './PdfEngine.js';

function processPixels(imageData, mode, settings = {}) {
  const data = imageData.data;
  const brightness = Number(settings.brightness ?? 1.15);
  const contrast = Number(settings.contrast ?? 1.25);
  const threshold = Number(settings.threshold ?? 180);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (mode === 'invert') {
      data[i] = 255 - r; data[i + 1] = 255 - g; data[i + 2] = 255 - b;
      continue;
    }
    let value = (r * 0.2126 + g * 0.7152 + b * 0.0722);
    value = (value - 128) * contrast + 128;
    value *= brightness;
    if (mode === 'light') {
      value = value < threshold ? Math.max(0, value * 0.25) : Math.min(255, 220 + (value - threshold) * 0.5);
    }
    if (mode === 'monochrome') value = value >= threshold ? 255 : 0;
    value = Math.max(0, Math.min(255, value));
    data[i] = value; data[i + 1] = value; data[i + 2] = value;
  }
  return imageData;
}

export async function renderPageBlob(pdf, pageNumber, { dpi = 150, format = 'image/jpeg', quality = 0.86, mode, settings } = {}) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const pageSize = page.getViewport({ scale: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: Boolean(mode) });
  await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
  if (mode) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    context.putImageData(processPixels(image, mode, settings), 0, 0);
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve({ blob, width: pageSize.width, height: pageSize.height }) : reject(new Error('Canvas export failed.')), format, quality));
}

export async function transformPdf(bytes, { mode = 'grayscale', pages = [], dpi = 150, quality = 0.86, settings = {}, onProgress = () => {} } = {}) {
  const source = await pdfjsLib.getDocument({ data: bytes.slice(), enableScripting: false, isEvalSupported: false }).promise;
  const sourceStructure = await PDFDocument.load(bytes, { updateMetadata: false });
  const output = await PDFDocument.create();
  const selected = new Set(pages.length ? pages : Array.from({ length: source.numPages }, (_, index) => index));
  for (let index = 0; index < source.numPages; index += 1) {
    onProgress({ index, total: source.numPages });
    if (!selected.has(index)) {
      const [copied] = await output.copyPages(sourceStructure, [index]);
      output.addPage(copied);
    } else {
      const { blob, width, height } = await renderPageBlob(source, index + 1, { dpi, quality, mode, settings });
      const imageBytes = new Uint8Array(await blob.arrayBuffer());
      const image = await output.embedJpg(imageBytes);
      const page = output.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    }
  }
  await source.destroy();
  onProgress({ index: source.numPages, total: source.numPages });
  return output.save({ useObjectStreams: true });
}

export async function pdfToImages(bytes, { pages = [], dpi = 150, format = 'image/png', quality = 0.9, onProgress = () => {} } = {}) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), enableScripting: false, isEvalSupported: false }).promise;
  const indexes = pages.length ? pages : Array.from({ length: pdf.numPages }, (_, index) => index);
  const files = [];
  for (let i = 0; i < indexes.length; i += 1) {
    onProgress({ index: i, total: indexes.length });
    const { blob } = await renderPageBlob(pdf, indexes[i] + 1, { dpi, format, quality });
    files.push({ name: `page-${String(indexes[i] + 1).padStart(3, '0')}.${format === 'image/png' ? 'png' : 'jpg'}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
  }
  await pdf.destroy();
  return files;
}

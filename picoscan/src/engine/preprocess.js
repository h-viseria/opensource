/**
 * Image / PDF ingest + lightweight canvas preprocessing.
 */

/**
 * @typedef {Object} LoadedImage
 * @property {string} dataUrl
 * @property {number} width
 * @property {number} height
 * @property {string} sourceName
 * @property {string} [embeddedText]
 */

/**
 * @param {File|Blob} file
 * @param {{ password?: string }} [opts]
 * @returns {Promise<LoadedImage>}
 */
export async function loadImageFromFile(file, opts = {}) {
  const name = file instanceof File ? file.name : 'clipboard';
  const type = file.type || '';

  if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
    return renderPdfFirstPage(file, name, opts.password || '');
  }

  const dataUrl = await readAsDataURL(file);
  const dims = await probeImage(dataUrl);
  return { dataUrl, ...dims, sourceName: name };
}

/**
 * True when opening the PDF without a password raises PasswordException.
 * @param {Blob} blob
 */
export async function pdfNeedsPassword(blob) {
  try {
    await openPdfDocument(blob, '');
    return false;
  } catch (err) {
    return isPasswordException(err) && /** @type {any} */ (err).code !== 2;
  }
}

/**
 * @param {unknown} err
 */
export function isPasswordException(err) {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {any} */ (err);
  if (e.name === 'PasswordException') return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('password') && (msg.includes('no password') || msg.includes('incorrect') || msg.includes('required'));
}

/**
 * @param {Blob} blob
 * @param {string} [password]
 */
async function openPdfDocument(blob, password = '') {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  try {
    return await pdfjs.getDocument({
      data,
      password: password || undefined,
    }).promise;
  } catch (err) {
    if (isPasswordException(err) || /** @type {any} */ (err)?.name === 'PasswordException') {
      const code = Number(/** @type {any} */ (err).code) || 1;
      const wrapped = new Error(
        code === 2 ? 'Incorrect PDF password' : 'No password given'
      );
      wrapped.name = 'PasswordException';
      /** @type {any} */ (wrapped).code = code;
      throw wrapped;
    }
    throw err;
  }
}

async function loadPdfJs() {
  const pdfjs = await import('../../vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    '../../vendor/pdfjs/pdf.worker.min.mjs',
    import.meta.url
  ).href;
  return pdfjs;
}

/**
 * Rebuild line breaks from pdf.js text items using Y positions.
 * @param {{ items?: unknown[] }} content
 */
function textContentToPlainText(content) {
  const items = Array.isArray(content?.items) ? content.items : [];
  /** @type {{ str: string, y: number, x: number }[]} */
  const parts = [];
  for (const it of items) {
    if (!it || typeof it !== 'object' || !('str' in it)) continue;
    const str = String(/** @type {any} */ (it).str || '');
    if (!str) continue;
    const tr = /** @type {any} */ (it).transform;
    const x = Array.isArray(tr) ? Number(tr[4]) || 0 : 0;
    const y = Array.isArray(tr) ? Number(tr[5]) || 0 : 0;
    parts.push({ str, x, y });
  }
  if (!parts.length) return '';

  // PDF Y grows upward — sort top-to-bottom, then left-to-right
  parts.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x));

  /** @type {string[]} */
  const lines = [];
  let curY = parts[0].y;
  let buf = [];
  for (const p of parts) {
    if (Math.abs(p.y - curY) > 2.5) {
      const line = buf.join('').replace(/[ \t]+/g, ' ').trim();
      if (line) lines.push(line);
      buf = [p.str];
      curY = p.y;
    } else {
      // pdf.js often already includes spaces in tokens
      const needsSpace =
        buf.length &&
        !/\s$/.test(buf[buf.length - 1]) &&
        !/^\s/.test(p.str) &&
        !/^[,.;:)\]%]/.test(p.str);
      buf.push(needsSpace ? ` ${p.str}` : p.str);
    }
  }
  const last = buf.join('').replace(/[ \t]+/g, ' ').trim();
  if (last) lines.push(last);
  return lines.join('\n');
}

/**
 * @param {Blob} blob
 * @param {string} sourceName
 * @param {string} [password]
 */
async function renderPdfFirstPage(blob, sourceName, password = '') {
  const pdf = await openPdfDocument(blob, password);

  // Pull text from every page (bank statements etc. are multi-page)
  const textParts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = textContentToPlainText(content);
      if (pageText) textParts.push(pageText);
    } catch {
      /* skip bad page */
    }
  }
  const embeddedText = textParts.join('\n');

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 3.5 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    sourceName,
    embeddedText,
  };
}

/**
 * @param {Blob} blob
 */
function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {string} dataUrl
 */
function probeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = dataUrl;
  });
}

/**
 * Apply basic preprocess ops via canvas (contrast / rotate / grayscale / denoise-ish).
 * @param {string} dataUrl
 * @param {{ rotate?: number, contrast?: number, grayscale?: boolean, sharpen?: boolean, maxWidth?: number }} opts
 */
export async function preprocessImage(dataUrl, opts = {}) {
  const img = await loadHtmlImage(dataUrl);
  const rotate = Number(opts.rotate) || 0;
  const rad = (rotate * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  let width = Math.round(img.width * cos + img.height * sin);
  let height = Math.round(img.width * sin + img.height * cos);

  const maxWidth = Number(opts.maxWidth) || 0;
  let scale = 1;
  if (maxWidth > 0 && width > maxWidth) {
    scale = maxWidth / width;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rad);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  if (opts.grayscale || opts.contrast || opts.sharpen) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;
    const contrast = Number(opts.contrast) || 0;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      if (opts.grayscale) {
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        r = g = b = y;
      }
      if (contrast) {
        r = clampByte(factor * (r - 128) + 128);
        g = clampByte(factor * (g - 128) + 128);
        b = clampByte(factor * (b - 128) + 128);
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    if (opts.sharpen) {
      const copy = new Uint8ClampedArray(d);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            const avg =
              (copy[i - 4 + c] +
                copy[i + 4 + c] +
                copy[i - width * 4 + c] +
                copy[i + width * 4 + c]) /
              4;
            d[i + c] = clampByte(copy[i + c] * 1.5 - avg * 0.5);
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
function loadHtmlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for preprocess'));
    img.src = dataUrl;
  });
}

/**
 * @param {number} n
 */
function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

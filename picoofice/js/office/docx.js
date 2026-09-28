import mammoth from '../../vendor/mammoth.esm.js';
import { unzipSync } from '../../vendor/fflate.js';
import { sanitizeHtml } from './sanitize.js';

function mammothInput(bytes) {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const input = { arrayBuffer };
  if (typeof Buffer !== 'undefined') input.buffer = Buffer.from(bytes);
  return input;
}

export async function parseDocx(bytes) {
  let macroIgnored = false;
  try {
    macroIgnored = Object.keys(unzipSync(bytes)).some((name) => name.toLowerCase().endsWith('vbaproject.bin'));
  } catch {
    throw new Error('This document could not be opened. Password-protected Word files are not supported.');
  }
  const input = mammothInput(bytes);
  const result = await mammoth.convertToHtml(input, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const base64 = await image.read('base64');
      return { src: `data:${image.contentType};base64,${base64}` };
    }),
  });
  const text = await mammoth.extractRawText(input);
  return { html: sanitizeHtml(result.value), text: text.value, macroIgnored };
}

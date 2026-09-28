import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from '../../vendor/pdf-lib.esm.min.js';

const PRESETS = {
  quality: { dpi: 300, quality: 0.9 },
  balanced: { dpi: 150, quality: 0.75 },
  small: { dpi: 110, quality: 0.58 },
  maximum: { dpi: 72, quality: 0.42 },
};

export async function compressPdf(bytes, options = {}, onProgress = () => {}) {
  const settings = { ...PRESETS[options.preset || 'balanced'], ...options };
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const candidates = [];
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    if (object.dict.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue;
    if (object.dict.has(PDFName.of('SMask')) || object.dict.has(PDFName.of('Mask'))) continue;
    candidates.push({ ref, object });
  }
  let replaced = 0;
  let savedBytes = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const { ref, object } = candidates[index];
    onProgress({ index, total: candidates.length });
    try {
      const blob = new Blob([object.contents], { type: 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);
      const maxPixels = Math.max(480, Math.round(settings.dpi * 11.7));
      const scale = Math.min(1, maxPixels / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: Boolean(settings.colorMode) });
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      if (settings.colorMode) {
        const image = context.getImageData(0, 0, width, height);
        const data = image.data;
        const brightness = Number(settings.brightness ?? 1.2);
        const contrast = Number(settings.contrast ?? 1.3);
        const threshold = Number(settings.threshold ?? 175);
        for (let pixel = 0; pixel < data.length; pixel += 4) {
          if (settings.colorMode === 'invert') {
            data[pixel] = 255 - data[pixel];
            data[pixel + 1] = 255 - data[pixel + 1];
            data[pixel + 2] = 255 - data[pixel + 2];
            continue;
          }
          let gray = data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722;
          gray = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
          if (settings.colorMode === 'light') gray = gray < threshold ? gray * 0.25 : Math.min(255, 220 + (gray - threshold) * brightness);
          if (settings.colorMode === 'monochrome') gray = gray >= threshold ? 255 : 0;
          data[pixel] = gray; data[pixel + 1] = gray; data[pixel + 2] = gray;
        }
        context.putImageData(image, 0, 0);
      }
      const output = await canvas.convertToBlob({ type: 'image/jpeg', quality: settings.quality });
      const compressed = new Uint8Array(await output.arrayBuffer());
      if (!settings.forceReplace && compressed.length >= object.contents.length * 0.98) continue;
      const dict = object.dict.clone(pdf.context);
      dict.set(PDFName.of('Width'), PDFNumber.of(width));
      dict.set(PDFName.of('Height'), PDFNumber.of(height));
      dict.set(PDFName.of('Length'), PDFNumber.of(compressed.length));
      dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
      dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      dict.delete(PDFName.of('DecodeParms'));
      dict.delete(PDFName.of('Decode'));
      pdf.context.assign(ref, PDFRawStream.of(dict, compressed));
      replaced += 1;
      savedBytes += object.contents.length - compressed.length;
    } catch {
      // Unusual JPEG/color spaces are deliberately left untouched.
    }
  }
  onProgress({ index: candidates.length, total: candidates.length });
  const output = await pdf.save({ useObjectStreams: true });
  return {
    bytes: output.length < bytes.length ? output : bytes,
    report: { examined: candidates.length, replaced, savedBytes, originalSize: bytes.length, outputSize: Math.min(output.length, bytes.length) },
  };
}

export { PRESETS };

export function transformRasterImages(bytes, options, onProgress) {
  return compressPdf(bytes, {
    dpi: options.dpi || 300,
    quality: options.quality || 0.9,
    colorMode: options.mode,
    forceReplace: true,
    brightness: options.brightness,
    contrast: options.contrast,
    threshold: options.threshold,
  }, onProgress);
}

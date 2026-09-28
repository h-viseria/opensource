import { compressPdf, transformRasterImages } from '../pdf/PdfCompress.js';

self.onmessage = async ({ data }) => {
  try {
    if (!['compress', 'transform-images'].includes(data.type)) throw new Error(`Unsupported worker operation: ${data.type}`);
    const operation = data.type === 'compress' ? compressPdf : transformRasterImages;
    const result = await operation(new Uint8Array(data.bytes), data.options, (progress) => self.postMessage({ type: 'progress', progress }));
    const output = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
    self.postMessage({ type: 'result', bytes: output.buffer, report: result.report }, [output.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

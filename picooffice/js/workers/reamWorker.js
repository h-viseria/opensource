import { convertBytesToPdfWithReam } from '../convert/reamConvert.js';

self.onmessage = async ({ data }) => {
  try {
    if (data.type !== 'convert-pdf') throw new Error(`Unsupported worker operation: ${data.type}`);
    const result = await convertBytesToPdfWithReam(new Uint8Array(data.bytes), {
      password: data.password,
      onProgress: (message) => self.postMessage({ type: 'progress', message }),
    });
    const output = result.pdf instanceof Uint8Array ? result.pdf : new Uint8Array(result.pdf);
    self.postMessage({
      type: 'result',
      bytes: output.buffer,
      losses: result.losses,
      format: result.format,
    }, [output.buffer]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

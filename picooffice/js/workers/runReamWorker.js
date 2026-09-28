/**
 * Run Ream conversion off the main thread.
 * @param {Uint8Array} bytes
 * @param {{ password?: string, onProgress?: (message: string) => void }} [options]
 */
export function convertToPdfInWorker(bytes, options = {}) {
  const onProgress = options.onProgress || (() => {});
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reamWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.message);
      if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.message));
      }
      if (data.type === 'result') {
        worker.terminate();
        resolve({
          pdf: new Uint8Array(data.bytes),
          losses: data.losses || [],
          format: data.format,
        });
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Conversion worker failed.'));
    };
    const copy = bytes.slice().buffer;
    worker.postMessage({
      type: 'convert-pdf',
      bytes: copy,
      password: options.password,
    }, [copy]);
  });
}

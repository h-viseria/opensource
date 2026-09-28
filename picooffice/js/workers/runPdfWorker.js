function run(type, bytes, options, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdfWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.progress);
      if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.message));
      }
      if (data.type === 'result') {
        worker.terminate();
        resolve({ bytes: new Uint8Array(data.bytes), report: data.report });
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'PDF worker failed.'));
    };
    const copy = bytes.slice().buffer;
    worker.postMessage({ type, bytes: copy, options }, [copy]);
  });
}

export const compressInWorker = (bytes, options, onProgress) => run('compress', bytes, options, onProgress);
export const transformImagesInWorker = (bytes, options, onProgress) => run('transform-images', bytes, options, onProgress);

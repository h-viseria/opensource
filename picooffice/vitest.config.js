import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
  resolve: {
    alias: {
      'pdfjs-dist': path.join(root, 'vendor/pdfjs/pdf.mjs'),
      'pdf-lib': path.join(root, 'vendor/pdf-lib.esm.min.js'),
      fflate: path.join(root, 'vendor/fflate.js'),
      mammoth: path.join(root, 'vendor/mammoth.esm.js'),
    },
  },
});

/**
 * Copy browser dependencies into vendor/ for static hosting (no bundler).
 * Run after npm install when upgrading pdf.js, pdf-lib, fflate, or mammoth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

const vendor = path.join(root, 'vendor');
fs.mkdirSync(vendor, { recursive: true });

rm(path.join(vendor, 'pdfjs'));
cp(path.join(nm, 'pdfjs-dist/build'), path.join(vendor, 'pdfjs'));

rm(path.join(vendor, 'pdf-lib'));
cp(path.join(nm, 'pdf-lib/dist/pdf-lib.esm.min.js'), path.join(vendor, 'pdf-lib.esm.min.js'));

cp(path.join(nm, 'fflate/esm/browser.js'), path.join(vendor, 'fflate.js'));

await esbuild.build({
  entryPoints: [path.join(nm, 'mammoth/lib/index.js')],
  outfile: path.join(vendor, 'mammoth.esm.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
});

console.log('Vendor sync complete:', vendor);

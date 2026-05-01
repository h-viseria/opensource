import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');

const requiredFiles = [
    'index.html',
    'main.js',
    'styles.css',
    'app/application/services/holdingsImportService.js',
    'app/application/services/amcReportService.js',
    'app/application/services/schemeMatcher.js',
    'app/application/services/schemeCodeSyncService.js',
    'app/application/services/navSnapshotService.js',
    'app/application/services/reportService.js',
    'app/infrastructure/db/indexedDb.js',
    'app/infrastructure/api/mfApiClient.js',
    'app/infrastructure/parsers/mfcCasParser.js',
    'app/shared/formatters.js',
    'app/ui/tabNavigation.js',
    'app/ui/appController.js',
    'tests/amc-report.mjs',
    'tests/scheme-matcher.mjs',
    'tests/cas-regression.mjs',
    'tests/portfolio-compare.mjs',
];

for (const relativePath of requiredFiles) {
    const absolutePath = path.join(rootDir, relativePath);
    readFileSync(absolutePath, 'utf8');
}

console.log('Smoke test passed: MF holdings import/report modules are present and readable.');


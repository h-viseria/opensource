/**
 * import.js — Handles CSV file upload and saves to IndexedDB
 */

import { parseAccounts, parseTransactions, dedupeMirroredTransactions } from './csv-parser.js';
import { bulkInsert, clearAndBulkInsert, exportData, getAll, importData } from './db.js';

export function initImport(onImportDone) {

    // Chart of Accounts upload
    document.getElementById('coa-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showStatus('coa-status', 'info', 'Parsing...');
        try {
            const text = await file.text();
            const accounts = parseAccounts(text);
            if (accounts.length === 0) {
                showStatus('coa-status', 'error', 'No valid accounts found. Check CSV headers.');
                return;
            }
            const mode = getImportMode('coa-import-mode');
            if (mode === 'append') {
                await bulkInsert('accounts', accounts);
                showStatus('coa-status', 'success', `Appended ${accounts.length} account(s) successfully.`);
            } else {
                await clearAndBulkInsert('accounts', accounts);
                showStatus('coa-status', 'success', `Imported ${accounts.length} account(s) successfully.`);
            }
            onImportDone();
        } catch (err) {
            showStatus('coa-status', 'error', 'Error: ' + err.message);
        }
        e.target.value = '';
    });

    // Transactions upload
    document.getElementById('tx-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showStatus('tx-status', 'info', 'Parsing...');
        try {
            const text = await file.text();
            const transactions = parseTransactions(text);
            if (transactions.length === 0) {
                showStatus('tx-status', 'error', 'No valid transactions found. Check CSV headers.');
                return;
            }
            const mode = getImportMode('tx-import-mode');
            if (mode === 'append') {
                const existing = await getAll('transactions');
                const merged = dedupeMirroredTransactions([
                    ...existing,
                    ...transactions,
                ]);
                await clearAndBulkInsert('transactions', merged);
                const removed = existing.length + transactions.length - merged.length;
                showStatus('tx-status', 'success', `Appended ${transactions.length} transaction(s); merged duplicates removed: ${removed}.`);
            } else {
                await clearAndBulkInsert('transactions', transactions);
                showStatus('tx-status', 'success', `Imported ${transactions.length} transaction(s) successfully.`);
            }
            onImportDone();
        } catch (err) {
            showStatus('tx-status', 'error', 'Error: ' + err.message);
        }
        e.target.value = '';
    });

    // Export backup
    document.getElementById('btn-export').addEventListener('click', async () => {
        try {
            const data = await exportData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'accounting-backup-' + new Date().toISOString().slice(0,10) + '.json';
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('Export failed: ' + err.message);
        }
    });

    // Import backup
    document.getElementById('btn-import-backup').addEventListener('click', () => {
        document.getElementById('backup-file').click();
    });

    document.getElementById('backup-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await importData(data);
            alert('Backup restored successfully!');
            onImportDone();
        } catch (err) {
            alert('Restore failed: ' + err.message);
        }
        e.target.value = '';
    });

    // Clear all data
    document.getElementById('btn-clear').addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete ALL accounts and transactions?')) return;
        await clearAndBulkInsert('accounts', []);
        await clearAndBulkInsert('transactions', []);
        showStatus('coa-status', 'info', 'All data cleared.');
        showStatus('tx-status', '');
        onImportDone();
    });
}

function showStatus(id, type, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'status-msg ' + (type || '');
    el.textContent = message || '';
}

function getImportMode(groupName) {
    const selected = document.querySelector(`input[name="${groupName}"]:checked`);
    return selected ? selected.value : 'replace';
}


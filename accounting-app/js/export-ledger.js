/**
 * export-ledger.js - General Ledger exports (PDF and XLS) for all accounts.
 */

import { getGeneralLedgerReport } from './accounts.js';
import { formatCurrency, formatDate } from './models.js';

export function initGeneralLedgerExport() {
    const pdfBtn = document.getElementById('btn-export-gl-pdf');
    const xlsBtn = document.getElementById('btn-export-gl-xls');

    if (!pdfBtn || !xlsBtn) return;

    pdfBtn.addEventListener('click', async () => {
        try {
            setStatus('info', 'Preparing PDF...');
            await exportGeneralLedgerPdf();
            setStatus('success', 'General Ledger PDF downloaded.');
        } catch (err) {
            setStatus('error', `PDF export failed: ${err.message}`);
        }
    });

    xlsBtn.addEventListener('click', async () => {
        try {
            setStatus('info', 'Preparing XLS...');
            await exportGeneralLedgerXls();
            setStatus('success', 'General Ledger XLS downloaded.');
        } catch (err) {
            setStatus('error', `XLS export failed: ${err.message}`);
        }
    });
}

export async function exportGeneralLedgerPdf() {
    const report = await getGeneralLedgerReport();
    if (report.ledgers.length === 0) {
        throw new Error('No accounts available for export.');
    }

    const jsPdfNs = window.jspdf;
    if (!jsPdfNs || !jsPdfNs.jsPDF) {
        throw new Error('jsPDF library not loaded.');
    }

    const doc = new jsPdfNs.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        throw new Error('jsPDF AutoTable plugin not loaded.');
    }

    let firstPage = true;
    report.ledgers.forEach((ledger) => {
        if (!firstPage) doc.addPage();
        firstPage = false;

        const title = `General Ledger - ${ledger.account.shortCode} - ${ledger.account.name}`;
        doc.setFontSize(12);
        doc.text(title, 40, 36);
        doc.setFontSize(10);
        doc.text(`Opening Balance: ${formatCurrency(ledger.openingBalance)}`, 40, 54);

        const rows = ledger.ledgerRows.map((row) => {
            const counterpart = row.side === 'main' ? row.tx.targetAccount : row.tx.mainAccount;
            const counterName = ledger.accMap[counterpart] ? ledger.accMap[counterpart].name : counterpart;
            return [
                row.tx.transactionDate,
                row.tx.valueDate,
                row.tx.description || '',
                row.tx.comments1 || '',
                row.tx.comments2 || '',
                `${counterpart || ''}${counterName ? ' - ' + counterName : ''}`,
                row.displayDeposit ? formatCurrency(row.displayDeposit) : '',
                row.displayWithdrawal ? formatCurrency(row.displayWithdrawal) : '',
                formatCurrency(row.runningBalance),
            ];
        });

        doc.autoTable({
            startY: 66,
            head: [[
                'Tx Date', 'Value Date', 'Description', 'Comments1', 'Comments2',
                'Counterpart', 'Deposit', 'Withdrawal', 'Running Balance'
            ]],
            body: rows,
            styles: { fontSize: 8, cellPadding: 4 },
            headStyles: { fillColor: [42, 71, 155] },
        });
    });

    doc.save(`general-ledger-${todayString()}.pdf`);
}

export async function exportGeneralLedgerXls() {
    const report = await getGeneralLedgerReport();
    if (report.ledgers.length === 0) {
        throw new Error('No accounts available for export.');
    }

    let html = `
        <html>
        <head><meta charset="utf-8"></head>
        <body>
        <h2>General Ledger</h2>
        <p>Generated At: ${formatDate(report.generatedAt)}</p>
    `;

    report.ledgers.forEach((ledger) => {
        html += `
            <h3>${escHtml(ledger.account.shortCode)} - ${escHtml(ledger.account.name)}</h3>
            <p>Opening Balance: ${formatCurrency(ledger.openingBalance)}</p>
            <table border="1" cellspacing="0" cellpadding="4">
                <tr>
                    <th>Tx Date</th>
                    <th>Value Date</th>
                    <th>Description</th>
                    <th>Comments1</th>
                    <th>Comments2</th>
                    <th>Counterpart</th>
                    <th>Deposit</th>
                    <th>Withdrawal</th>
                    <th>Running Balance</th>
                </tr>
        `;

        ledger.ledgerRows.forEach((row) => {
            const counterpart = row.side === 'main' ? row.tx.targetAccount : row.tx.mainAccount;
            const counterName = ledger.accMap[counterpart] ? ledger.accMap[counterpart].name : counterpart;
            html += `
                <tr>
                    <td>${escHtml(row.tx.transactionDate)}</td>
                    <td>${escHtml(row.tx.valueDate)}</td>
                    <td>${escHtml(row.tx.description)}</td>
                    <td>${escHtml(row.tx.comments1)}</td>
                    <td>${escHtml(row.tx.comments2)}</td>
                    <td>${escHtml(`${counterpart || ''}${counterName ? ' - ' + counterName : ''}`)}</td>
                    <td style="text-align:right">${row.displayDeposit ? formatCurrency(row.displayDeposit) : ''}</td>
                    <td style="text-align:right">${row.displayWithdrawal ? formatCurrency(row.displayWithdrawal) : ''}</td>
                    <td style="text-align:right">${formatCurrency(row.runningBalance)}</td>
                </tr>
            `;
        });

        html += '</table><br/>';
    });

    html += '</body></html>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `general-ledger-${todayString()}.xls`;
    a.click();
    URL.revokeObjectURL(url);
}

function setStatus(type, message) {
    const el = document.getElementById('gl-export-status');
    if (!el) return;
    el.className = 'status-msg ' + (type || '');
    el.textContent = message;
}

function todayString() {
    return new Date().toISOString().slice(0, 10);
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


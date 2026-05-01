/**
 * fiscal-year.js - Global financial year filter state and helpers.
 */

import { parseDate } from './models.js';

let selectedFinancialYear = '';

export function setSelectedFinancialYear(value) {
    selectedFinancialYear = String(value || '').trim();
}

export function getSelectedFinancialYear() {
    return selectedFinancialYear;
}

export function getFinancialYearKeyFromDate(dateLike) {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const start = month >= 4 ? year : year - 1;
    return `${start}-${start + 1}`;
}

export function isDateInSelectedFinancialYear(dateStr) {
    if (!selectedFinancialYear) return true;
    const d = parseDate(dateStr || '');
    if (!d) return false;
    return getFinancialYearKeyFromDate(d) === selectedFinancialYear;
}

export function collectFinancialYears(transactions) {
    const years = new Set();
    (transactions || []).forEach((tx) => {
        const d = parseDate(tx.valueDate || '') || parseDate(tx.transactionDate || '');
        if (d) years.add(getFinancialYearKeyFromDate(d));
    });

    if (years.size === 0) {
        years.add(getFinancialYearKeyFromDate(new Date()));
    }

    return Array.from(years).sort((a, b) => (a < b ? 1 : -1));
}


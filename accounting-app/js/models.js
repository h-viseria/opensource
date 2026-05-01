/**
 * models.js — Constants and helper functions for the data model
 */

export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

export const NORMAL_BALANCE = {
    Asset:     'debit',
    Expense:   'debit',
    Liability: 'credit',
    Income:    'credit',
    Equity:    'credit',
};

/**
 * Map user-entered account category labels to canonical account types.
 * Returns one of ACCOUNT_TYPES or null if unknown.
 */
export function normalizeAccountTypeLabel(accountType) {
    if (!accountType) return null;

    // Canonical direct match
    if (ACCOUNT_TYPES.includes(accountType)) return accountType;

    const raw = String(accountType).trim().toLowerCase();
    if (!raw) return null;

    const canonical = raw
        .replace(/ies\b/g, 'y')
        .replace(/s\b/g, '')
        .trim();

    if (canonical.includes('asset') || canonical.includes('cash') || canonical.includes('bank')) {
        return 'Asset';
    }
    if (canonical.includes('credit')) return 'Liability';
    if (canonical.includes('liabilit')) return 'Liability';
    if (canonical.includes('equity')) return 'Equity';
    if (canonical.includes('income')) return 'Income';
    if (canonical.includes('expense')) return 'Expense';

    return null;
}

/**
 * Given an account type and a deposit/withdrawal amount as seen from the MAIN account side,
 * returns the signed effect on that account's balance.
 *
 * For Asset / Expense  → natural balance is Debit
 *   deposit  (money IN / Debit)   → +
 *   withdrawal (money OUT / Credit) → -
 *
 * For Liability / Income / Equity → natural balance is Credit
 *   deposit  (money IN / Debit)   → -
 *   withdrawal (money OUT / Credit) → +
 */
export function signedEffect(accountType, deposit, withdrawal) {
    const nb = resolveNormalBalance(accountType);
    if (nb === 'debit') {
        return deposit - withdrawal;
    }
    if (nb === 'credit') {
        return withdrawal - deposit;
    }

    // Safe fallback: treat unknown types as debit-oriented rather than inverting sign.
    return deposit - withdrawal;
}

/**
 * When a transaction is viewed from the TARGET account side,
 * the deposit/withdrawal are FLIPPED relative to the main account.
 *
 * deposit on main  → withdrawal on target
 * withdrawal on main → deposit on target
 */
export function signedEffectAsTarget(accountType, deposit, withdrawal) {
    return signedEffect(accountType, withdrawal, deposit);
}

export const MONTH_MAP = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12'
};

export const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Parse dd-mmm-yyyy to a Date object for sorting.
 */
export function parseDate(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.trim().split('-');
    if (parts.length !== 3) return null;
    const [dd, mmm, yyyy] = parts;
    const mm = MONTH_MAP[mmm.toLowerCase()];
    if (!mm) return null;
    return new Date(`${yyyy}-${mm}-${dd.padStart(2,'0')}`);
}

/**
 * Format a Date to dd-mmm-yyyy
 */
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const dd = String(d.getDate()).padStart(2,'0');
    const mmm = MONTH_ABBR[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${dd}-${mmm}-${yyyy}`;
}

export function toFloat(val) {
    if (val === null || val === undefined || val === '') return 0;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
}

export function formatCurrency(val) {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

function resolveNormalBalance(accountType) {
    const normalized = normalizeAccountTypeLabel(accountType);
    if (!normalized) return null;
    return NORMAL_BALANCE[normalized] || null;
}


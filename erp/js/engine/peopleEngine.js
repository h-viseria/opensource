/**
 * Pure helpers for attendance / leave day math (People Phase 1).
 */

import { toDateInput } from '../utils/date.js';

/**
 * @param {string} ymd YYYY-MM-DD
 * @returns {Date}
 */
export function parseYmd(ymd) {
  const [y, m, d] = String(ymd || '')
    .split('-')
    .map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * @param {Date} date
 */
export function formatYmd(date) {
  return toDateInput(date);
}

/**
 * @param {string} ymd
 * @param {number} deltaDays
 */
export function addDaysYmd(ymd, deltaDays) {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + deltaDays);
  return formatYmd(d);
}

/**
 * @param {{ workingDays?: number[], weeklyOffDays?: number[] }|null|undefined} settings
 * @returns {Set<number>}
 */
export function workingDaySet(settings) {
  const days = settings?.workingDays?.length
    ? settings.workingDays
    : [1, 2, 3, 4, 5];
  return new Set(days.map((n) => Number(n)));
}

/**
 * Count leave / working days between inclusive start and end using configured working days.
 * @param {string} startDate
 * @param {string} endDate
 * @param {{ workingDays?: number[] }|null|undefined} settings
 */
export function countWorkingDaysInRange(startDate, endDate, settings) {
  if (!startDate || !endDate) return 0;
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const work = workingDaySet(settings);
  let n = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (work.has(cur.getDay())) n += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

/**
 * List YYYY-MM-DD dates in inclusive range.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {string[]}
 */
export function eachDateInRange(startDate, endDate) {
  /** @type {string[]} */
  const out = [];
  if (!startDate || !endDate) return out;
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * First/last day of calendar month for a YYYY-MM or YYYY-MM-DD.
 * @param {string} monthOrDate
 */
export function monthBounds(monthOrDate) {
  const raw = String(monthOrDate || '').slice(0, 7);
  const [ys, ms] = raw.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) {
    const now = new Date();
    return monthBounds(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { year: y, month: m, startDate: formatYmd(start), endDate: formatYmd(end), daysInMonth: end.getDate() };
}

/**
 * Hours between HH:MM strings (same day). Returns null if invalid.
 * @param {string} checkIn
 * @param {string} checkOut
 */
export function hoursBetween(checkIn, checkOut) {
  const a = parseHm(checkIn);
  const b = parseHm(checkOut);
  if (a == null || b == null || b < a) return null;
  return Math.round(((b - a) / 60) * 100) / 100;
}

/**
 * @param {string} hm
 * @returns {number|null} minutes from midnight
 */
function parseHm(hm) {
  const m = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Overtime = max(0, actualHours - standardHours).
 * @param {number|null|undefined} actualHours
 * @param {number} standardHours
 */
export function computeOvertimeHours(actualHours, standardHours) {
  const actual = Number(actualHours);
  const std = Number(standardHours);
  if (!Number.isFinite(actual) || !Number.isFinite(std)) return 0;
  return Math.max(0, Math.round((actual - std) * 100) / 100);
}

/**
 * Document expiry badge.
 * @param {string|null|undefined} expiryDate
 * @param {number} [warnDays=30]
 * @param {string} [todayYmd]
 * @returns {'Expired'|'Expiring soon'|'Valid'|'—'}
 */
export function documentExpiryStatus(expiryDate, warnDays = 30, todayYmd = formatYmd(new Date())) {
  if (!expiryDate) return '—';
  const exp = parseYmd(expiryDate);
  const today = parseYmd(todayYmd);
  if (Number.isNaN(exp.getTime())) return '—';
  if (exp < today) return 'Expired';
  const limit = parseYmd(todayYmd);
  limit.setDate(limit.getDate() + Math.max(0, Number(warnDays) || 30));
  if (exp <= limit) return 'Expiring soon';
  return 'Valid';
}

/**
 * Suggest next EMP-#### code from existing codes.
 * @param {Array<{ employeeCode?: string }>} employees
 */
export function suggestEmployeeCode(employees) {
  let max = 0;
  for (const e of employees || []) {
    const m = String(e.employeeCode || '').trim().match(/^EMP-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP-${String(max + 1).padStart(4, '0')}`;
}

/**
 * Leave balance for one type in a calendar year (simple entitlement − used).
 * Accrual Monthly ≈ floor(monthsElapsed/12 * entitlement) when method is Monthly — keep simple: full annual for Annual/None.
 * @param {{ annualEntitlement?: number, accrualMethod?: string }} leaveType
 * @param {Array<{ leaveTypeId: string, days?: number, startDate?: string }>} leaveRecords
 * @param {string} leaveTypeId
 * @param {number} [year]
 */
export function leaveBalanceForType(leaveType, leaveRecords, leaveTypeId, year = new Date().getFullYear()) {
  const entitlement = Number(leaveType?.annualEntitlement) || 0;
  let used = 0;
  for (const r of leaveRecords || []) {
    if (r.leaveTypeId !== leaveTypeId) continue;
    const y = String(r.startDate || '').slice(0, 4);
    if (y && Number(y) !== year) continue;
    used += Number(r.days) || 0;
  }
  let entitled = entitlement;
  if (String(leaveType?.accrualMethod) === 'Monthly' && entitlement > 0) {
    const month = new Date().getMonth() + 1; // 1–12
    entitled = Math.round((entitlement * month) / 12 * 100) / 100;
  }
  const remaining = Math.round((entitled - used) * 100) / 100;
  return { entitlement: entitled, used: Math.round(used * 100) / 100, remaining };
}

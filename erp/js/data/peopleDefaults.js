/**
 * Default seeds for People module (attendance statuses, leave types, settings).
 * Country-agnostic — no PF / WPS / tax assumptions.
 */

/** @type {ReadonlyArray<{ name: string, shortCode: string, countsAsWorkingDay: boolean, paid: boolean, countsAsOvertime: boolean }>} */
export const DEFAULT_ATTENDANCE_STATUSES = Object.freeze([
  { name: 'Present', shortCode: 'P', countsAsWorkingDay: true, paid: true, countsAsOvertime: false },
  { name: 'Absent', shortCode: 'A', countsAsWorkingDay: false, paid: false, countsAsOvertime: false },
  { name: 'Half Day', shortCode: 'H', countsAsWorkingDay: true, paid: true, countsAsOvertime: false },
  { name: 'Leave', shortCode: 'L', countsAsWorkingDay: false, paid: true, countsAsOvertime: false },
  { name: 'Holiday', shortCode: 'O', countsAsWorkingDay: false, paid: true, countsAsOvertime: false },
  { name: 'Weekly Off', shortCode: 'W', countsAsWorkingDay: false, paid: true, countsAsOvertime: false },
]);

/** @type {ReadonlyArray<{ name: string, paid: boolean, annualEntitlement: number, accrualMethod: string, carryForward: boolean, encashable: boolean }>} */
export const DEFAULT_LEAVE_TYPES = Object.freeze([
  {
    name: 'Annual Leave',
    paid: true,
    annualEntitlement: 20,
    accrualMethod: 'Annual',
    carryForward: true,
    encashable: false,
  },
  {
    name: 'Sick Leave',
    paid: true,
    annualEntitlement: 10,
    accrualMethod: 'Annual',
    carryForward: false,
    encashable: false,
  },
  {
    name: 'Unpaid Leave',
    paid: false,
    annualEntitlement: 0,
    accrualMethod: 'None',
    carryForward: false,
    encashable: false,
  },
]);

/** Default document type labels (configurable later via attendance settings). */
export const DEFAULT_DOCUMENT_TYPES = Object.freeze([
  'Passport',
  'ID',
  'Contract',
  'Certificate',
  'Other',
]);

/**
 * Default attendance settings for a book.
 * Weekday numbers: 0=Sunday … 6=Saturday (JS Date.getDay()).
 * @param {string} bookId
 * @param {string} id
 * @param {string} at
 */
export function createDefaultAttendanceSettings(bookId, id, at) {
  return {
    id,
    bookId,
    workingDays: [1, 2, 3, 4, 5],
    weeklyOffDays: [0, 6],
    standardHours: 8,
    halfDayHours: 4,
    overtimeEnabled: true,
    checkInOutEnabled: false,
    documentTypes: [...DEFAULT_DOCUMENT_TYPES],
    expiryWarnDays: 30,
    createdAt: at,
    updatedAt: at,
  };
}

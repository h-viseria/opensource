/**
 * People module — employees, attendance, leave (Phase 1).
 * UI → this service → peopleEngine + repositories. No IDB in pages.
 */

import {
  EMPLOYMENT_STATUS,
  EMPLOYEE_FIELD_TYPES,
  EVENTS,
  LEAVE_ACCRUAL_METHODS,
} from '../core/constants.js';
import { emit } from '../core/eventBus.js';
import { uuid } from '../core/uuid.js';
import { nowIso, toDateInput } from '../utils/date.js';
import {
  DEFAULT_ATTENDANCE_STATUSES,
  DEFAULT_LEAVE_TYPES,
  createDefaultAttendanceSettings,
} from '../data/peopleDefaults.js';
import {
  addDaysYmd,
  computeOvertimeHours,
  countWorkingDaysInRange,
  documentExpiryStatus,
  eachDateInRange,
  hoursBetween,
  leaveBalanceForType,
  monthBounds,
  suggestEmployeeCode,
  workingDaySet,
} from '../engine/peopleEngine.js';
import {
  attendanceRecordRepository,
  attendanceSettingsRepository,
  attendanceStatusRepository,
  employeeCustomFieldRepository,
  employeeDocumentRepository,
  employeeRepository,
  leaveRecordRepository,
  leaveTypeRepository,
} from '../repositories/peopleRepositories.js';

function touch() {
  emit(EVENTS.PEOPLE_CHANGED, { at: nowIso() });
}

/**
 * Seed attendance settings, statuses, and leave types for a book (idempotent).
 * @param {string} bookId
 */
export async function ensurePeopleMasters(bookId) {
  if (!bookId) return;
  const at = nowIso();

  let settings = await attendanceSettingsRepository.findByBook(bookId);
  if (!settings) {
    settings = createDefaultAttendanceSettings(bookId, uuid(), at);
    await attendanceSettingsRepository.save(settings);
  }

  const statuses = await attendanceStatusRepository.findByBook(bookId);
  if (!statuses.length) {
    let order = 0;
    for (const s of DEFAULT_ATTENDANCE_STATUSES) {
      await attendanceStatusRepository.save({
        id: uuid(),
        bookId,
        ...s,
        isSystem: true,
        isActive: true,
        sortOrder: order++,
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  const leaveTypes = await leaveTypeRepository.findByBook(bookId);
  if (!leaveTypes.length) {
    for (const lt of DEFAULT_LEAVE_TYPES) {
      await leaveTypeRepository.save({
        id: uuid(),
        bookId,
        ...lt,
        isSystem: true,
        isActive: true,
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  // Do not call getAttendanceSettings here — it calls ensurePeopleMasters (infinite loop).
  return settings;
}

/**
 * @param {string} bookId
 */
export async function purgePeople(bookId) {
  await Promise.all([
    employeeRepository.deleteByBook(bookId),
    employeeCustomFieldRepository.deleteByBook(bookId),
    employeeDocumentRepository.deleteByBook(bookId),
    attendanceStatusRepository.deleteByBook(bookId),
    attendanceRecordRepository.deleteByBook(bookId),
    attendanceSettingsRepository.deleteByBook(bookId),
    leaveTypeRepository.deleteByBook(bookId),
    leaveRecordRepository.deleteByBook(bookId),
  ]);
  touch();
}

/* ─── Attendance settings ─── */

/** @param {string} bookId */
export async function getAttendanceSettings(bookId) {
  await ensurePeopleMasters(bookId);
  return attendanceSettingsRepository.findByBook(bookId);
}

/**
 * @param {string} bookId
 * @param {Partial<object>} patch
 */
export async function updateAttendanceSettings(bookId, patch) {
  const current = await getAttendanceSettings(bookId);
  if (!current) throw new Error('Attendance settings not found');
  const next = {
    ...current,
    ...patch,
    bookId,
    id: current.id,
    updatedAt: nowIso(),
  };
  if (Array.isArray(patch.workingDays)) {
    next.workingDays = [...new Set(patch.workingDays.map(Number))].sort((a, b) => a - b);
  }
  if (Array.isArray(patch.weeklyOffDays)) {
    next.weeklyOffDays = [...new Set(patch.weeklyOffDays.map(Number))].sort((a, b) => a - b);
  }
  await attendanceSettingsRepository.save(next);
  touch();
  return next;
}

/* ─── Employees ─── */

/** @param {string} bookId */
export async function listEmployees(bookId, { includeInactive = true } = {}) {
  const rows = await employeeRepository.findByBook(bookId);
  const filtered = includeInactive
    ? rows
    : rows.filter((e) => e.status === EMPLOYMENT_STATUS.ACTIVE);
  return filtered.sort((a, b) =>
    String(a.employeeCode || a.name).localeCompare(String(b.employeeCode || b.name)),
  );
}

/** @param {string} id */
export async function getEmployee(id) {
  return employeeRepository.findById(id);
}

/**
 * @param {string} bookId
 * @param {object} input
 */
export async function createEmployee(bookId, input) {
  await ensurePeopleMasters(bookId);
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Employee name is required');
  const joiningDate = String(input.joiningDate || toDateInput(new Date())).slice(0, 10);
  if (!joiningDate) throw new Error('Joining date is required');

  const existing = await listEmployees(bookId, { includeInactive: true });
  let employeeCode = String(input.employeeCode || '').trim().toUpperCase();
  if (!employeeCode) employeeCode = suggestEmployeeCode(existing);
  const clash = existing.find(
    (e) => String(e.employeeCode).toUpperCase() === employeeCode.toUpperCase(),
  );
  if (clash) throw new Error(`Employee ID “${employeeCode}” is already in use`);

  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    employeeCode,
    name,
    joiningDate,
    status: input.status === EMPLOYMENT_STATUS.INACTIVE ? EMPLOYMENT_STATUS.INACTIVE : EMPLOYMENT_STATUS.ACTIVE,
    mobile: String(input.mobile || '').trim() || null,
    email: String(input.email || '').trim() || null,
    address: String(input.address || '').trim() || null,
    dateOfBirth: input.dateOfBirth || null,
    gender: String(input.gender || '').trim() || null,
    designation: String(input.designation || '').trim() || null,
    department: String(input.department || '').trim() || null,
    employmentType: String(input.employmentType || '').trim() || null,
    notes: String(input.notes || '').trim() || null,
    customValues: sanitizeCustomValues(input.customValues),
    createdAt: at,
    updatedAt: at,
  };
  await validateCustomValues(bookId, row.customValues, true);
  await employeeRepository.save(row);
  touch();
  return row;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateEmployee(id, patch) {
  const current = await employeeRepository.findById(id);
  if (!current) throw new Error('Employee not found');

  if (patch.employeeCode != null) {
    const code = String(patch.employeeCode).trim().toUpperCase();
    if (!code) throw new Error('Employee ID is required');
    const others = await listEmployees(current.bookId, { includeInactive: true });
    const clash = others.find(
      (e) => e.id !== id && String(e.employeeCode).toUpperCase() === code,
    );
    if (clash) throw new Error(`Employee ID “${code}” is already in use`);
    patch.employeeCode = code;
  }
  if (patch.name != null && !String(patch.name).trim()) {
    throw new Error('Employee name is required');
  }
  if (patch.customValues != null) {
    patch.customValues = sanitizeCustomValues(patch.customValues);
    await validateCustomValues(current.bookId, patch.customValues, false);
  }

  const next = {
    ...current,
    ...patch,
    id: current.id,
    bookId: current.bookId,
    updatedAt: nowIso(),
  };
  await employeeRepository.save(next);
  touch();
  return next;
}

/** @param {string} id */
export async function deactivateEmployee(id) {
  return updateEmployee(id, { status: EMPLOYMENT_STATUS.INACTIVE });
}

/** @param {string} id */
export async function activateEmployee(id) {
  return updateEmployee(id, { status: EMPLOYMENT_STATUS.ACTIVE });
}

/**
 * Soft-delete only when no attendance / leave / documents.
 * @param {string} id
 */
export async function deleteEmployeeIfUnused(id) {
  const emp = await employeeRepository.findById(id);
  if (!emp) throw new Error('Employee not found');
  const [att, leave, docs] = await Promise.all([
    attendanceRecordRepository.findByIndex('employeeId', id),
    leaveRecordRepository.findByEmployee(id),
    employeeDocumentRepository.findByEmployee(id),
  ]);
  if (att.length || leave.length || docs.length) {
    throw new Error(
      'Cannot permanently delete this employee — attendance, leave, or documents exist. Deactivate instead.',
    );
  }
  await employeeRepository.delete(id);
  touch();
}

/* ─── Custom fields ─── */

/** @param {string} bookId */
export async function listCustomFields(bookId, { activeOnly = false } = {}) {
  let rows = await employeeCustomFieldRepository.findByBook(bookId);
  if (activeOnly) rows = rows.filter((f) => f.isActive !== false);
  return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

/**
 * @param {string} bookId
 * @param {object} input
 */
export async function createCustomField(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Field name is required');
  const fieldType = String(input.fieldType || 'Text');
  if (!EMPLOYEE_FIELD_TYPES.includes(fieldType)) {
    throw new Error(`Unsupported field type: ${fieldType}`);
  }
  const existing = await listCustomFields(bookId);
  if (existing.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Field “${name}” already exists`);
  }
  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    fieldType,
    required: !!input.required,
    defaultValue: input.defaultValue ?? null,
    isActive: input.isActive !== false,
    sortOrder: existing.length,
    createdAt: at,
    updatedAt: at,
  };
  await employeeCustomFieldRepository.save(row);
  touch();
  return row;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateCustomField(id, patch) {
  const current = await employeeCustomFieldRepository.findById(id);
  if (!current) throw new Error('Custom field not found');
  if (patch.fieldType && !EMPLOYEE_FIELD_TYPES.includes(patch.fieldType)) {
    throw new Error(`Unsupported field type: ${patch.fieldType}`);
  }
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('Field name is required');
    const others = await listCustomFields(current.bookId);
    if (others.some((f) => f.id !== id && f.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Field “${name}” already exists`);
    }
    patch.name = name;
  }
  const next = { ...current, ...patch, id: current.id, bookId: current.bookId, updatedAt: nowIso() };
  await employeeCustomFieldRepository.save(next);
  touch();
  return next;
}

/** @param {string} id */
export async function deleteCustomField(id) {
  await employeeCustomFieldRepository.delete(id);
  touch();
}

/**
 * @param {unknown} values
 */
function sanitizeCustomValues(values) {
  if (!values || typeof values !== 'object') return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    out[String(k)] = v;
  }
  return out;
}

/**
 * @param {string} bookId
 * @param {Record<string, unknown>} values
 * @param {boolean} enforceRequired
 */
async function validateCustomValues(bookId, values, enforceRequired) {
  const fields = await listCustomFields(bookId, { activeOnly: true });
  for (const f of fields) {
    const raw = values?.[f.id];
    const empty =
      raw == null ||
      raw === '' ||
      (f.fieldType === 'Checkbox' && raw !== true && raw !== false && raw !== 'true' && raw !== 'false');
    if (enforceRequired && f.required && (empty || (f.fieldType === 'Checkbox' && raw !== true && raw !== 'true'))) {
      if (f.fieldType === 'Checkbox') {
        /* checkbox required means must be checked — optional unless required */
        if (raw !== true && raw !== 'true') throw new Error(`“${f.name}” is required`);
      } else if (empty) {
        throw new Error(`“${f.name}” is required`);
      }
    }
    if (raw == null || raw === '') continue;
    if (f.fieldType === 'Number' || f.fieldType === 'Currency') {
      if (!Number.isFinite(Number(raw))) throw new Error(`“${f.name}” must be a number`);
    }
    if (f.fieldType === 'Date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) throw new Error(`“${f.name}” must be a date`);
    }
  }
}

/* ─── Documents ─── */

/** @param {string} employeeId */
export async function listEmployeeDocuments(employeeId) {
  const rows = await employeeDocumentRepository.findByEmployee(employeeId);
  return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

/**
 * @param {string} bookId
 * @param {string} employeeId
 * @param {object} input
 */
export async function addEmployeeDocument(bookId, employeeId, input) {
  const emp = await employeeRepository.findById(employeeId);
  if (!emp || emp.bookId !== bookId) throw new Error('Employee not found');
  const name = String(input.name || input.fileName || 'Document').trim();
  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    employeeId,
    name,
    documentType: String(input.documentType || 'Other').trim() || 'Other',
    issueDate: input.issueDate || null,
    expiryDate: input.expiryDate || null,
    notes: String(input.notes || '').trim() || null,
    fileName: input.fileName || null,
    mimeType: input.mimeType || null,
    sizeBytes: input.sizeBytes ?? null,
    dataUrl: input.dataUrl || null,
    createdAt: at,
    updatedAt: at,
  };
  await employeeDocumentRepository.save(row);
  touch();
  return row;
}

/** @param {string} id */
export async function deleteEmployeeDocument(id) {
  await employeeDocumentRepository.delete(id);
  touch();
}

/**
 * @param {object} doc
 * @param {object} [settings]
 */
export function getDocumentExpiryBadge(doc, settings) {
  return documentExpiryStatus(doc?.expiryDate, settings?.expiryWarnDays ?? 30);
}

/* ─── Attendance statuses ─── */

/** @param {string} bookId */
export async function listAttendanceStatuses(bookId, { activeOnly = false } = {}) {
  await ensurePeopleMasters(bookId);
  let rows = await attendanceStatusRepository.findByBook(bookId);
  if (activeOnly) rows = rows.filter((s) => s.isActive !== false);
  return rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

/**
 * @param {string} bookId
 * @param {object} input
 */
export async function createAttendanceStatus(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Status name is required');
  const shortCode = String(input.shortCode || name.slice(0, 1)).trim().toUpperCase().slice(0, 3);
  const existing = await listAttendanceStatuses(bookId);
  if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Status “${name}” already exists`);
  }
  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    shortCode: shortCode || 'X',
    countsAsWorkingDay: !!input.countsAsWorkingDay,
    paid: input.paid !== false,
    countsAsOvertime: !!input.countsAsOvertime,
    isSystem: false,
    isActive: input.isActive !== false,
    sortOrder: existing.length,
    createdAt: at,
    updatedAt: at,
  };
  await attendanceStatusRepository.save(row);
  touch();
  return row;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateAttendanceStatus(id, patch) {
  const current = await attendanceStatusRepository.findById(id);
  if (!current) throw new Error('Attendance status not found');
  const next = { ...current, ...patch, id: current.id, bookId: current.bookId, updatedAt: nowIso() };
  await attendanceStatusRepository.save(next);
  touch();
  return next;
}

/* ─── Attendance records ─── */

/**
 * @param {string} bookId
 * @param {string} date
 */
export async function getDailyAttendance(bookId, date) {
  await ensurePeopleMasters(bookId);
  const [employees, statuses, records, settings] = await Promise.all([
    listEmployees(bookId, { includeInactive: false }),
    listAttendanceStatuses(bookId, { activeOnly: true }),
    attendanceRecordRepository.findByBookAndDate(bookId, date),
    getAttendanceSettings(bookId),
  ]);
  const byEmp = new Map(records.map((r) => [r.employeeId, r]));
  const defaultStatus = pickDefaultStatusForDate(statuses, settings, date);
  return {
    date,
    settings,
    statuses,
    rows: employees.map((emp) => ({
      employee: emp,
      record: byEmp.get(emp.id) || null,
      suggestedStatusId: defaultStatus?.id || null,
    })),
  };
}

/**
 * @param {object[]} statuses
 * @param {object} settings
 * @param {string} date
 */
function pickDefaultStatusForDate(statuses, settings, date) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay();
  const offs = new Set((settings?.weeklyOffDays || []).map(Number));
  const work = workingDaySet(settings);
  if (offs.has(day) || !work.has(day)) {
    return statuses.find((s) => /weekly\s*off/i.test(s.name)) || statuses.find((s) => s.shortCode === 'W');
  }
  return statuses.find((s) => /present/i.test(s.name)) || statuses.find((s) => s.shortCode === 'P');
}

/**
 * Upsert one attendance cell.
 * @param {string} bookId
 * @param {{ employeeId: string, date: string, statusId: string, leaveTypeId?: string|null, checkIn?: string|null, checkOut?: string|null, overtimeHours?: number|null, notes?: string|null }} input
 */
export async function setAttendance(bookId, input) {
  await ensurePeopleMasters(bookId);
  const employeeId = input.employeeId;
  const date = String(input.date || '').slice(0, 10);
  const statusId = input.statusId;
  if (!employeeId || !date || !statusId) throw new Error('Employee, date, and status are required');

  const emp = await employeeRepository.findById(employeeId);
  if (!emp || emp.bookId !== bookId) throw new Error('Employee not found');
  if (emp.status !== EMPLOYMENT_STATUS.ACTIVE) {
    throw new Error('Cannot mark attendance for an inactive employee');
  }

  const status = await attendanceStatusRepository.findById(statusId);
  if (!status || status.bookId !== bookId) throw new Error('Attendance status not found');

  const settings = await getAttendanceSettings(bookId);
  let leaveTypeId = input.leaveTypeId || null;
  let leaveRecordId = null;

  if (/^leave$/i.test(status.name) || status.shortCode === 'L') {
    if (!leaveTypeId) {
      const types = await listLeaveTypes(bookId, { activeOnly: true });
      leaveTypeId = types[0]?.id || null;
    }
    if (!leaveTypeId) throw new Error('Select a leave type for Leave status');
    leaveRecordId = await upsertLeaveForAttendanceDay(bookId, employeeId, date, leaveTypeId);
  }

  let actualHours = null;
  let overtimeHours = Number(input.overtimeHours);
  if (!Number.isFinite(overtimeHours)) overtimeHours = null;

  if (settings?.checkInOutEnabled && input.checkIn && input.checkOut) {
    actualHours = hoursBetween(input.checkIn, input.checkOut);
    if (settings.overtimeEnabled && actualHours != null && overtimeHours == null) {
      overtimeHours = computeOvertimeHours(actualHours, settings.standardHours ?? 8);
    }
  }

  const existing = await attendanceRecordRepository.findByEmployeeAndDate(bookId, employeeId, date);
  const at = nowIso();
  const row = {
    id: existing?.id || uuid(),
    bookId,
    employeeId,
    date,
    statusId,
    leaveTypeId,
    leaveRecordId,
    checkIn: input.checkIn || null,
    checkOut: input.checkOut || null,
    normalHours: settings?.standardHours ?? 8,
    actualHours,
    overtimeHours: settings?.overtimeEnabled === false ? 0 : overtimeHours,
    notes: input.notes != null ? String(input.notes) : existing?.notes || null,
    createdAt: existing?.createdAt || at,
    updatedAt: at,
  };
  await attendanceRecordRepository.save(row);
  touch();
  return row;
}

/**
 * @param {string} bookId
 * @param {string} employeeId
 * @param {string} date
 * @param {string} leaveTypeId
 */
async function upsertLeaveForAttendanceDay(bookId, employeeId, date, leaveTypeId) {
  const existingLeaves = await leaveRecordRepository.findByEmployee(employeeId);
  const hit = existingLeaves.find(
    (r) =>
      r.leaveTypeId === leaveTypeId &&
      r.startDate <= date &&
      r.endDate >= date &&
      r.attendanceLinked,
  );
  if (hit) return hit.id;

  const single = existingLeaves.find(
    (r) => r.startDate === date && r.endDate === date && r.leaveTypeId === leaveTypeId,
  );
  if (single) return single.id;

  const created = await createLeaveRecord(bookId, {
    employeeId,
    leaveTypeId,
    startDate: date,
    endDate: date,
    notes: 'From attendance',
    attendanceLinked: true,
  });
  return created.id;
}

/**
 * Monthly grid data.
 * @param {string} bookId
 * @param {string} month YYYY-MM
 */
export async function getMonthlyAttendance(bookId, month) {
  await ensurePeopleMasters(bookId);
  const bounds = monthBounds(month);
  const [employees, statuses, allRecords, settings, leaveTypes] = await Promise.all([
    listEmployees(bookId, { includeInactive: true }),
    listAttendanceStatuses(bookId, { activeOnly: false }),
    attendanceRecordRepository.findByBook(bookId),
    getAttendanceSettings(bookId),
    listLeaveTypes(bookId),
  ]);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const inMonth = allRecords.filter(
    (r) => r.date >= bounds.startDate && r.date <= bounds.endDate,
  );
  /** @type {Map<string, Map<string, object>>} */
  const grid = new Map();
  for (const r of inMonth) {
    if (!grid.has(r.employeeId)) grid.set(r.employeeId, new Map());
    grid.get(r.employeeId).set(r.date, r);
  }

  const dayCols = [];
  for (let d = 1; d <= bounds.daysInMonth; d++) {
    dayCols.push(
      `${bounds.year}-${String(bounds.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }

  const rows = employees
    .filter((e) => e.status === EMPLOYMENT_STATUS.ACTIVE || grid.has(e.id))
    .map((emp) => {
      const cells = dayCols.map((date) => {
        const rec = grid.get(emp.id)?.get(date) || null;
        const st = rec ? statusById.get(rec.statusId) : null;
        return { date, record: rec, status: st || null, code: st?.shortCode || '' };
      });
      const totals = summarizeCells(cells, statusById, settings);
      return { employee: emp, cells, totals };
    });

  return { bounds, dayCols, statuses, settings, leaveTypes, rows };
}

/**
 * @param {Array<{ record: object|null, status: object|null }>} cells
 * @param {Map<string, object>} statusById
 * @param {object} settings
 */
function summarizeCells(cells, statusById, settings) {
  const work = workingDaySet(settings);
  let present = 0;
  let absent = 0;
  let halfDay = 0;
  let leave = 0;
  let holiday = 0;
  let weeklyOff = 0;
  let workingDays = 0;
  let overtimeHours = 0;

  for (const c of cells) {
    const day = new Date(`${c.date}T12:00:00`).getDay();
    if (work.has(day)) workingDays += 1;
    const st = c.status;
    const ot = Number(c.record?.overtimeHours);
    if (Number.isFinite(ot)) overtimeHours += ot;
    if (!st) continue;
    const n = st.name.toLowerCase();
    if (n.includes('present')) present += 1;
    else if (n.includes('absent')) absent += 1;
    else if (n.includes('half')) halfDay += 1;
    else if (n.includes('leave')) leave += 1;
    else if (n.includes('holiday')) holiday += 1;
    else if (n.includes('weekly') || n.includes('off')) weeklyOff += 1;
  }

  return {
    present,
    absent,
    halfDay,
    leave,
    holiday,
    weeklyOff,
    workingDays,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
  };
}

/**
 * Monthly summary table for all employees.
 * @param {string} bookId
 * @param {string} month
 */
export async function getAttendanceSummary(bookId, month) {
  const monthly = await getMonthlyAttendance(bookId, month);
  const leaveTypes = await listLeaveTypes(bookId);
  const paidLeaveIds = new Set(leaveTypes.filter((t) => t.paid).map((t) => t.id));
  const unpaidLeaveIds = new Set(leaveTypes.filter((t) => !t.paid).map((t) => t.id));

  const rows = monthly.rows.map((r) => {
    let paidLeave = 0;
    let unpaidLeave = 0;
    for (const c of r.cells) {
      if (!c.record?.leaveTypeId) {
        if (c.status && /leave/i.test(c.status.name)) {
          if (c.status.paid) paidLeave += 1;
          else unpaidLeave += 1;
        }
        continue;
      }
      if (paidLeaveIds.has(c.record.leaveTypeId)) paidLeave += 1;
      else if (unpaidLeaveIds.has(c.record.leaveTypeId)) unpaidLeave += 1;
    }
    return {
      employee: r.employee,
      ...r.totals,
      paidLeave,
      unpaidLeave,
    };
  });

  return { ...monthly.bounds, month: `${monthly.bounds.year}-${String(monthly.bounds.month).padStart(2, '0')}`, rows };
}

/**
 * Profile attendance stats for an employee (current month).
 * @param {string} bookId
 * @param {string} employeeId
 * @param {string} [month]
 */
export async function getEmployeeAttendanceSummary(bookId, employeeId, month) {
  const m = month || toDateInput(new Date()).slice(0, 7);
  const summary = await getAttendanceSummary(bookId, m);
  return summary.rows.find((r) => r.employee.id === employeeId) || null;
}

/* ─── Leave types & records ─── */

/** @param {string} bookId */
export async function listLeaveTypes(bookId, { activeOnly = false } = {}) {
  await ensurePeopleMasters(bookId);
  let rows = await leaveTypeRepository.findByBook(bookId);
  if (activeOnly) rows = rows.filter((t) => t.isActive !== false);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {string} bookId
 * @param {object} input
 */
export async function createLeaveType(bookId, input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Leave type name is required');
  const existing = await listLeaveTypes(bookId);
  if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Leave type “${name}” already exists`);
  }
  const accrual = String(input.accrualMethod || LEAVE_ACCRUAL_METHODS.NONE);
  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    name,
    paid: input.paid !== false,
    annualEntitlement: Number(input.annualEntitlement) || 0,
    accrualMethod: Object.values(LEAVE_ACCRUAL_METHODS).includes(accrual)
      ? accrual
      : LEAVE_ACCRUAL_METHODS.NONE,
    carryForward: !!input.carryForward,
    encashable: !!input.encashable,
    isSystem: false,
    isActive: input.isActive !== false,
    createdAt: at,
    updatedAt: at,
  };
  await leaveTypeRepository.save(row);
  touch();
  return row;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateLeaveType(id, patch) {
  const current = await leaveTypeRepository.findById(id);
  if (!current) throw new Error('Leave type not found');
  const next = { ...current, ...patch, id: current.id, bookId: current.bookId, updatedAt: nowIso() };
  await leaveTypeRepository.save(next);
  touch();
  return next;
}

/** @param {string} bookId */
export async function listLeaveRecords(bookId, { employeeId } = {}) {
  let rows = await leaveRecordRepository.findByBook(bookId);
  if (employeeId) rows = rows.filter((r) => r.employeeId === employeeId);
  return rows.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
}

/**
 * @param {string} bookId
 * @param {object} input
 */
export async function createLeaveRecord(bookId, input) {
  await ensurePeopleMasters(bookId);
  const employeeId = input.employeeId;
  const leaveTypeId = input.leaveTypeId;
  const startDate = String(input.startDate || '').slice(0, 10);
  const endDate = String(input.endDate || startDate).slice(0, 10);
  if (!employeeId || !leaveTypeId || !startDate || !endDate) {
    throw new Error('Employee, leave type, and dates are required');
  }
  if (endDate < startDate) throw new Error('End date must be on or after start date');

  const emp = await employeeRepository.findById(employeeId);
  if (!emp || emp.bookId !== bookId) throw new Error('Employee not found');
  const leaveType = await leaveTypeRepository.findById(leaveTypeId);
  if (!leaveType || leaveType.bookId !== bookId) throw new Error('Leave type not found');

  const settings = await getAttendanceSettings(bookId);
  let days =
    input.days != null && input.days !== ''
      ? Number(input.days)
      : countWorkingDaysInRange(startDate, endDate, settings);
  if (!Number.isFinite(days) || days < 0) throw new Error('Invalid leave days');

  const at = nowIso();
  const row = {
    id: uuid(),
    bookId,
    employeeId,
    leaveTypeId,
    startDate,
    endDate,
    days,
    notes: String(input.notes || '').trim() || null,
    attendanceLinked: !!input.attendanceLinked,
    createdAt: at,
    updatedAt: at,
  };
  await leaveRecordRepository.save(row);

  // Reflect leave on attendance for working days in range
  const statuses = await listAttendanceStatuses(bookId, { activeOnly: true });
  const leaveStatus =
    statuses.find((s) => /^leave$/i.test(s.name)) || statuses.find((s) => s.shortCode === 'L');
  if (leaveStatus) {
    for (const date of eachDateInRange(startDate, endDate)) {
      const day = new Date(`${date}T12:00:00`).getDay();
      if (!workingDaySet(settings).has(day)) continue;
      const existing = await attendanceRecordRepository.findByEmployeeAndDate(bookId, employeeId, date);
      const rec = {
        id: existing?.id || uuid(),
        bookId,
        employeeId,
        date,
        statusId: leaveStatus.id,
        leaveTypeId,
        leaveRecordId: row.id,
        checkIn: existing?.checkIn || null,
        checkOut: existing?.checkOut || null,
        normalHours: settings?.standardHours ?? 8,
        actualHours: existing?.actualHours ?? null,
        overtimeHours: existing?.overtimeHours ?? null,
        notes: existing?.notes || row.notes,
        createdAt: existing?.createdAt || at,
        updatedAt: at,
      };
      await attendanceRecordRepository.save(rec);
    }
  }

  touch();
  return row;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateLeaveRecord(id, patch) {
  const current = await leaveRecordRepository.findById(id);
  if (!current) throw new Error('Leave record not found');
  const settings = await getAttendanceSettings(current.bookId);
  const startDate = patch.startDate != null ? String(patch.startDate).slice(0, 10) : current.startDate;
  const endDate = patch.endDate != null ? String(patch.endDate).slice(0, 10) : current.endDate;
  if (endDate < startDate) throw new Error('End date must be on or after start date');
  let days = patch.days != null ? Number(patch.days) : countWorkingDaysInRange(startDate, endDate, settings);
  const next = {
    ...current,
    ...patch,
    startDate,
    endDate,
    days,
    id: current.id,
    bookId: current.bookId,
    updatedAt: nowIso(),
  };
  await leaveRecordRepository.save(next);
  touch();
  return next;
}

/** @param {string} id */
export async function deleteLeaveRecord(id) {
  await leaveRecordRepository.delete(id);
  touch();
}

/**
 * @param {string} bookId
 * @param {string} employeeId
 */
export async function getEmployeeLeaveBalances(bookId, employeeId) {
  const [types, records] = await Promise.all([
    listLeaveTypes(bookId, { activeOnly: true }),
    listLeaveRecords(bookId, { employeeId }),
  ]);
  return types.map((t) => ({
    leaveType: t,
    ...leaveBalanceForType(t, records, t.id),
  }));
}

/**
 * Hub stats.
 * @param {string} bookId
 */
export async function getPeopleHubStats(bookId) {
  await ensurePeopleMasters(bookId);
  const [employees, leaveTypes, statuses] = await Promise.all([
    listEmployees(bookId, { includeInactive: true }),
    listLeaveTypes(bookId),
    listAttendanceStatuses(bookId),
  ]);
  return {
    employees: employees.length,
    activeEmployees: employees.filter((e) => e.status === EMPLOYMENT_STATUS.ACTIVE).length,
    leaveTypes: leaveTypes.length,
    attendanceStatuses: statuses.length,
  };
}

export { addDaysYmd, countWorkingDaysInRange, suggestEmployeeCode };

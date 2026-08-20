/**
 * Pure payroll calculation helpers (Phase 2).
 */

import {
  DAILY_RATE_METHODS,
  HOURLY_RATE_METHODS,
  SALARY_CALC_BASIS,
  SALARY_CALC_TYPES,
  SALARY_HEAD_TYPES,
} from '../core/constants.js';
import { roundMoney } from '../utils/money.js';
import { monthBounds, workingDaySet } from './peopleEngine.js';

/**
 * Resolve salary lines effective on asOfDate (latest effectiveFrom <= asOf).
 * @param {object[]} lines
 * @param {string} asOfDate YYYY-MM-DD
 */
export function resolveEffectiveSalaryLines(lines, asOfDate) {
  /** @type {Map<string, object>} */
  const best = new Map();
  for (const line of lines || []) {
    if (line.effectiveFrom && line.effectiveFrom > asOfDate) continue;
    if (line.effectiveTo && line.effectiveTo < asOfDate) continue;
    const prev = best.get(line.salaryHeadId);
    if (!prev || String(line.effectiveFrom) > String(prev.effectiveFrom)) {
      best.set(line.salaryHeadId, line);
    }
  }
  return [...best.values()];
}

/**
 * Monthly fixed package (sum of fixed earning amounts on structure) used as "monthly salary" for rates.
 * @param {object[]} effectiveLines
 * @param {Map<string, object>} headsById
 */
export function monthlyPackageFromLines(effectiveLines, headsById) {
  let total = 0;
  for (const line of effectiveLines) {
    const head = headsById.get(line.salaryHeadId);
    if (!head || head.headType !== SALARY_HEAD_TYPES.EARNING) continue;
    if (head.calcType === SALARY_CALC_TYPES.FIXED || head.isBasic) {
      total += Number(line.amount != null ? line.amount : head.amount) || 0;
    }
  }
  return roundMoney(total);
}

/**
 * @param {number} monthlySalary
 * @param {object} ctx
 * @param {object} settings
 */
export function computeDailyRate(monthlySalary, ctx, settings) {
  const method = settings?.dailyRateMethod || DAILY_RATE_METHODS.WORKING;
  if (method === DAILY_RATE_METHODS.CALENDAR) {
    const days = Math.max(1, ctx.calendarDays || 30);
    return roundMoney(monthlySalary / days);
  }
  if (method === DAILY_RATE_METHODS.CUSTOM && Number(settings.customDailyDivisor) > 0) {
    return roundMoney(monthlySalary / Number(settings.customDailyDivisor));
  }
  const days = Math.max(1, ctx.workingDays || 22);
  return roundMoney(monthlySalary / days);
}

/**
 * @param {number} monthlySalary
 * @param {number} dailyRate
 * @param {object} ctx
 * @param {object} settings
 */
export function computeHourlyRate(monthlySalary, dailyRate, ctx, settings) {
  const method = settings?.hourlyRateMethod || HOURLY_RATE_METHODS.DAILY_HOURS;
  if (method === HOURLY_RATE_METHODS.MONTHLY_HOURS) {
    const hrs = Math.max(1, Number(settings.standardMonthHours) || 176);
    return roundMoney(monthlySalary / hrs);
  }
  if (method === HOURLY_RATE_METHODS.CUSTOM && Number(settings.customHourlyDivisor) > 0) {
    return roundMoney(monthlySalary / Number(settings.customHourlyDivisor));
  }
  const dayHrs = Math.max(1, Number(ctx.standardHours) || Number(settings.standardDayHours) || 8);
  return roundMoney(dailyRate / dayHrs);
}

/**
 * Evaluate one salary head for an employee in a period.
 * Pass 1: fixed / manual / hours / attendance (needs rates).
 * Pass 2: percentage / formula based on earnings so far.
 *
 * @param {object} head
 * @param {object|null} line employee salary line override
 * @param {object} ctx attendance + rates + amounts map
 * @param {'base'|'dependent'} pass
 */
export function evaluateSalaryHead(head, line, ctx, pass = 'base') {
  const calcType = line?.calcType || head.calcType;
  const calcBasis = line?.calcBasis || head.calcBasis;
  const amount = line?.amount != null ? Number(line.amount) : Number(head.amount) || 0;
  const percentage = line?.percentage != null ? Number(line.percentage) : Number(head.percentage) || 0;
  const multiplier =
    line?.multiplier != null
      ? Number(line.multiplier)
      : Number(head.multiplier) != null && !Number.isNaN(Number(head.multiplier))
        ? Number(head.multiplier)
        : 1;
  const basisHeadId = line?.basisSalaryHeadId || head.basisSalaryHeadId || null;
  const manualValue = ctx.manualValues?.[head.id];

  if (pass === 'base') {
    if (calcType === SALARY_CALC_TYPES.PERCENTAGE || calcType === SALARY_CALC_TYPES.FORMULA) {
      return null; // defer
    }
    if (calcType === SALARY_CALC_TYPES.MANUAL) {
      const v = manualValue != null ? Number(manualValue) : amount;
      return roundMoney(Number.isFinite(v) ? v : 0);
    }
    if (calcType === SALARY_CALC_TYPES.FIXED) {
      return roundMoney(amount);
    }
    if (calcType === SALARY_CALC_TYPES.ATTENDANCE) {
      const days = resolveBasisQuantity(calcBasis, ctx, basisHeadId);
      return roundMoney((ctx.dailyRate || 0) * days * multiplier);
    }
    if (calcType === SALARY_CALC_TYPES.HOURS) {
      const hours = resolveBasisQuantity(calcBasis, ctx, basisHeadId);
      return roundMoney((ctx.hourlyRate || 0) * hours * multiplier);
    }
    return roundMoney(amount);
  }

  // dependent pass
  if (calcType === SALARY_CALC_TYPES.PERCENTAGE || calcType === SALARY_CALC_TYPES.FORMULA) {
    const base = resolveBasisAmount(calcBasis, ctx, basisHeadId);
    return roundMoney((base * percentage) / 100);
  }
  return null;
}

/**
 * @param {string} calcBasis
 * @param {object} ctx
 * @param {string|null} basisHeadId
 */
function resolveBasisQuantity(calcBasis, ctx, basisHeadId) {
  switch (calcBasis) {
    case SALARY_CALC_BASIS.ATTENDANCE_DAYS:
      return Number(ctx.presentDays) || 0;
    case SALARY_CALC_BASIS.LEAVE_DAYS:
      return Number(ctx.leaveDays) || 0;
    case SALARY_CALC_BASIS.UNPAID_LEAVE_DAYS:
      return Number(ctx.unpaidLeaveDays) || 0;
    case SALARY_CALC_BASIS.OVERTIME_HOURS:
      return Number(ctx.overtimeHours) || 0;
    case SALARY_CALC_BASIS.MANUAL:
      return Number(ctx.manualQuantity) || 0;
    default:
      if (calcBasis === SALARY_CALC_BASIS.OVERTIME_HOURS || !calcBasis) {
        return Number(ctx.overtimeHours) || 0;
      }
      return Number(ctx.unpaidLeaveDays) || 0;
  }
}

/**
 * @param {string} calcBasis
 * @param {object} ctx
 * @param {string|null} basisHeadId
 */
function resolveBasisAmount(calcBasis, ctx, basisHeadId) {
  const byHead = ctx.amountsByHeadId || {};
  switch (calcBasis) {
    case SALARY_CALC_BASIS.BASIC:
      return Number(ctx.basicAmount) || 0;
    case SALARY_CALC_BASIS.GROSS:
    case SALARY_CALC_BASIS.TOTAL_EARNINGS:
      return Number(ctx.earningsSubtotal) || 0;
    case SALARY_CALC_BASIS.TOTAL_DEDUCTIONS:
      return Number(ctx.deductionsSubtotal) || 0;
    case SALARY_CALC_BASIS.SPECIFIC_HEAD:
      return Number(byHead[basisHeadId]) || 0;
    case SALARY_CALC_BASIS.MANUAL:
      return Number(ctx.manualBasis) || 0;
    default:
      return Number(ctx.basicAmount) || 0;
  }
}

/**
 * Full employee payroll calculation.
 * @param {{
 *   heads: object[],
 *   effectiveLines: object[],
 *   attendance: object,
 *   adjustments: object[],
 *   settings: object,
 *   attendanceSettings: object,
 *   period: { startDate: string, endDate: string, calendarDays: number, workingDays: number },
 *   manualValues?: Record<string, number>,
 * }} input
 */
export function calculateEmployeePayroll(input) {
  const headsById = new Map((input.heads || []).map((h) => [h.id, h]));
  const lineByHead = new Map((input.effectiveLines || []).map((l) => [l.salaryHeadId, l]));
  const activeHeads = (input.heads || []).filter((h) => h.isActive !== false);

  const monthly = monthlyPackageFromLines(input.effectiveLines || [], headsById);
  const dailyRate = computeDailyRate(monthly, input.period, input.settings);
  const hourlyRate = computeHourlyRate(monthly, dailyRate, {
    standardHours: input.attendanceSettings?.standardHours ?? 8,
  }, input.settings);

  const att = input.attendance || {};
  /** @type {Record<string, number>} */
  const amountsByHeadId = {};
  /** @type {object[]} */
  const components = [];

  const ctx = {
    dailyRate,
    hourlyRate,
    presentDays: Number(att.present) || 0,
    leaveDays: Number(att.leave) || 0,
    unpaidLeaveDays: Number(att.unpaidLeave) || 0,
    overtimeHours: Number(att.overtimeHours) || 0,
    calendarDays: input.period.calendarDays,
    workingDays: input.period.workingDays,
    standardHours: input.attendanceSettings?.standardHours ?? 8,
    amountsByHeadId,
    basicAmount: 0,
    earningsSubtotal: 0,
    deductionsSubtotal: 0,
    manualValues: input.manualValues || {},
  };

  // Base pass
  for (const head of activeHeads) {
    const line = lineByHead.get(head.id) || null;
    // Skip heads not on structure unless system attendance/hours/manual for run
    const onStructure = !!line;
    const always =
      head.calcType === SALARY_CALC_TYPES.ATTENDANCE ||
      head.calcType === SALARY_CALC_TYPES.HOURS ||
      (head.calcType === SALARY_CALC_TYPES.MANUAL && ctx.manualValues[head.id] != null);
    if (!onStructure && !always && !head.includeWithoutStructure) continue;

    const value = evaluateSalaryHead(head, line, ctx, 'base');
    if (value == null) continue;
    amountsByHeadId[head.id] = value;
    if (head.isBasic || /basic/i.test(head.name)) ctx.basicAmount = value;
  }

  // Dependent pass (percentage of basic / gross)
  let earnings = 0;
  for (const head of activeHeads) {
    if (head.headType !== SALARY_HEAD_TYPES.EARNING) continue;
    if (amountsByHeadId[head.id] != null) earnings += amountsByHeadId[head.id];
  }
  ctx.earningsSubtotal = roundMoney(earnings);

  for (const head of activeHeads) {
    const line = lineByHead.get(head.id) || null;
    if (amountsByHeadId[head.id] != null) continue;
    if (!line && !head.includeWithoutStructure) continue;
    const value = evaluateSalaryHead(head, line, ctx, 'dependent');
    if (value == null) continue;
    amountsByHeadId[head.id] = value;
  }

  // Rebuild earnings after % heads
  earnings = 0;
  let deductions = 0;
  for (const head of activeHeads) {
    const amt = roundMoney(amountsByHeadId[head.id] || 0);
    if (!amt && head.calcType === SALARY_CALC_TYPES.MANUAL && ctx.manualValues[head.id] == null && !lineByHead.has(head.id)) {
      continue;
    }
    if (head.headType === SALARY_HEAD_TYPES.EARNING) {
      earnings += amt;
      components.push({
        salaryHeadId: head.id,
        name: head.name,
        headType: head.headType,
        amount: amt,
        showOnPayslip: head.showOnPayslip !== false,
      });
    }
  }
  ctx.earningsSubtotal = roundMoney(earnings);

  for (const head of activeHeads) {
    if (head.headType !== SALARY_HEAD_TYPES.DEDUCTION) continue;
    let amt = roundMoney(amountsByHeadId[head.id] || 0);
    // Re-eval percentage deductions now that earnings known
    const line = lineByHead.get(head.id) || null;
    if (
      (head.calcType === SALARY_CALC_TYPES.PERCENTAGE || head.calcType === SALARY_CALC_TYPES.FORMULA) &&
      (line || head.includeWithoutStructure)
    ) {
      amt = evaluateSalaryHead(head, line, ctx, 'dependent') || 0;
      amountsByHeadId[head.id] = amt;
    }
    if (!amt && !line && ctx.manualValues[head.id] == null) continue;
    deductions += amt;
    components.push({
      salaryHeadId: head.id,
      name: head.name,
      headType: head.headType,
      amount: amt,
      showOnPayslip: head.showOnPayslip !== false,
    });
  }

  // One-time adjustments
  for (const adj of input.adjustments || []) {
    const amt = roundMoney(Number(adj.amount) || 0);
    if (!amt) continue;
    const headType = adj.headType === SALARY_HEAD_TYPES.DEDUCTION ? SALARY_HEAD_TYPES.DEDUCTION : SALARY_HEAD_TYPES.EARNING;
    if (headType === SALARY_HEAD_TYPES.EARNING) earnings += amt;
    else deductions += amt;
    components.push({
      salaryHeadId: adj.salaryHeadId || null,
      name: adj.description || adj.name || 'Adjustment',
      headType,
      amount: amt,
      showOnPayslip: true,
      isAdjustment: true,
      adjustmentId: adj.id,
    });
  }

  earnings = roundMoney(earnings);
  deductions = roundMoney(deductions);
  const net = roundMoney(earnings - deductions);

  return {
    monthlyPackage: monthly,
    dailyRate,
    hourlyRate,
    components,
    totalEarnings: earnings,
    gross: earnings,
    totalDeductions: deductions,
    net,
    attendanceSnapshot: {
      present: ctx.presentDays,
      leave: ctx.leaveDays,
      unpaidLeave: ctx.unpaidLeaveDays,
      overtimeHours: ctx.overtimeHours,
      workingDays: input.period.workingDays,
      calendarDays: input.period.calendarDays,
    },
  };
}

/**
 * Working days count in period from attendance settings.
 * @param {string} startDate
 * @param {string} endDate
 * @param {object} attendanceSettings
 */
export function countPeriodWorkingDays(startDate, endDate, attendanceSettings) {
  const work = workingDaySet(attendanceSettings);
  const bounds = { start: startDate, end: endDate };
  let n = 0;
  const cur = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cur <= end) {
    if (work.has(cur.getDay())) n += 1;
    cur.setDate(cur.getDate() + 1);
  }
  void bounds;
  return n;
}

/**
 * Default monthly period from YYYY-MM.
 * @param {string} month
 */
export function periodFromMonth(month) {
  const b = monthBounds(month);
  return {
    label: month,
    startDate: b.startDate,
    endDate: b.endDate,
    calendarDays: b.daysInMonth,
    year: b.year,
    month: b.month,
  };
}

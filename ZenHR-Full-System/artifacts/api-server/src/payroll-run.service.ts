// ─── PayrollRunService ────────────────────────────────────────────────────────
// Orchestrates payroll calculation for all active employees in a company.
// Call calculatePayroll() after a draft run has been created.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { pool } from "@workspace/db";
import {
  employeeSalaryComponentsTable,
  employeesTable,
  overtimeRequestsTable,
  payrollRunsTable,
  payslipsTable,
  salaryComponentsTable,
  salaryAdvancesTable,
  systemConfigurationsTable,
} from "@workspace/db/schema";
import {
  applyBrackets,
  calculateDeductions,
  calculateGross,
  EmployeeComponentAssignment,
  fromM,
  PayrollConfig,
  SalaryComponentConfig,
} from "./salary-calculation.service.js";
import {
  computePolicyRates,
  resolvePayrollPeriodContext,
  workedHoursForEmployee,
} from "./payroll-policy.service.js";
import { approvedUnpaidLeaveImpactForEmployee } from "./leave-notifications.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalculatePayrollInput {
  companyId: number;
  runId: number;
  runMonth: number;
  runYear: number;
}

export interface CalculatePayrollResult {
  run: Record<string, any>;
  payslipCount: number;
  totalGross: string;
  totalNet: string;
  totalSscEmployee: string;
  totalSscEmployer: string;
  totalIncomeTax: string;
  totalDeductions: string;
  totalOvertimeEarnings: string;
}

export type PayrollImpactSourceType =
  | "salary_component"
  | "overtime"
  | "leave"
  | "adjustment"
  | "attendance_impact"
  | "advance"
  | "employee_action";

export interface PayrollImpact {
  sourceType: PayrollImpactSourceType;
  sourceId: string;
  employeeId: string;
  payrollPeriod: string;
  amount: number;
  direction: "earning" | "deduction";
  status: "approved" | "applied" | "skipped" | "invalid";
  appliedInPayrollRunId?: string;
  metadata?: Record<string, any>;
}

class PayrollImpactRegistry {
  private readonly items: PayrollImpact[] = [];
  private readonly skipped: PayrollImpact[] = [];
  private readonly seen = new Set<string>();

  add(impact: PayrollImpact): boolean {
    const key = `${impact.sourceType}:${impact.sourceId}:${impact.employeeId}:${impact.payrollPeriod}`;
    if (this.seen.has(key)) {
      this.skipped.push({
        ...impact,
        status: "skipped",
        metadata: { ...(impact.metadata ?? {}), skippedReason: "duplicate_impact_key" },
      });
      return false;
    }
    if (!Number.isFinite(impact.amount) || impact.amount < 0) {
      this.skipped.push({
        ...impact,
        status: "invalid",
        metadata: { ...(impact.metadata ?? {}), skippedReason: "invalid_amount" },
      });
      return false;
    }
    this.seen.add(key);
    this.items.push(impact);
    return true;
  }

  byEmployee(employeeId: number): PayrollImpact[] {
    return this.items.filter(item => Number(item.employeeId) === Number(employeeId));
  }

  evidence() {
    return {
      applied: this.items,
      skipped: this.skipped,
      totals: this.items.reduce((acc, item) => {
        if (item.direction === "earning") acc.earnings += item.amount;
        else acc.deductions += item.amount;
        return acc;
      }, { earnings: 0, deductions: 0 }),
    };
  }
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function toM(jod: string | number): number {
  return Math.round(parseFloat(String(jod)) * 1000);
}

const DEFAULT_TAX_BRACKETS = [
  { from: 0,     to: 5000,  rate: 0 },
  { from: 5000,  to: 10000, rate: 0.05 },
  { from: 10000, to: 15000, rate: 0.10 },
  { from: 15000, to: 20000, rate: 0.15 },
  { from: 20000, to: 999_999_999, rate: 0.20 },
];

function buildConfig(configs: { key: string; value: string }[]): PayrollConfig {
  const get = (key: string, fallback: string) =>
    configs.find(c => c.key === key)?.value ?? fallback;
  const rate = (key: string, fallback: string) => {
    const value = parseFloat(get(key, fallback));
    return value > 1 ? value / 100 : value;
  };

  let taxBrackets = DEFAULT_TAX_BRACKETS;
  try {
    const parsed = JSON.parse(get("income_tax_brackets", "[]"));
    if (Array.isArray(parsed) && parsed.length > 0) taxBrackets = parsed;
  } catch {}

  return {
    sscEmployeeRate:               rate("ssc_employee_rate",               "0.075"),
    sscEmployerRate:               rate("ssc_employer_rate",               "0.1425"),
    sscInsurableCapJOD:            parseFloat(get("ssc_insurable_salary_cap",        "3000")),
    workingHoursPerDay:            parseInt(get("working_hours_per_day",             "8")),
    workingDaysPerMonth:           parseInt(get("working_days_per_month",            "30")),
    overtimeRateWeekday:           parseFloat(get("overtime_rate_weekday",           "1.5")),
    overtimeRateWeekend:           parseFloat(get("overtime_rate_weekend",           "2.0")),
    taxBrackets,
    incomeTaxPersonalExemptionJOD: parseFloat(get("income_tax_personal_exemption",  "9000")),
    incomeTaxFamilyExemptionJOD:   parseFloat(get("income_tax_family_exemption",    "500")),
  };
}

// ─── Advance deduction helper ─────────────────────────────────────────────────

function resolveInstallmentM(adv: any): number {
  const remaining = Math.round(parseFloat(String(adv.remainingBalance ?? adv.remaining_balance ?? "0")) * 1000);
  if (remaining <= 0) return 0;

  const method: string = adv.repaymentMethod ?? adv.repayment_method ?? "monthly";
  if (method === "one_time") return remaining;

  // Monthly: try to parse installment count from repayment_plan text
  const plan: string = adv.repaymentPlan ?? adv.repayment_plan ?? "";
  const match = plan.match(/(\d+)/);
  if (match) {
    const count = parseInt(match[1]);
    if (count > 0) {
      const approved = Math.round(parseFloat(String(adv.approvedAmount ?? adv.approved_amount ?? "0")) * 1000);
      const installment = Math.round(approved / count);
      return Math.min(installment, remaining);
    }
  }

  // Fallback: deduct all remaining (treat as one-time)
  return remaining;
}

// ─── Main service function ────────────────────────────────────────────────────

async function approvedAttendancePayrollImpactsForEmployee(companyId: number, employeeId: number, month: number, year: number) {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  try {
    const { rows } = await pool.query(
      `SELECT api.id, api.attendance_violation_id, api.impact_type, api.amount, api.direction, api.calculation_json, av.violation_date, av.violation_type
         FROM attendance_payroll_impacts api
         LEFT JOIN attendance_violations av ON av.id = api.attendance_violation_id AND av.company_id = api.company_id
        WHERE api.company_id=$1
          AND api.employee_id=$2
          AND api.is_deleted=false
          AND api.status='approved'
          AND (av.violation_date BETWEEN $3 AND $4 OR api.attendance_violation_id IS NULL)`,
      [companyId, employeeId, periodStart, periodEnd],
    );
    let additionM = 0;
    let deductionM = 0;
    for (const row of rows) {
      const amountM = toM(row.amount ?? "0");
      if (row.direction === "add") additionM += amountM;
      else deductionM += amountM;
    }
    return { additionM, deductionM, rows };
  } catch (e: any) {
    if (["42P01", "42703"].includes(String(e?.code ?? ""))) return { additionM: 0, deductionM: 0, rows: [] };
    throw e;
  }
}

async function approvedPayrollAdjustmentImpactsForEmployee(companyId: number, employeeId: number, month: number, year: number, runId?: number) {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  try {
    const { rows: adjustmentRows } = await pool.query(
      `SELECT pa.id, pa.adjustment_number, pa.direction, pa.calculation_mode, pa.recurrence_type,
              pa.amount, pa.status, pa.payroll_run_id, pa.payslip_id, pa.effective_date, pa.end_date,
              pa.title_ar, pa.title_en, pat.code AS type_code, pat.name_ar AS type_name_ar, pat.name_en AS type_name_en
         FROM payroll_adjustments pa
         LEFT JOIN payroll_adjustment_types pat ON pat.id=pa.adjustment_type_id AND pat.company_id=pa.company_id
        WHERE pa.company_id=$1
          AND pa.employee_id=$2
          AND pa.is_deleted=false
          AND (
            pa.status='approved'
            OR (pa.status='applied' AND pa.payroll_run_id=$5)
          )
          AND pa.recurrence_type <> 'installments'
          AND (
            (pa.payroll_month=$3 AND pa.payroll_year=$4)
            OR (pa.recurrence_type='one_time' AND pa.effective_date BETWEEN $6 AND $7)
            OR (pa.recurrence_type IN ('monthly','date_range') AND pa.effective_date <= $7 AND (pa.end_date IS NULL OR pa.end_date >= $6))
          )
          AND (pa.payroll_run_id IS NULL OR pa.payroll_run_id=$5)`,
      [companyId, employeeId, month, year, runId ?? null, periodStart, periodEnd],
    );
    const { rows: installmentRows } = await pool.query(
      `SELECT pai.id, pai.payroll_adjustment_id, pai.installment_no, pai.amount, pai.status,
              pai.payroll_run_id, pai.payslip_id, pa.adjustment_number, pa.direction, pa.calculation_mode,
              pa.title_ar, pa.title_en, pat.code AS type_code, pat.name_ar AS type_name_ar, pat.name_en AS type_name_en
         FROM payroll_adjustment_installments pai
         JOIN payroll_adjustments pa ON pa.id=pai.payroll_adjustment_id AND pa.company_id=pai.company_id
         LEFT JOIN payroll_adjustment_types pat ON pat.id=pa.adjustment_type_id AND pat.company_id=pa.company_id
        WHERE pai.company_id=$1
          AND pai.employee_id=$2
          AND pai.due_month=$3
          AND pai.due_year=$4
          AND pa.is_deleted=false
          AND pa.status IN ('approved','applied')
          AND (
            pai.status='pending'
            OR (pai.status='applied' AND pai.payroll_run_id=$5)
          )
          AND (pai.payroll_run_id IS NULL OR pai.payroll_run_id=$5)`,
      [companyId, employeeId, month, year, runId ?? null],
    );
    const rows = [
      ...adjustmentRows.map((row: any) => ({ ...row, sourceKind: "adjustment", sourceId: row.id })),
      ...installmentRows.map((row: any) => ({ ...row, sourceKind: "adjustment_installment", sourceId: row.id })),
    ];
    let additionM = 0;
    let deductionM = 0;
    for (const row of rows) {
      const amountM = toM(row.amount ?? "0");
      if (row.direction === "add") additionM += amountM;
      else deductionM += amountM;
    }
    return { additionM, deductionM, rows };
  } catch (e: any) {
    if (["42P01", "42703"].includes(String(e?.code ?? ""))) return { additionM: 0, deductionM: 0, rows: [] };
    throw e;
  }
}

export async function calculatePayroll(
  db: any,
  input: CalculatePayrollInput,
): Promise<CalculatePayrollResult> {
  const { companyId, runId, runMonth, runYear } = input;

  const periodStart = `${runYear}-${String(runMonth).padStart(2, "0")}-01`;
  const lastDay     = new Date(runYear, runMonth, 0).getDate();
  const periodEnd   = `${runYear}-${String(runMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // ── 1. Load active employees ──────────────────────────────────────────────
  const employees: any[] = await db
    .select()
    .from(employeesTable)
    .where(and(
      eq(employeesTable.companyId, companyId),
      eq(employeesTable.isDeleted, false),
      eq(employeesTable.employmentStatus, "active"),
    ));

  if (employees.length === 0) {
    throw new Error("No active employees found for this company.");
  }

  const empIds = employees.map((e: any) => e.id);

  // ── 2. Bulk-load salary component assignments (effective in period) ────────
  const escRows: any[] = await db
    .select({
      employeeId:        employeeSalaryComponentsTable.employeeId,
      overrideValue:     employeeSalaryComponentsTable.overrideValue,
      effectiveFrom:     employeeSalaryComponentsTable.effectiveFrom,
      effectiveTo:       employeeSalaryComponentsTable.effectiveTo,
      componentId:       salaryComponentsTable.id,
      code:              salaryComponentsTable.code,
      nameAr:            salaryComponentsTable.nameAr,
      nameEn:            salaryComponentsTable.nameEn,
      componentType:     salaryComponentsTable.componentType,
      calculationType:   salaryComponentsTable.calculationType,
      defaultValue:      salaryComponentsTable.defaultValue,
      formulaExpression: salaryComponentsTable.formulaExpression,
      percentageBase:    salaryComponentsTable.percentageBase,
      isTaxable:         salaryComponentsTable.isTaxable,
      isSscApplicable:   salaryComponentsTable.isSscApplicable,
      isRecurring:       salaryComponentsTable.isRecurring,
      sortOrder:         salaryComponentsTable.sortOrder,
    })
    .from(employeeSalaryComponentsTable)
    .innerJoin(salaryComponentsTable, eq(salaryComponentsTable.id, employeeSalaryComponentsTable.salaryComponentId))
    .where(and(
      inArray(employeeSalaryComponentsTable.employeeId, empIds),
      eq(salaryComponentsTable.isActive, true),
      lte(employeeSalaryComponentsTable.effectiveFrom, periodEnd),
    ));

  const assignmentsByEmployee = new Map<number, EmployeeComponentAssignment[]>();
  for (const row of escRows) {
    if (row.effectiveTo && row.effectiveTo < periodStart) continue;

    const comp: SalaryComponentConfig = {
      id:                row.componentId,
      code:              row.code,
      componentType:     row.componentType,
      calculationType:   row.calculationType,
      defaultValue:      row.defaultValue,
      formulaExpression: row.formulaExpression,
      percentageBase:    row.percentageBase,
      isTaxable:         row.isTaxable,
      isSscApplicable:   row.isSscApplicable,
      isRecurring:       row.isRecurring,
      sortOrder:         row.sortOrder,
    };
    (comp as any).nameEn = row.nameEn;
    (comp as any).nameAr = row.nameAr;

    const list = assignmentsByEmployee.get(row.employeeId) ?? [];
    list.push({ component: comp, overrideValue: row.overrideValue ?? null });
    assignmentsByEmployee.set(row.employeeId, list);
  }

  // ── 3. Load approved overtime for the period ──────────────────────────────
  const otRows: any[] = await db
    .select()
    .from(overtimeRequestsTable)
    .where(and(
      inArray(overtimeRequestsTable.employeeId, empIds),
      eq(overtimeRequestsTable.status, "approved"),
      eq(overtimeRequestsTable.isDeleted, false),
      gte(overtimeRequestsTable.date, periodStart),
      lte(overtimeRequestsTable.date, periodEnd),
      isNull(overtimeRequestsTable.linkedPayslipId),
    ));

  const otHoursByEmployee = new Map<number, { weekday: number; weekend: number; rowIds: number[] }>();
  for (const ot of otRows) {
    const dayOfWeek = new Date(ot.date).getDay();
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const hours = parseFloat(ot.hours);
    const prev = otHoursByEmployee.get(ot.employeeId) ?? { weekday: 0, weekend: 0, rowIds: [] };
    if (isWeekend) prev.weekend += hours; else prev.weekday += hours;
    prev.rowIds.push(ot.id);
    otHoursByEmployee.set(ot.employeeId, prev);
  }

  // ── 4. Load approved salary advances with remaining balance > 0 ───────────
  const advanceRows: any[] = await db
    .select()
    .from(salaryAdvancesTable)
    .where(and(
      inArray(salaryAdvancesTable.employeeId, empIds),
      eq(salaryAdvancesTable.companyId, companyId),
      eq(salaryAdvancesTable.isDeleted, false),
      eq(salaryAdvancesTable.status, "approved"),
    ));

  // Aggregate advance deductions per employee
  const advancesByEmployee = new Map<number, { totalM: number; ids: number[] }>();
  for (const adv of advanceRows) {
    const remainingM = Math.round(parseFloat(String(adv.remainingBalance ?? "0")) * 1000);
    if (remainingM <= 0) continue;
    const installmentM = resolveInstallmentM(adv);
    if (installmentM <= 0) continue;
    const prev = advancesByEmployee.get(adv.employeeId) ?? { totalM: 0, ids: [] };
    prev.totalM += installmentM;
    prev.ids.push(adv.id);
    advancesByEmployee.set(adv.employeeId, prev);
  }

  // ── 5. Load payroll config ────────────────────────────────────────────────
  const configRows: any[] = await db
    .select()
    .from(systemConfigurationsTable)
    .where(eq(systemConfigurationsTable.companyId, companyId));
  const config = buildConfig(configRows);

  // ── 6. Per-employee calculation ───────────────────────────────────────────
  let totalGrossM = 0, totalNetM = 0, totalDeductionsM = 0;
  let totalSscEmployeeM = 0, totalSscEmployerM = 0, totalIncomeTaxM = 0, totalOTM = 0;
  const payslipValues: any[] = [];
  const otLinkMap = new Map<number, number[]>();
  const attendanceImpactLinkMap = new Map<number, number[]>();
  const adjustmentLinkMap = new Map<number, { adjustmentIds: number[]; installmentIds: number[] }>();
  const impactRegistry = new PayrollImpactRegistry();
  const payrollPeriod = `${runYear}-${String(runMonth).padStart(2, "0")}`;
  let includedEmployeeCount = 0;
  let runPolicyId: number | null = null;
  let runPolicySnapshot: Record<string, any> | null = null;

  for (const emp of employees) {
    let assignments = assignmentsByEmployee.get(emp.id) ?? [];
    const periodContext = await resolvePayrollPeriodContext(companyId, runMonth, runYear, emp.employmentType);
    if (!periodContext.rule.payrollIncluded) continue;
    includedEmployeeCount++;
    if (!runPolicySnapshot) {
      runPolicyId = periodContext.policy.id;
      runPolicySnapshot = {
        policyId: periodContext.policy.id,
        salaryCalculationMode: periodContext.policy.salaryCalculationMode,
        defaultWorkingDaysPolicy: periodContext.policy.defaultWorkingDaysPolicy,
        weekendDays: periodContext.policy.weekendDays,
        roundingPolicy: periodContext.policy.roundingPolicy,
        applyAttendanceToPayroll: periodContext.policy.applyAttendanceToPayroll,
        applyOvertimeToPayroll: periodContext.policy.applyOvertimeToPayroll,
        workingHoursPerDay: periodContext.policy.workingHoursPerDay,
        policyEffectiveFrom: periodContext.policy.policyEffectiveFrom,
        capturedAt: new Date().toISOString(),
      };
    }
    const baseSalaryJOD = parseFloat(String(emp.basicSalary ?? "0"));
    const workedHours = periodContext.rule.salaryBasis === "hourly"
      ? await workedHoursForEmployee(companyId, emp.id, runMonth, runYear)
      : 0;
    const rawPolicyRates = computePolicyRates(baseSalaryJOD, {
      divisorDays: periodContext.divisorDays,
      hoursPerDay: periodContext.hoursPerDay,
      policy: periodContext.policy,
    });
    const policyRates = periodContext.rule.salaryBasis === "hourly"
      ? { dailyRate: baseSalaryJOD * periodContext.hoursPerDay, hourlyRate: baseSalaryJOD }
      : periodContext.rule.salaryBasis === "daily"
        ? { dailyRate: baseSalaryJOD, hourlyRate: baseSalaryJOD / periodContext.hoursPerDay }
        : rawPolicyRates;
    const policyBasicJOD =
      periodContext.rule.salaryBasis === "hourly" ? policyRates.hourlyRate * workedHours :
      periodContext.rule.salaryBasis === "daily" ? baseSalaryJOD * periodContext.workingDays :
      baseSalaryJOD;

    if (assignments.length === 0) {
      const fallbackBasicM = toM(policyBasicJOD);
      const fallbackComponents: EmployeeComponentAssignment[] = [
        { component: { id: 0, code: 'BASIC',     componentType: 'earning', calculationType: 'fixed', defaultValue: fromM(fallbackBasicM),                  formulaExpression: null, percentageBase: null, isTaxable: true,  isSscApplicable: true,  isRecurring: true, sortOrder: 1, nameEn: 'Basic Salary' } as any, overrideValue: null },
        { component: { id: 0, code: 'HOUSING',   componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.housingAllowance   ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 2, nameEn: 'Housing Allowance' } as any, overrideValue: null },
        { component: { id: 0, code: 'TRANSPORT', componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.transportAllowance ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 3, nameEn: 'Transport Allowance' } as any, overrideValue: null },
        { component: { id: 0, code: 'MOBILE',    componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.mobileAllowance    ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 4, nameEn: 'Mobile Allowance' } as any, overrideValue: null },
        { component: { id: 0, code: 'MEAL',      componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.mealAllowance      ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 5, nameEn: 'Meal Allowance' } as any, overrideValue: null },
      ].filter(a => parseFloat(a.component.defaultValue) > 0);
      assignments.push(...fallbackComponents);
    } else {
      assignments = assignments.map(a => {
        if (a.component.code !== "BASIC") return a;
        return {
          ...a,
          overrideValue: fromM(toM(policyBasicJOD)),
          component: { ...a.component, defaultValue: fromM(toM(policyBasicJOD)) },
        };
      });
    }

    const basicAssignment = assignments.find(a => a.component.code === 'BASIC');
    const basicJOD = basicAssignment
      ? parseFloat(basicAssignment.overrideValue ?? basicAssignment.component.defaultValue)
      : parseFloat(String(emp.basicSalary ?? '0'));
    const hourlyRateJOD = policyRates.hourlyRate || (basicJOD / config.workingDaysPerMonth / config.workingHoursPerDay);

    const otData = otHoursByEmployee.get(emp.id);
    const overtimeM = otData
      ? Math.round(
          (otData.weekday * hourlyRateJOD * config.overtimeRateWeekday +
           otData.weekend * hourlyRateJOD * config.overtimeRateWeekend) * 1000
      )
      : 0;
    if (otData?.rowIds?.length && overtimeM > 0) {
      for (const rowId of otData.rowIds) {
        impactRegistry.add({
          sourceType: "overtime",
          sourceId: String(rowId),
          employeeId: String(emp.id),
          payrollPeriod,
          amount: Number(fromM(Math.round(overtimeM / otData.rowIds.length))),
          direction: "earning",
          status: "approved",
          metadata: { weekdayHours: otData.weekday, weekendHours: otData.weekend },
        });
      }
    }

    const { totalM: componentGrossM, breakdown } = calculateGross(assignments, {
      hours: (otData?.weekday ?? 0) + (otData?.weekend ?? 0),
      rate: config.overtimeRateWeekday,
      days: config.workingDaysPerMonth,
    });
    const grossM = componentGrossM + overtimeM;

    const basicBreakdown = breakdown.find(b => b.code === 'BASIC');
    const basicM = basicBreakdown?.calculatedValueM ?? toM(String(emp.basicSalary ?? '0'));

    const hasFamily = emp.maritalStatus === 'married';
    const taxExemptionJOD = parseFloat(String(emp.taxExemptionAmount ?? '0'));
    const deductions = calculateDeductions(
      assignments,
      grossM,
      basicM,
      config,
      emp.isSSCExempt ?? false,
      taxExemptionJOD,
      hasFamily,
    );

    // Advance deductions
    const advData = advancesByEmployee.get(emp.id);
    const advanceDeductionM = advData?.totalM ?? 0;
    if (advData?.ids?.length && advanceDeductionM > 0) {
      for (const id of advData.ids) {
        impactRegistry.add({
          sourceType: "advance",
          sourceId: String(id),
          employeeId: String(emp.id),
          payrollPeriod,
          amount: Number(fromM(Math.round(advanceDeductionM / advData.ids.length))),
          direction: "deduction",
          status: "approved",
          metadata: { source: "salary_advances" },
        });
      }
    }
    const leaveImpact = await approvedUnpaidLeaveImpactForEmployee(
      companyId,
      emp.id,
      runMonth,
      runYear,
      policyRates.dailyRate,
      policyRates.hourlyRate,
    );
    const leaveDeductionM = toM(leaveImpact.amount);
    for (const item of leaveImpact.items ?? []) {
      impactRegistry.add({
        sourceType: "leave",
        sourceId: String(item.id ?? item.leavePayrollImpactId ?? item.leaveRequestId),
        employeeId: String(emp.id),
        payrollPeriod,
        amount: Number(item.amount ?? 0),
        direction: "deduction",
        status: "approved",
        metadata: item,
      });
    }
    const attendanceImpact = await approvedAttendancePayrollImpactsForEmployee(companyId, emp.id, runMonth, runYear);
    const attendanceAdditionM = attendanceImpact.additionM;
    const attendanceDeductionM = attendanceImpact.deductionM;
    for (const item of attendanceImpact.rows) {
      impactRegistry.add({
        sourceType: "attendance_impact",
        sourceId: String(item.id),
        employeeId: String(emp.id),
        payrollPeriod,
        amount: Number(item.amount ?? 0),
        direction: item.direction === "add" ? "earning" : "deduction",
        status: "approved",
        metadata: item,
      });
    }
    const adjustmentImpact = await approvedPayrollAdjustmentImpactsForEmployee(companyId, emp.id, runMonth, runYear, runId);
    const adjustmentAdditionM = adjustmentImpact.additionM;
    const adjustmentDeductionM = adjustmentImpact.deductionM;
    for (const item of adjustmentImpact.rows) {
      impactRegistry.add({
        sourceType: "adjustment",
        sourceId: `${item.sourceKind}:${item.sourceId}`,
        employeeId: String(emp.id),
        payrollPeriod,
        amount: Number(item.amount ?? 0),
        direction: item.direction === "add" ? "earning" : "deduction",
        status: "approved",
        metadata: item,
      });
    }

    const netM = grossM + attendanceAdditionM + adjustmentAdditionM - deductions.totalM - advanceDeductionM - leaveDeductionM - attendanceDeductionM - adjustmentDeductionM;
    const employeeImpacts = impactRegistry.byEmployee(emp.id);

    const snapshot = {
      components: breakdown.map(b => ({
        code: b.code,
        nameEn: b.nameEn,
        type: b.componentType,
        calcType: b.calculationType,
        valueJOD: fromM(b.calculatedValueM),
        overrideApplied: b.overrideApplied,
      })),
      overtimeJOD: fromM(overtimeM),
      overtimeHoursWeekday: otData?.weekday ?? 0,
      overtimeHoursWeekend: otData?.weekend ?? 0,
      payrollPolicy: {
        policyId: periodContext.policy.id,
        salaryCalculationMode: periodContext.policy.salaryCalculationMode,
        employmentType: periodContext.rule.employmentType,
        salaryBasis: periodContext.rule.salaryBasis,
        selectedCalculationMode: periodContext.selectedMode,
        divisorDays: periodContext.divisorDays,
        actualMonthDays: periodContext.actualDays,
        workingDays: periodContext.workingDays,
        workedHours,
        dailyRateJOD: policyRates.dailyRate.toFixed(3),
        hourlyRateJOD: policyRates.hourlyRate.toFixed(3),
        effectiveFrom: periodContext.policy.policyEffectiveFrom,
      },
      advanceDeductionJOD: fromM(advanceDeductionM),
      advanceIds: advData?.ids ?? [],
      leaveDeductionJOD: fromM(leaveDeductionM),
      leaveImpact,
      attendanceImpactAdditionJOD: fromM(attendanceAdditionM),
      attendanceImpactDeductionJOD: fromM(attendanceDeductionM),
      attendanceImpactItems: attendanceImpact.rows,
      adjustmentAdditionJOD: fromM(adjustmentAdditionM),
      adjustmentDeductionJOD: fromM(adjustmentDeductionM),
      payrollAdjustmentItems: adjustmentImpact.rows,
      payrollImpacts: employeeImpacts,
      payrollImpactTotals: employeeImpacts.reduce((acc: any, item: PayrollImpact) => {
        if (item.direction === "earning") acc.earnings += item.amount;
        else acc.deductions += item.amount;
        return acc;
      }, { earnings: 0, deductions: 0 }),
    };

    const housingBreakdown   = breakdown.find(b => b.code === 'HOUSING');
    const transportBreakdown = breakdown.find(b => b.code === 'TRANSPORT');
    const mobileBreakdown    = breakdown.find(b => b.code === 'MOBILE');
    const mealBreakdown      = breakdown.find(b => b.code === 'MEAL');
    const knownCodes = new Set(['BASIC','HOUSING','TRANSPORT','MOBILE','MEAL']);
    const otherEarningsM = breakdown
      .filter(b => b.componentType === 'earning' && !knownCodes.has(b.code))
      .reduce((s, b) => s + b.calculatedValueM, 0);

    payslipValues.push({
      payrollRunId:            runId,
      runMonth,
      runYear,
      employeeId:              emp.id,
      basicSalary:             fromM(basicM),
      housingAllowance:        fromM(housingBreakdown?.calculatedValueM  ?? 0),
      transportAllowance:      fromM(transportBreakdown?.calculatedValueM ?? 0),
      mobileAllowance:         fromM(mobileBreakdown?.calculatedValueM   ?? 0),
      mealAllowance:           fromM(mealBreakdown?.calculatedValueM     ?? 0),
      otherAllowances:         fromM(otherEarningsM + attendanceAdditionM + adjustmentAdditionM),
      overtimeEarnings:        fromM(overtimeM),
      grossSalary:             fromM(grossM + attendanceAdditionM + adjustmentAdditionM),
      sscDeduction:            fromM(deductions.sscEmployeeM),
      sscEmployerContribution: fromM(deductions.sscEmployerM),
      incomeTaxDeduction:      fromM(deductions.incomeTaxM),
      loanDeductions:          fromM(deductions.componentDeductionsM),
      advanceDeduction:        fromM(advanceDeductionM),
      otherDeductions:         fromM(leaveDeductionM + attendanceDeductionM + adjustmentDeductionM),
      totalDeductions:         fromM(deductions.totalM + advanceDeductionM + leaveDeductionM + attendanceDeductionM + adjustmentDeductionM),
      netSalary:               fromM(Math.max(0, netM)),
      bankName:                emp.bankName ?? null,
      iban:                    emp.iban ?? null,
      componentsSnapshot:      JSON.stringify(snapshot),
      payrollPolicySnapshot:   snapshot.payrollPolicy,
    });

    if (otData?.rowIds?.length) {
      otLinkMap.set(payslipValues.length - 1, otData.rowIds);
    }
    if (attendanceImpact.rows.length) {
      attendanceImpactLinkMap.set(payslipValues.length - 1, attendanceImpact.rows.map((row: any) => Number(row.id)));
    }
    if (adjustmentImpact.rows.length) {
      adjustmentLinkMap.set(payslipValues.length - 1, {
        adjustmentIds: adjustmentImpact.rows.filter((row: any) => row.sourceKind === "adjustment").map((row: any) => Number(row.sourceId)),
        installmentIds: adjustmentImpact.rows.filter((row: any) => row.sourceKind === "adjustment_installment").map((row: any) => Number(row.sourceId)),
      });
    }

    totalGrossM       += grossM + attendanceAdditionM + adjustmentAdditionM;
    totalNetM         += Math.max(0, netM);
    totalDeductionsM  += deductions.totalM + advanceDeductionM + leaveDeductionM + attendanceDeductionM + adjustmentDeductionM;
    totalSscEmployeeM += deductions.sscEmployeeM;
    totalSscEmployerM += deductions.sscEmployerM;
    totalIncomeTaxM   += deductions.incomeTaxM;
    totalOTM          += overtimeM;
  }

  // ── 7. Insert payslips and update payroll run in a transaction ─────────────
  let updatedRun: any;
  const insertedPayslipIds: number[] = [];

  await db.transaction(async (tx: any) => {
    const stalePayslips: any[] = await tx
      .select({ id: payslipsTable.id })
      .from(payslipsTable)
      .where(eq(payslipsTable.payrollRunId, runId));
    const stalePayslipIds = stalePayslips.map(row => Number(row.id)).filter(Number.isFinite);
    if (stalePayslipIds.length) {
      await pool.query(
        `UPDATE attendance_payroll_impacts
            SET status='approved', payroll_run_id=NULL, payslip_id=NULL, applied_at=NULL, updated_at=NOW()
          WHERE company_id=$1 AND payroll_run_id=$2 AND payslip_id = ANY($3::int[]) AND is_deleted=false`,
        [companyId, runId, stalePayslipIds],
      );
      await pool.query(
        `UPDATE payroll_adjustments
            SET status=CASE WHEN status='applied' THEN 'approved' ELSE status END,
                payroll_run_id=NULL, payslip_id=NULL, applied_at=NULL, updated_at=NOW()
          WHERE company_id=$1 AND payroll_run_id=$2 AND payslip_id = ANY($3::int[]) AND is_deleted=false`,
        [companyId, runId, stalePayslipIds],
      );
      await pool.query(
        `UPDATE payroll_adjustment_installments
            SET status=CASE WHEN status='applied' THEN 'pending' ELSE status END,
                payroll_run_id=NULL, payslip_id=NULL, applied_at=NULL, updated_at=NOW()
          WHERE company_id=$1 AND payroll_run_id=$2 AND payslip_id = ANY($3::int[])`,
        [companyId, runId, stalePayslipIds],
      );
      await tx
        .update(overtimeRequestsTable)
        .set({ linkedPayslipId: null })
        .where(inArray(overtimeRequestsTable.linkedPayslipId, stalePayslipIds));
    }
    // Delete any stale slips from a previous calculation of this run
    await tx.delete(payslipsTable).where(eq(payslipsTable.payrollRunId, runId));

    for (const pv of payslipValues) {
      const [slip] = await tx.insert(payslipsTable).values(pv).returning({ id: payslipsTable.id });
      insertedPayslipIds.push(slip.id);
    }

    const [run] = await tx.update(payrollRunsTable).set({
      status:                "calculated",
      totalGross:            fromM(totalGrossM),
      totalNet:              fromM(totalNetM),
      totalDeductions:       fromM(totalDeductionsM),
      totalOvertimeEarnings: fromM(totalOTM),
      totalSscEmployee:      fromM(totalSscEmployeeM),
      totalSscEmployer:      fromM(totalSscEmployerM),
      totalIncomeTax:        fromM(totalIncomeTaxM),
      employeeCount:         includedEmployeeCount,
      payrollPolicyId:       runPolicyId,
      payrollPolicySnapshot: runPolicySnapshot,
      processedAt:           new Date(),
    }).where(eq(payrollRunsTable.id, runId)).returning();

    updatedRun = run;
  });

  // ── 8. Link OT records to their payslips ──────────────────────────────────
  for (const [psIndex, otRowIds] of otLinkMap.entries()) {
    const payslipId = insertedPayslipIds[psIndex];
    if (!payslipId || !otRowIds.length) continue;
    await db
      .update(overtimeRequestsTable)
      .set({ linkedPayslipId: payslipId })
      .where(inArray(overtimeRequestsTable.id, otRowIds));
  }

  for (const [psIndex, impactIds] of attendanceImpactLinkMap.entries()) {
    const payslipId = insertedPayslipIds[psIndex];
    if (!payslipId || !impactIds.length) continue;
    await pool.query(
      `UPDATE attendance_payroll_impacts
          SET status='applied', payroll_run_id=$1, payslip_id=$2, applied_at=NOW(), updated_at=NOW()
        WHERE company_id=$3 AND id = ANY($4::bigint[]) AND status='approved' AND is_deleted=false`,
      [runId, payslipId, companyId, impactIds],
    );
  }

  for (const [psIndex, links] of adjustmentLinkMap.entries()) {
    const payslipId = insertedPayslipIds[psIndex];
    if (!payslipId) continue;
    if (links.adjustmentIds.length) {
      await pool.query(
        `UPDATE payroll_adjustments
            SET status='applied', payroll_run_id=$1, payslip_id=$2, applied_at=NOW(), updated_at=NOW()
          WHERE company_id=$3 AND id = ANY($4::bigint[]) AND status='approved' AND is_deleted=false`,
        [runId, payslipId, companyId, links.adjustmentIds],
      );
    }
    if (links.installmentIds.length) {
      await pool.query(
        `UPDATE payroll_adjustment_installments
            SET status='applied', payroll_run_id=$1, payslip_id=$2, applied_at=NOW(), updated_at=NOW()
          WHERE company_id=$3 AND id = ANY($4::bigint[]) AND status='pending'`,
        [runId, payslipId, companyId, links.installmentIds],
      );
    }
  }

  const registryEvidence = impactRegistry.evidence();
  if (registryEvidence.skipped.length) {
    for (const skipped of registryEvidence.skipped) {
      await pool.query(
        `INSERT INTO payroll_audit_events
          (company_id, payroll_run_id, employee_id, entity_type, entity_id, event_type, after_json, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [
          companyId,
          runId,
          Number(skipped.employeeId),
          skipped.sourceType,
          Number(String(skipped.sourceId).replace(/^\D+:/, "")) || null,
          skipped.status === "invalid" ? "impact_invalid" : "impact_skipped",
          JSON.stringify(skipped),
          skipped.metadata?.skippedReason ?? "payroll impact skipped",
        ],
      );
    }
  }

  return {
    run:                   updatedRun,
    payslipCount:          payslipValues.length,
    totalGross:            fromM(totalGrossM),
    totalNet:              fromM(totalNetM),
    totalSscEmployee:      fromM(totalSscEmployeeM),
    totalSscEmployer:      fromM(totalSscEmployerM),
    totalIncomeTax:        fromM(totalIncomeTaxM),
    totalDeductions:       fromM(totalDeductionsM),
    totalOvertimeEarnings: fromM(totalOTM),
  };
}

// Keep legacy export name for any other callers
export { calculatePayroll as runPayroll };

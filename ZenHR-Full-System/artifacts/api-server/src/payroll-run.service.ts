// ─── PayrollRunService ────────────────────────────────────────────────────────
// Orchestrates payroll calculation for all active employees in a company.
// Call calculatePayroll() after a draft run has been created.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
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

  let taxBrackets = DEFAULT_TAX_BRACKETS;
  try {
    const parsed = JSON.parse(get("income_tax_brackets", "[]"));
    if (Array.isArray(parsed) && parsed.length > 0) taxBrackets = parsed;
  } catch {}

  return {
    sscEmployeeRate:               parseFloat(get("ssc_employee_rate",               "0.075")),
    sscEmployerRate:               parseFloat(get("ssc_employer_rate",               "0.1425")),
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

  for (const emp of employees) {
    const assignments = assignmentsByEmployee.get(emp.id) ?? [];

    if (assignments.length === 0) {
      const fallbackBasicM = toM(emp.basicSalary);
      const fallbackComponents: EmployeeComponentAssignment[] = [
        { component: { id: 0, code: 'BASIC',     componentType: 'earning', calculationType: 'fixed', defaultValue: fromM(fallbackBasicM),                  formulaExpression: null, percentageBase: null, isTaxable: true,  isSscApplicable: true,  isRecurring: true, sortOrder: 1, nameEn: 'Basic Salary' } as any, overrideValue: null },
        { component: { id: 0, code: 'HOUSING',   componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.housingAllowance   ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 2, nameEn: 'Housing Allowance' } as any, overrideValue: null },
        { component: { id: 0, code: 'TRANSPORT', componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.transportAllowance ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 3, nameEn: 'Transport Allowance' } as any, overrideValue: null },
        { component: { id: 0, code: 'MOBILE',    componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.mobileAllowance    ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 4, nameEn: 'Mobile Allowance' } as any, overrideValue: null },
        { component: { id: 0, code: 'MEAL',      componentType: 'earning', calculationType: 'fixed', defaultValue: String(emp.mealAllowance      ?? '0'), formulaExpression: null, percentageBase: null, isTaxable: false, isSscApplicable: false, isRecurring: true, sortOrder: 5, nameEn: 'Meal Allowance' } as any, overrideValue: null },
      ].filter(a => parseFloat(a.component.defaultValue) > 0);
      assignments.push(...fallbackComponents);
    }

    const basicAssignment = assignments.find(a => a.component.code === 'BASIC');
    const basicJOD = basicAssignment
      ? parseFloat(basicAssignment.overrideValue ?? basicAssignment.component.defaultValue)
      : parseFloat(String(emp.basicSalary ?? '0'));
    const hourlyRateJOD = basicJOD / config.workingDaysPerMonth / config.workingHoursPerDay;

    const otData = otHoursByEmployee.get(emp.id);
    const overtimeM = otData
      ? Math.round(
          (otData.weekday * hourlyRateJOD * config.overtimeRateWeekday +
           otData.weekend * hourlyRateJOD * config.overtimeRateWeekend) * 1000
        )
      : 0;

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

    const netM = grossM - deductions.totalM - advanceDeductionM;

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
      advanceDeductionJOD: fromM(advanceDeductionM),
      advanceIds: advData?.ids ?? [],
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
      otherAllowances:         fromM(otherEarningsM),
      overtimeEarnings:        fromM(overtimeM),
      grossSalary:             fromM(grossM),
      sscDeduction:            fromM(deductions.sscEmployeeM),
      sscEmployerContribution: fromM(deductions.sscEmployerM),
      incomeTaxDeduction:      fromM(deductions.incomeTaxM),
      loanDeductions:          fromM(deductions.componentDeductionsM),
      advanceDeduction:        fromM(advanceDeductionM),
      otherDeductions:         "0.000",
      totalDeductions:         fromM(deductions.totalM + advanceDeductionM),
      netSalary:               fromM(Math.max(0, netM)),
      bankName:                emp.bankName ?? null,
      iban:                    emp.iban ?? null,
      componentsSnapshot:      JSON.stringify(snapshot),
    });

    if (otData?.rowIds?.length) {
      otLinkMap.set(payslipValues.length - 1, otData.rowIds);
    }

    totalGrossM       += grossM;
    totalNetM         += Math.max(0, netM);
    totalDeductionsM  += deductions.totalM + advanceDeductionM;
    totalSscEmployeeM += deductions.sscEmployeeM;
    totalSscEmployerM += deductions.sscEmployerM;
    totalIncomeTaxM   += deductions.incomeTaxM;
    totalOTM          += overtimeM;
  }

  // ── 7. Insert payslips and update payroll run in a transaction ─────────────
  let updatedRun: any;
  const insertedPayslipIds: number[] = [];

  await db.transaction(async (tx: any) => {
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
      employeeCount:         employees.length,
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

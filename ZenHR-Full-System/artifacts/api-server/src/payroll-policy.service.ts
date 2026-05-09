import { pool } from "@workspace/db";

export type SalaryCalculationMode = "fixed_30" | "actual_calendar_days" | "working_days_only" | "hourly";
export type SalaryBasis = "monthly" | "daily" | "hourly" | "contract" | "milestone";

export interface PayrollPolicy {
  id: number | null;
  companyId: number;
  salaryCalculationMode: SalaryCalculationMode;
  defaultWorkingDaysPolicy: string;
  weekendDays: string[];
  roundingPolicy: string;
  dailyRatePrecision: number;
  hourlyRatePrecision: number;
  overtimePolicyMode: string;
  deductionPolicyMode: string;
  unpaidLeavePolicy: string;
  latenessDeductionPolicy: string;
  earlyLeaveDeductionPolicy: string;
  applyAttendanceToPayroll: boolean;
  applyOvertimeToPayroll: boolean;
  workingHoursPerDay: number;
  manualWorkingDaysPerMonth: number | null;
  policyEffectiveFrom: string;
  labelAr: string;
  labelEn: string;
  notesAr: string | null;
  notesEn: string | null;
}

export interface EmploymentTypeRule {
  id: number | null;
  companyId: number;
  employmentType: string;
  salaryBasis: SalaryBasis;
  attendanceRequired: boolean;
  overtimeEligible: boolean;
  leaveEligible: boolean;
  deductionEligible: boolean;
  payrollIncluded: boolean;
  calculationModeOverride: SalaryCalculationMode | null;
  defaultHoursPerDay: number;
  labelAr: string;
  labelEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isActive: boolean;
}

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  full_time: { ar: "دوام كامل", en: "Full time" },
  part_time: { ar: "دوام جزئي", en: "Part time" },
  freelance: { ar: "مستقل", en: "Freelance" },
  contractor: { ar: "متعاقد", en: "Contractor" },
  intern: { ar: "متدرب", en: "Intern" },
};

const DEFAULT_RULES: Record<string, Omit<EmploymentTypeRule, "id" | "companyId">> = {
  full_time: {
    employmentType: "full_time", salaryBasis: "monthly", attendanceRequired: true, overtimeEligible: true,
    leaveEligible: true, deductionEligible: true, payrollIncluded: true, calculationModeOverride: null,
    defaultHoursPerDay: 8, labelAr: TYPE_LABELS.full_time.ar, labelEn: TYPE_LABELS.full_time.en,
    descriptionAr: "راتب شهري مع حضور وإجازات ورواتب كاملة", descriptionEn: "Monthly payroll with attendance, leave, and deductions", isActive: true,
  },
  part_time: {
    employmentType: "part_time", salaryBasis: "hourly", attendanceRequired: true, overtimeEligible: true,
    leaveEligible: false, deductionEligible: true, payrollIncluded: true, calculationModeOverride: "hourly",
    defaultHoursPerDay: 8, labelAr: TYPE_LABELS.part_time.ar, labelEn: TYPE_LABELS.part_time.en,
    descriptionAr: "احتساب بالساعة أو اليوم حسب الحضور الفعلي", descriptionEn: "Hourly or daily payroll based on actual work", isActive: true,
  },
  freelance: {
    employmentType: "freelance", salaryBasis: "milestone", attendanceRequired: false, overtimeEligible: false,
    leaveEligible: false, deductionEligible: false, payrollIncluded: true, calculationModeOverride: null,
    defaultHoursPerDay: 8, labelAr: TYPE_LABELS.freelance.ar, labelEn: TYPE_LABELS.freelance.en,
    descriptionAr: "دفعات تعاقدية أو إنجازات بدون حضور إلزامي", descriptionEn: "Contract or milestone payments without mandatory attendance", isActive: true,
  },
  contractor: {
    employmentType: "contractor", salaryBasis: "contract", attendanceRequired: false, overtimeEligible: true,
    leaveEligible: false, deductionEligible: true, payrollIncluded: true, calculationModeOverride: null,
    defaultHoursPerDay: 8, labelAr: TYPE_LABELS.contractor.ar, labelEn: TYPE_LABELS.contractor.en,
    descriptionAr: "احتساب تعاقدي أو بالساعة حسب الاتفاق", descriptionEn: "Contract or hourly payment based on agreement", isActive: true,
  },
  intern: {
    employmentType: "intern", salaryBasis: "monthly", attendanceRequired: true, overtimeEligible: false,
    leaveEligible: true, deductionEligible: false, payrollIncluded: true, calculationModeOverride: null,
    defaultHoursPerDay: 8, labelAr: TYPE_LABELS.intern.ar, labelEn: TYPE_LABELS.intern.en,
    descriptionAr: "مكافأة شهرية أو تدريب غير مدفوع حسب السياسة", descriptionEn: "Monthly stipend or unpaid internship by policy", isActive: true,
  },
};

function camel(row: any): any {
  if (!row) return row;
  const out: any = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())] = value;
  }
  return out;
}

export function normalizeEmploymentType(type: string | null | undefined): string {
  const raw = String(type || "full_time").toLowerCase();
  if (raw === "fulltime" || raw === "full-time") return "full_time";
  if (raw === "parttime" || raw === "part-time") return "part_time";
  if (raw === "temporary") return "contractor";
  return TYPE_LABELS[raw] ? raw : "full_time";
}

export function defaultPayrollPolicy(companyId: number): PayrollPolicy {
  return {
    id: null,
    companyId,
    salaryCalculationMode: "fixed_30",
    defaultWorkingDaysPolicy: "company_calendar",
    weekendDays: ["fri", "sat"],
    roundingPolicy: "nearest_0_001",
    dailyRatePrecision: 3,
    hourlyRatePrecision: 3,
    overtimePolicyMode: "policy_rules",
    deductionPolicyMode: "policy_rules",
    unpaidLeavePolicy: "deduct_daily_rate",
    latenessDeductionPolicy: "none",
    earlyLeaveDeductionPolicy: "none",
    applyAttendanceToPayroll: false,
    applyOvertimeToPayroll: true,
    workingHoursPerDay: 8,
    manualWorkingDaysPerMonth: null,
    policyEffectiveFrom: new Date().toISOString(),
    labelAr: "سياسة الرواتب الأساسية",
    labelEn: "Default payroll policy",
    notesAr: null,
    notesEn: null,
  };
}

function normalizePolicy(row: any, companyId: number): PayrollPolicy {
  if (!row) return defaultPayrollPolicy(companyId);
  const data = camel(row);
  return {
    ...defaultPayrollPolicy(companyId),
    ...data,
    weekendDays: Array.isArray(data.weekendDays) ? data.weekendDays : ["fri", "sat"],
    workingHoursPerDay: Number(data.workingHoursPerDay || 8),
    manualWorkingDaysPerMonth: data.manualWorkingDaysPerMonth == null ? null : Number(data.manualWorkingDaysPerMonth),
    dailyRatePrecision: Number(data.dailyRatePrecision ?? 3),
    hourlyRatePrecision: Number(data.hourlyRatePrecision ?? 3),
  };
}

function defaultRule(companyId: number, employmentType: string): EmploymentTypeRule {
  const normalized = normalizeEmploymentType(employmentType);
  return { id: null, companyId, ...DEFAULT_RULES[normalized] };
}

function normalizeRule(row: any, companyId: number, employmentType: string): EmploymentTypeRule {
  if (!row) return defaultRule(companyId, employmentType);
  const data = camel(row);
  return {
    ...defaultRule(companyId, employmentType),
    ...data,
    defaultHoursPerDay: Number(data.defaultHoursPerDay || 8),
  };
}

export async function resolvePayrollPolicy(companyId: number): Promise<PayrollPolicy> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM payroll_policies WHERE company_id=$1 AND is_deleted=false ORDER BY is_active DESC, policy_effective_from DESC, id DESC LIMIT 1`,
      [companyId],
    );
    return normalizePolicy(rows[0], companyId);
  } catch (error: any) {
    if (error?.code === "42P01") return defaultPayrollPolicy(companyId);
    throw error;
  }
}

export async function resolveEmploymentTypeRules(companyId: number): Promise<EmploymentTypeRule[]> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM payroll_employment_type_rules WHERE company_id=$1 AND is_deleted=false ORDER BY employment_type`,
      [companyId],
    );
    const byType = new Map(rows.map((r: any) => [r.employment_type, normalizeRule(r, companyId, r.employment_type)]));
    return Object.keys(DEFAULT_RULES).map(type => byType.get(type) || defaultRule(companyId, type));
  } catch (error: any) {
    if (error?.code === "42P01") return Object.keys(DEFAULT_RULES).map(type => defaultRule(companyId, type));
    throw error;
  }
}

export async function resolveEmploymentTypeRule(companyId: number, employmentType: string): Promise<EmploymentTypeRule> {
  const normalized = normalizeEmploymentType(employmentType);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM payroll_employment_type_rules WHERE company_id=$1 AND employment_type=$2 AND is_deleted=false LIMIT 1`,
      [companyId, normalized],
    );
    return normalizeRule(rows[0], companyId, normalized);
  } catch (error: any) {
    if (error?.code === "42P01") return defaultRule(companyId, normalized);
    throw error;
  }
}

export function actualMonthDays(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function countWorkingDays(month: number, year: number, weekendDays: string[], holidays: string[] = []): number {
  const byDay = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const weekends = new Set(weekendDays);
  const holidaySet = new Set(holidays);
  const days = actualMonthDays(month, year);
  let count = 0;
  for (let day = 1; day <= days; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!weekends.has(byDay[d.getUTCDay()]) && !holidaySet.has(iso)) count++;
  }
  return Math.max(count, 1);
}

export async function countCompanyHolidays(companyId: number, month: number, year: number): Promise<string[]> {
  try {
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to = `${year}-${String(month).padStart(2, "0")}-${String(actualMonthDays(month, year)).padStart(2, "0")}`;
    const { rows } = await pool.query(
      `SELECT holiday_date::text AS holiday_date FROM public_holidays WHERE company_id=$1 AND holiday_date BETWEEN $2 AND $3 AND COALESCE(is_deleted,false)=false`,
      [companyId, from, to],
    );
    return rows.map((r: any) => String(r.holiday_date).slice(0, 10));
  } catch (error: any) {
    if (error?.code === "42P01" || error?.code === "42703") return [];
    throw error;
  }
}

export async function workedHoursForEmployee(companyId: number, employeeId: number, month: number, year: number): Promise<number> {
  try {
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to = `${year}-${String(month).padStart(2, "0")}-${String(actualMonthDays(month, year)).padStart(2, "0")}`;
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(
        CASE
          WHEN check_in IS NOT NULL AND check_out IS NOT NULL THEN EXTRACT(EPOCH FROM (check_out - check_in)) / 3600.0
          WHEN work_hours IS NOT NULL THEN work_hours::numeric
          ELSE 0
        END
      ), 0)::numeric AS hours
      FROM attendance_records ar
      JOIN employees e ON e.id=ar.employee_id AND e.company_id=$1
      WHERE ar.employee_id=$2 AND ar.date BETWEEN $3 AND $4`,
      [companyId, employeeId, from, to],
    );
    return Number(rows[0]?.hours || 0);
  } catch (error: any) {
    if (error?.code === "42P01" || error?.code === "42703") return 0;
    throw error;
  }
}

export async function resolvePayrollPeriodContext(companyId: number, month: number, year: number, employmentType: string) {
  const [policy, rule] = await Promise.all([
    resolvePayrollPolicy(companyId),
    resolveEmploymentTypeRule(companyId, employmentType),
  ]);
  const holidays = await countCompanyHolidays(companyId, month, year);
  const actualDays = actualMonthDays(month, year);
  const workingDays = countWorkingDays(month, year, policy.weekendDays, holidays);
  const selectedMode = rule.calculationModeOverride || policy.salaryCalculationMode;
  const divisorDays =
    selectedMode === "fixed_30" ? 30 :
    selectedMode === "actual_calendar_days" ? actualDays :
    selectedMode === "working_days_only" ? workingDays :
    (policy.manualWorkingDaysPerMonth || workingDays || 30);
  const hoursPerDay = rule.defaultHoursPerDay || policy.workingHoursPerDay || 8;
  return { policy, rule, actualDays, workingDays, holidays: holidays.length, selectedMode, divisorDays, hoursPerDay };
}

export function roundMoney(value: number, policy: PayrollPolicy): number {
  if (policy.roundingPolicy === "truncate_0_001") return Math.trunc(value * 1000) / 1000;
  if (policy.roundingPolicy === "nearest_0_05") return Math.round(value / 0.05) * 0.05;
  if (policy.roundingPolicy === "nearest_0_01") return Math.round(value * 100) / 100;
  return Math.round(value * 1000) / 1000;
}

export function computePolicyRates(monthlySalary: number, context: { divisorDays: number; hoursPerDay: number; policy: PayrollPolicy }) {
  const dailyRate = roundMoney(monthlySalary / Math.max(context.divisorDays, 1), context.policy);
  const hourlyRate = roundMoney(dailyRate / Math.max(context.hoursPerDay, 1), context.policy);
  return { dailyRate, hourlyRate };
}

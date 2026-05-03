// ─── Salary Calculation Service ───────────────────────────────────────────────
// Pure calculation logic — no DB access, no side effects.
// All monetary values in milli-JOD integers to avoid floating-point drift.
// ─────────────────────────────────────────────────────────────────────────────

export interface SalaryComponentConfig {
  id: number;
  code: string;
  componentType: string;          // 'earning' | 'deduction'
  calculationType: string;        // 'fixed' | 'percentage' | 'formula'
  defaultValue: string;           // decimal string (JOD)
  formulaExpression: string | null;
  percentageBase: string | null;  // 'basic' | 'gross' | null
  isTaxable: boolean;
  isSscApplicable: boolean;
  isRecurring: boolean;
  sortOrder: number;
}

export interface EmployeeComponentAssignment {
  component: SalaryComponentConfig;
  overrideValue: string | null;
}

export interface TaxBracket {
  from: number;   // JOD lower bound (inclusive)
  to: number;     // JOD upper bound (exclusive for last = very large)
  rate: number;   // decimal, e.g. 0.05 for 5%
}

export interface PayrollConfig {
  sscEmployeeRate: number;          // e.g. 0.075
  sscEmployerRate: number;          // e.g. 0.1425
  sscInsurableCapJOD: number;       // e.g. 3000
  workingHoursPerDay: number;       // e.g. 8
  workingDaysPerMonth: number;      // e.g. 30
  overtimeRateWeekday: number;      // e.g. 1.5
  overtimeRateWeekend: number;      // e.g. 2.0
  taxBrackets: TaxBracket[];
  incomeTaxPersonalExemptionJOD: number; // e.g. 9000 annual
  incomeTaxFamilyExemptionJOD: number;   // e.g. 500 annual
}

export interface CalculatedDeductions {
  sscEmployeeM: number;
  sscEmployerM: number;
  incomeTaxM: number;
  componentDeductionsM: number;
  totalM: number;
}

export interface ComponentCalculationResult {
  code: string;
  nameEn: string;
  componentType: string;
  calculationType: string;
  calculatedValueM: number;
  overrideApplied: boolean;
}

// ─── Formula Parser (recursive descent, NOT eval/Function) ────────────────────

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function tokenise(expr: string, vars: Record<string, number>): Token[] | null {
  // Substitute variable names first
  const substituted = expr.replace(/\b(basic|gross|hours|rate|days)\b/g, (_, v) => {
    const n = vars[v] ?? 0;
    return String(n);
  });

  // Validate: only digits, decimal points, whitespace, operators and parens allowed
  if (!/^[\d\s\.\+\-\*\/\(\)]+$/.test(substituted)) {
    console.warn(`[SalaryCalc] Formula rejected — invalid characters after substitution: "${substituted}"`);
    return null;
  }

  const tokens: Token[] = [];
  let i = 0;
  while (i < substituted.length) {
    const ch = substituted[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(substituted[i + 1] ?? ''))) {
      let num = '';
      while (i < substituted.length && (/\d/.test(substituted[i]) || substituted[i] === '.')) {
        num += substituted[i++];
      }
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch as any });
      i++; continue;
    }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    console.warn(`[SalaryCalc] Unexpected character "${ch}" in formula`);
    return null;
  }
  return tokens;
}

// Recursive descent: expr → term (('+' | '-') term)*
//                   term → factor (('*' | '/') factor)*
//                   factor → num | '(' expr ')'
function parseExpr(tokens: Token[], pos: { i: number }): number {
  let val = parseTerm(tokens, pos);
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];
    if (tok.type !== 'op' || (tok.value !== '+' && tok.value !== '-')) break;
    pos.i++;
    const right = parseTerm(tokens, pos);
    val = tok.value === '+' ? val + right : val - right;
  }
  return val;
}

function parseTerm(tokens: Token[], pos: { i: number }): number {
  let val = parseFactor(tokens, pos);
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];
    if (tok.type !== 'op' || (tok.value !== '*' && tok.value !== '/')) break;
    pos.i++;
    const right = parseFactor(tokens, pos);
    val = tok.value === '*' ? val * right : (right === 0 ? 0 : val / right);
  }
  return val;
}

function parseFactor(tokens: Token[], pos: { i: number }): number {
  if (pos.i >= tokens.length) return 0;
  const tok = tokens[pos.i];
  if (tok.type === 'num') { pos.i++; return tok.value; }
  if (tok.type === 'lparen') {
    pos.i++;
    const val = parseExpr(tokens, pos);
    if (pos.i < tokens.length && tokens[pos.i].type === 'rparen') pos.i++;
    return val;
  }
  if (tok.type === 'op' && tok.value === '-') {
    pos.i++;
    return -parseFactor(tokens, pos);
  }
  return 0;
}

/**
 * Evaluate a safe formula expression.
 * Allowed variables: basic, gross, hours, rate, days (all in JOD, not milli).
 * Returns result in JOD (not milli). Returns 0 on any parse/validation failure.
 */
export function evaluateSafeFormula(
  expression: string,
  variables: Record<string, number>,
): number {
  if (!expression || !expression.trim()) return 0;
  try {
    const tokens = tokenise(expression.trim(), variables);
    if (!tokens) return 0;
    const result = parseExpr(tokens, { i: 0 });
    if (!isFinite(result)) return 0;
    return result;
  } catch (err) {
    console.warn(`[SalaryCalc] Formula evaluation error: ${err}`);
    return 0;
  }
}

// ─── toM / fromM helpers (internal) ──────────────────────────────────────────

function toM(jod: string | number): number {
  return Math.round(parseFloat(String(jod)) * 1000);
}

export function fromM(milliJod: number): string {
  return (Math.round(milliJod) / 1000).toFixed(3);
}

// ─── Component calculation ────────────────────────────────────────────────────

/**
 * Calculate the milli-JOD value of a single salary component.
 * @param component  The catalog component definition
 * @param overrideValue  The employee-specific override (JOD string), or null
 * @param basicJOD   Employee's gross basic salary (JOD) — used as percentage base
 * @param currentGrossJOD  Running gross total (JOD) — used when percentageBase='gross'
 * @param extraVars  Extra variables for formula evaluation (hours, rate, etc.)
 */
export function calculateComponentValueM(
  component: SalaryComponentConfig,
  overrideValue: string | null,
  basicJOD: number,
  currentGrossJOD: number,
  extraVars: Record<string, number> = {},
): number {
  const type = component.calculationType;

  if (type === 'fixed') {
    const val = overrideValue ?? component.defaultValue;
    return toM(val);
  }

  if (type === 'percentage') {
    // If an employee-specific override exists, treat it as an absolute JOD amount
    // (e.g. the employee receives exactly 200 JOD housing instead of 25% of basic).
    // Only the catalog defaultValue is a percentage.
    if (overrideValue !== null && overrideValue !== undefined) {
      return toM(overrideValue);
    }
    const pct = parseFloat(component.defaultValue);
    const base = component.percentageBase === 'gross' ? currentGrossJOD : basicJOD;
    return Math.round((pct / 100) * base * 1000);
  }

  if (type === 'formula') {
    const expr = component.formulaExpression ?? '';
    const vars: Record<string, number> = {
      basic: basicJOD,
      gross: currentGrossJOD,
      ...extraVars,
    };
    const resultJOD = evaluateSafeFormula(expr, vars);
    return toM(resultJOD);
  }

  return 0;
}

// ─── Gross calculation ────────────────────────────────────────────────────────

export interface GrossResult {
  totalM: number;
  breakdown: ComponentCalculationResult[];
}

/**
 * Calculate total gross salary (earnings only) in milli-JOD.
 * Components processed in ascending sort_order.
 * basicM is used as the base for percentage components on 'basic'.
 */
export function calculateGross(
  assignments: EmployeeComponentAssignment[],
  extraVars: Record<string, number> = {},
): GrossResult {
  const earnings = assignments
    .filter(a => a.component.componentType === 'earning')
    .sort((a, b) => a.component.sortOrder - b.component.sortOrder);

  let totalM = 0;
  let basicJOD = 0;
  const breakdown: ComponentCalculationResult[] = [];

  for (const asgn of earnings) {
    const currentGrossJOD = totalM / 1000;
    const valueM = calculateComponentValueM(
      asgn.component,
      asgn.overrideValue,
      basicJOD,
      currentGrossJOD,
      extraVars,
    );
    // Track basic salary so percentage components can reference it
    if (asgn.component.code === 'BASIC') {
      basicJOD = valueM / 1000;
    }
    totalM += valueM;
    breakdown.push({
      code: asgn.component.code,
      nameEn: (asgn.component as any).nameEn ?? asgn.component.code,
      componentType: asgn.component.componentType,
      calculationType: asgn.component.calculationType,
      calculatedValueM: valueM,
      overrideApplied: asgn.overrideValue !== null,
    });
  }

  return { totalM, breakdown };
}

// ─── Progressive income tax ───────────────────────────────────────────────────

/**
 * Apply Jordan progressive tax brackets to an annual taxable amount (JOD).
 * Returns annual tax in JOD.
 */
export function applyBrackets(taxableAnnualJOD: number, brackets: TaxBracket[]): number {
  const sorted = [...brackets].sort((a, b) => a.from - b.from);
  let tax = 0;
  for (const b of sorted) {
    if (taxableAnnualJOD <= b.from) break;
    const slice = Math.min(taxableAnnualJOD, b.to) - b.from;
    tax += slice * b.rate;
  }
  return tax;
}

// ─── Deductions ───────────────────────────────────────────────────────────────

/**
 * Calculate all deductions for an employee.
 * @param assignments  All component assignments (earnings + deductions)
 * @param grossM       Gross salary in milli-JOD (earnings only, incl. OT)
 * @param basicM       Basic salary in milli-JOD (for SSC base)
 * @param config       Payroll configuration
 * @param isSSCExempt  Whether to skip SSC
 * @param taxExemptionAmountJOD  Employee-specific additional tax exemption (JOD)
 * @param hasFamily    Whether the employee has a family (for family exemption)
 */
export function calculateDeductions(
  assignments: EmployeeComponentAssignment[],
  grossM: number,
  basicM: number,
  config: PayrollConfig,
  isSSCExempt: boolean,
  taxExemptionAmountJOD: number,
  hasFamily: boolean,
): CalculatedDeductions {
  // ─── SSC ─────────────────────────────────────────────────────────────────
  const sscCapM = toM(config.sscInsurableCapJOD);
  const insurableM = Math.min(basicM, sscCapM);
  const sscEmployeeM = isSSCExempt ? 0 : Math.round(insurableM * config.sscEmployeeRate);
  const sscEmployerM = isSSCExempt ? 0 : Math.round(insurableM * config.sscEmployerRate);

  // ─── Income Tax ───────────────────────────────────────────────────────────
  const annualGrossJOD = (grossM - sscEmployeeM) * 12 / 1000;
  const personalExemption = config.incomeTaxPersonalExemptionJOD;
  const familyExemption = hasFamily ? config.incomeTaxFamilyExemptionJOD : 0;
  const taxableAnnualJOD = Math.max(0, annualGrossJOD - personalExemption - familyExemption - taxExemptionAmountJOD);
  const annualTaxJOD = applyBrackets(taxableAnnualJOD, config.taxBrackets);
  const incomeTaxM = Math.round(annualTaxJOD * 1000 / 12);

  // ─── Component deductions (loans, penalties, etc.) ────────────────────────
  const deductions = assignments
    .filter(a => a.component.componentType === 'deduction')
    .sort((a, b) => a.component.sortOrder - b.component.sortOrder);

  let componentDeductionsM = 0;
  // Use gross / 1000 as currentGrossJOD for deduction calculation context
  const basicJOD = basicM / 1000;
  for (const asgn of deductions) {
    componentDeductionsM += calculateComponentValueM(
      asgn.component,
      asgn.overrideValue,
      basicJOD,
      grossM / 1000,
    );
  }

  const totalM = sscEmployeeM + incomeTaxM + componentDeductionsM;

  return { sscEmployeeM, sscEmployerM, incomeTaxM, componentDeductionsM, totalM };
}

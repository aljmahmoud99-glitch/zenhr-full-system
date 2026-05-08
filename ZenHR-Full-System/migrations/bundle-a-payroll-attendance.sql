-- Bundle A - Payroll & Attendance Core Expansion
-- Additive only. Safe for manual execution.

BEGIN;

CREATE TABLE IF NOT EXISTS payroll_adjustment_types (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  category VARCHAR(40) NOT NULL CHECK (category IN ('earning','deduction','reimbursement','correction','penalty')),
  default_calculation_mode VARCHAR(40) NOT NULL DEFAULT 'after_net' CHECK (default_calculation_mode IN ('before_gross','before_tax','after_tax','after_net')),
  affects_tax BOOLEAN NOT NULL DEFAULT FALSE,
  affects_ssc BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS payroll_adjustment_batches (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  batch_number VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255),
  name_en VARCHAR(255),
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  run_month INTEGER,
  run_year INTEGER,
  status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected','applied','cancelled')),
  total_amount NUMERIC(14,3) NOT NULL DEFAULT 0,
  adjustment_count INTEGER NOT NULL DEFAULT 0,
  notes_ar TEXT,
  notes_en TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, batch_number)
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  adjustment_number VARCHAR(80) NOT NULL,
  batch_id BIGINT REFERENCES payroll_adjustment_batches(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  department_id INTEGER REFERENCES departments(id),
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  payslip_id INTEGER REFERENCES payslips(id),
  adjustment_type_id BIGINT NOT NULL REFERENCES payroll_adjustment_types(id),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('add','deduct')),
  calculation_mode VARCHAR(40) NOT NULL CHECK (calculation_mode IN ('before_gross','before_tax','after_tax','after_net')),
  recurrence_type VARCHAR(40) NOT NULL DEFAULT 'one_time' CHECK (recurrence_type IN ('one_time','monthly','installments','date_range')),
  amount NUMERIC(14,3) NOT NULL CHECK (amount >= 0),
  currency_code VARCHAR(10) NOT NULL DEFAULT 'JOD',
  effective_date DATE NOT NULL,
  end_date DATE,
  payroll_month INTEGER,
  payroll_year INTEGER,
  installment_count INTEGER,
  installment_index INTEGER NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(14,3),
  source_type VARCHAR(80),
  source_id BIGINT,
  title_ar VARCHAR(255),
  title_en VARCHAR(255),
  reason_ar TEXT,
  reason_en TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected','applied','cancelled')),
  approval_step VARCHAR(40),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, adjustment_number)
);

CREATE TABLE IF NOT EXISTS payroll_adjustment_approvals (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  payroll_adjustment_id BIGINT NOT NULL REFERENCES payroll_adjustments(id),
  step_order INTEGER NOT NULL,
  approver_role VARCHAR(40) NOT NULL,
  approver_user_id INTEGER REFERENCES users(id),
  decision VARCHAR(40) NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected','skipped')),
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, payroll_adjustment_id, step_order)
);

CREATE TABLE IF NOT EXISTS payroll_adjustment_history (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  payroll_adjustment_id BIGINT NOT NULL REFERENCES payroll_adjustments(id),
  action_type VARCHAR(80) NOT NULL,
  before_json JSONB,
  after_json JSONB,
  notes TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_adjustment_documents (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  payroll_adjustment_id BIGINT NOT NULL REFERENCES payroll_adjustments(id),
  file_object_id BIGINT REFERENCES file_objects(id),
  document_type VARCHAR(80) NOT NULL DEFAULT 'supporting_document',
  file_name VARCHAR(255),
  file_url TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS attendance_shift_patterns (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  shift_type VARCHAR(40) NOT NULL DEFAULT 'fixed' CHECK (shift_type IN ('fixed','rotating','overnight','flexible')),
  start_time TIME,
  end_time TIME,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  grace_in_minutes INTEGER NOT NULL DEFAULT 10,
  grace_out_minutes INTEGER NOT NULL DEFAULT 10,
  weekly_days_json JSONB NOT NULL DEFAULT '["sun","mon","tue","wed","thu"]'::jsonb,
  overtime_after_minutes INTEGER NOT NULL DEFAULT 480,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS attendance_schedules (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER REFERENCES employees(id),
  department_id INTEGER REFERENCES departments(id),
  shift_pattern_id BIGINT NOT NULL REFERENCES attendance_shift_patterns(id),
  schedule_date DATE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  source VARCHAR(40) NOT NULL DEFAULT 'employee' CHECK (source IN ('company','department','employee')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS attendance_violations (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_record_id INTEGER REFERENCES attendance_records(id),
  violation_type VARCHAR(80) NOT NULL CHECK (violation_type IN ('late','early_leave','absence','missing_in','missing_out','shift_mismatch','overtime_excess')),
  violation_date DATE NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  severity VARCHAR(30) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  payroll_impact_amount NUMERIC(14,3) NOT NULL DEFAULT 0,
  auto_penalty_adjustment_id BIGINT REFERENCES payroll_adjustments(id),
  status VARCHAR(40) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','waived','penalized','closed')),
  notes_ar TEXT,
  notes_en TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS attendance_payroll_impacts (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  payslip_id INTEGER REFERENCES payslips(id),
  attendance_violation_id BIGINT REFERENCES attendance_violations(id),
  overtime_request_id INTEGER REFERENCES overtime_requests(id),
  impact_type VARCHAR(80) NOT NULL CHECK (impact_type IN ('lateness_deduction','absence_deduction','overtime_earning','shift_allowance','holiday_overtime','penalty')),
  amount NUMERIC(14,3) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('add','deduct')),
  calculation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','applied','waived','cancelled')),
  applied_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS payroll_audit_events (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  payslip_id INTEGER REFERENCES payslips(id),
  employee_id INTEGER REFERENCES employees(id),
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  event_type VARCHAR(80) NOT NULL,
  before_json JSONB,
  after_json JSONB,
  actor_user_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_adjustment_installments (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  payroll_adjustment_id BIGINT NOT NULL REFERENCES payroll_adjustments(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  installment_no INTEGER NOT NULL,
  due_month INTEGER NOT NULL,
  due_year INTEGER NOT NULL,
  amount NUMERIC(14,3) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','skipped','cancelled')),
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  payslip_id INTEGER REFERENCES payslips(id),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, payroll_adjustment_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_payroll_adj_company_status ON payroll_adjustments(company_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_employee_period ON payroll_adjustments(company_id, employee_id, payroll_year, payroll_month);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_type ON payroll_adjustments(company_id, adjustment_type_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_recurring ON payroll_adjustments(company_id, recurrence_type, effective_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_approvals_pending ON payroll_adjustment_approvals(company_id, approver_role, decision);
CREATE INDEX IF NOT EXISTS idx_attendance_schedules_scope ON attendance_schedules(company_id, employee_id, department_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_attendance_violations_scope ON attendance_violations(company_id, employee_id, violation_date, status);
CREATE INDEX IF NOT EXISTS idx_attendance_impacts_period ON attendance_payroll_impacts(company_id, employee_id, payroll_run_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_company_created ON payroll_audit_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_installments_due ON payroll_adjustment_installments(company_id, due_year, due_month, status);

INSERT INTO payroll_adjustment_types (company_id, code, name_ar, name_en, category, default_calculation_mode, affects_tax, affects_ssc, is_system)
SELECT c.id, v.code, v.name_ar, v.name_en, v.category, v.mode, v.tax, v.ssc, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('BONUS', 'مكافأة', 'Bonus', 'earning', 'after_tax', false, false),
  ('DEDUCTION', 'خصم', 'Deduction', 'deduction', 'after_tax', false, false),
  ('ALLOWANCE', 'بدل', 'Allowance', 'earning', 'before_tax', true, true),
  ('REIMBURSEMENT', 'تعويض مصروفات', 'Reimbursement', 'reimbursement', 'after_net', false, false),
  ('SALARY_CORRECTION', 'تصحيح راتب', 'Salary Correction', 'correction', 'after_net', false, false),
  ('PENALTY', 'جزاء', 'Penalty', 'penalty', 'after_net', false, false),
  ('LOAN_DEDUCTION', 'خصم قرض', 'Loan Deduction', 'deduction', 'after_net', false, false),
  ('OVERTIME_CORRECTION', 'تصحيح عمل إضافي', 'Overtime Correction', 'correction', 'after_tax', false, false),
  ('COMMISSION', 'عمولة', 'Commission', 'earning', 'before_tax', true, false),
  ('RETROACTIVE', 'أثر رجعي', 'Retroactive Adjustment', 'correction', 'after_net', false, false)
) AS v(code, name_ar, name_en, category, mode, tax, ssc)
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO attendance_shift_patterns (company_id, code, name_ar, name_en, shift_type, start_time, end_time, break_minutes, grace_in_minutes, grace_out_minutes)
SELECT c.id, 'STANDARD-09-17', 'الدوام القياسي 9-5', 'Standard 9-5', 'fixed', '09:00', '17:00', 60, 10, 10
FROM companies c
ON CONFLICT (company_id, code) DO NOTHING;

COMMIT;

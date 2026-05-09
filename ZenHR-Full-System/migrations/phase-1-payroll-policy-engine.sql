-- Phase 1 Payroll Policy Engine
-- Standalone additive migration. Do not apply automatically.

CREATE TABLE IF NOT EXISTS payroll_policies (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  salary_calculation_mode VARCHAR(40) NOT NULL DEFAULT 'fixed_30'
    CHECK (salary_calculation_mode IN ('fixed_30','actual_calendar_days','working_days_only','hourly')),
  default_working_days_policy VARCHAR(40) NOT NULL DEFAULT 'company_calendar'
    CHECK (default_working_days_policy IN ('company_calendar','fixed_30','manual')),
  weekend_days JSONB NOT NULL DEFAULT '["fri","sat"]'::jsonb,
  rounding_policy VARCHAR(40) NOT NULL DEFAULT 'nearest_0_001'
    CHECK (rounding_policy IN ('nearest_0_001','nearest_0_01','nearest_0_05','truncate_0_001')),
  daily_rate_precision INTEGER NOT NULL DEFAULT 3 CHECK (daily_rate_precision BETWEEN 0 AND 6),
  hourly_rate_precision INTEGER NOT NULL DEFAULT 3 CHECK (hourly_rate_precision BETWEEN 0 AND 6),
  overtime_policy_mode VARCHAR(40) NOT NULL DEFAULT 'policy_rules'
    CHECK (overtime_policy_mode IN ('disabled','manual','policy_rules')),
  deduction_policy_mode VARCHAR(40) NOT NULL DEFAULT 'policy_rules'
    CHECK (deduction_policy_mode IN ('disabled','manual','policy_rules')),
  unpaid_leave_policy VARCHAR(40) NOT NULL DEFAULT 'deduct_daily_rate'
    CHECK (unpaid_leave_policy IN ('none','deduct_daily_rate','deduct_working_day_rate')),
  lateness_deduction_policy VARCHAR(40) NOT NULL DEFAULT 'none'
    CHECK (lateness_deduction_policy IN ('none','hourly_rate','minute_rate','fixed_penalty')),
  early_leave_deduction_policy VARCHAR(40) NOT NULL DEFAULT 'none'
    CHECK (early_leave_deduction_policy IN ('none','hourly_rate','minute_rate','fixed_penalty')),
  apply_attendance_to_payroll BOOLEAN NOT NULL DEFAULT false,
  apply_overtime_to_payroll BOOLEAN NOT NULL DEFAULT true,
  working_hours_per_day NUMERIC(8,3) NOT NULL DEFAULT 8 CHECK (working_hours_per_day > 0),
  manual_working_days_per_month NUMERIC(8,3) CHECK (manual_working_days_per_month IS NULL OR manual_working_days_per_month > 0),
  policy_effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  label_ar VARCHAR(200) NOT NULL DEFAULT 'سياسة الرواتب الأساسية',
  label_en VARCHAR(200) NOT NULL DEFAULT 'Default payroll policy',
  notes_ar TEXT,
  notes_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS payroll_employment_type_rules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employment_type VARCHAR(40) NOT NULL
    CHECK (employment_type IN ('full_time','part_time','freelance','contractor','intern')),
  salary_basis VARCHAR(40) NOT NULL DEFAULT 'monthly'
    CHECK (salary_basis IN ('monthly','daily','hourly','contract','milestone')),
  attendance_required BOOLEAN NOT NULL DEFAULT true,
  overtime_eligible BOOLEAN NOT NULL DEFAULT true,
  leave_eligible BOOLEAN NOT NULL DEFAULT true,
  deduction_eligible BOOLEAN NOT NULL DEFAULT true,
  payroll_included BOOLEAN NOT NULL DEFAULT true,
  calculation_mode_override VARCHAR(40)
    CHECK (calculation_mode_override IS NULL OR calculation_mode_override IN ('fixed_30','actual_calendar_days','working_days_only','hourly')),
  default_hours_per_day NUMERIC(8,3) NOT NULL DEFAULT 8 CHECK (default_hours_per_day > 0),
  label_ar VARCHAR(200) NOT NULL,
  label_en VARCHAR(200) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT payroll_employment_type_rules_company_type_uniq UNIQUE (company_id, employment_type)
);

CREATE TABLE IF NOT EXISTS payroll_policy_history (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  policy_id INTEGER REFERENCES payroll_policies(id),
  employment_type_rule_id INTEGER REFERENCES payroll_employment_type_rules(id),
  entity_type VARCHAR(40) NOT NULL CHECK (entity_type IN ('policy','employment_type_rule')),
  action VARCHAR(40) NOT NULL CHECK (action IN ('created','updated','activated','deactivated')),
  previous_value JSONB,
  new_value JSONB NOT NULL,
  reason_ar TEXT,
  reason_en TEXT,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payroll_policy_id INTEGER REFERENCES payroll_policies(id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payroll_policy_snapshot JSONB;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payroll_policy_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_payroll_policies_company_active
  ON payroll_policies(company_id, is_active, is_deleted);
CREATE INDEX IF NOT EXISTS idx_payroll_policies_effective
  ON payroll_policies(company_id, policy_effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_policies_company_current
  ON payroll_policies(company_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_payroll_employment_type_rules_company
  ON payroll_employment_type_rules(company_id, employment_type, is_active, is_deleted);
CREATE INDEX IF NOT EXISTS idx_payroll_policy_history_company
  ON payroll_policy_history(company_id, changed_at DESC);

INSERT INTO payroll_policies (
  company_id,
  salary_calculation_mode,
  default_working_days_policy,
  weekend_days,
  rounding_policy,
  daily_rate_precision,
  hourly_rate_precision,
  overtime_policy_mode,
  deduction_policy_mode,
  unpaid_leave_policy,
  lateness_deduction_policy,
  early_leave_deduction_policy,
  apply_attendance_to_payroll,
  apply_overtime_to_payroll,
  working_hours_per_day,
  label_ar,
  label_en,
  policy_effective_from
)
SELECT
  c.id,
  'fixed_30',
  'company_calendar',
  '["fri","sat"]'::jsonb,
  'nearest_0_001',
  3,
  3,
  'policy_rules',
  'policy_rules',
  'deduct_daily_rate',
  'none',
  'none',
  false,
  true,
  8,
  'سياسة الرواتب الأساسية',
  'Default payroll policy',
  NOW()
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_policies pp WHERE pp.company_id = c.id AND pp.is_deleted = false
)
ON CONFLICT DO NOTHING;

INSERT INTO payroll_employment_type_rules (
  company_id,
  employment_type,
  salary_basis,
  attendance_required,
  overtime_eligible,
  leave_eligible,
  deduction_eligible,
  payroll_included,
  calculation_mode_override,
  default_hours_per_day,
  label_ar,
  label_en,
  description_ar,
  description_en
)
SELECT c.id, v.employment_type, v.salary_basis, v.attendance_required, v.overtime_eligible,
       v.leave_eligible, v.deduction_eligible, v.payroll_included, v.calculation_mode_override,
       v.default_hours_per_day, v.label_ar, v.label_en, v.description_ar, v.description_en
FROM companies c
CROSS JOIN (VALUES
  ('full_time','monthly',true,true,true,true,true,NULL,8,'دوام كامل','Full time','راتب شهري مع حضور وإجازات ورواتب كاملة','Monthly payroll with attendance, leave, and deductions'),
  ('part_time','hourly',true,true,false,true,true,'hourly',8,'دوام جزئي','Part time','احتساب بالساعة أو اليوم حسب الحضور الفعلي','Hourly or daily payroll based on actual work'),
  ('freelance','milestone',false,false,false,false,true,NULL,8,'مستقل','Freelance','دفعات تعاقدية أو إنجازات بدون حضور إلزامي','Contract or milestone payments without mandatory attendance'),
  ('contractor','contract',false,true,false,true,true,NULL,8,'متعاقد','Contractor','احتساب تعاقدي أو بالساعة حسب الاتفاق','Contract or hourly payment based on agreement'),
  ('intern','monthly',true,false,true,false,true,NULL,8,'متدرب','Intern','مكافأة شهرية أو تدريب غير مدفوع حسب السياسة','Monthly stipend or unpaid internship by policy')
) AS v(employment_type, salary_basis, attendance_required, overtime_eligible, leave_eligible,
       deduction_eligible, payroll_included, calculation_mode_override, default_hours_per_day,
       label_ar, label_en, description_ar, description_en)
ON CONFLICT (company_id, employment_type) DO NOTHING;

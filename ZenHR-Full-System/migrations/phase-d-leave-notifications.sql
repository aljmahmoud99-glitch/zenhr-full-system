-- Phase D - Leave + Notifications Engine
-- Standalone additive migration. Do not apply automatically.

BEGIN;

ALTER TABLE IF EXISTS leave_requests
  ADD COLUMN IF NOT EXISTS company_id INTEGER,
  ADD COLUMN IF NOT EXISTS duration_unit VARCHAR(20) DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS half_day_part VARCHAR(20),
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS total_hours NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_approval_step VARCHAR(40) DEFAULT 'manager',
  ADD COLUMN IF NOT EXISTS cancellation_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS payroll_impact_type VARCHAR(40) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payroll_impact_amount NUMERIC(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by INTEGER,
  ADD COLUMN IF NOT EXISTS updated_by INTEGER;

UPDATE leave_requests lr
SET company_id = e.company_id
FROM employees e
WHERE lr.employee_id = e.id AND lr.company_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_company_id_fkey') THEN
    ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS enterprise_leave_types (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(40) NOT NULL,
  name_ar VARCHAR(160) NOT NULL,
  name_en VARCHAR(160) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  category VARCHAR(40) NOT NULL DEFAULT 'custom',
  color VARCHAR(30) NOT NULL DEFAULT '#2f8f6b',
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  allow_half_day BOOLEAN NOT NULL DEFAULT TRUE,
  allow_hourly BOOLEAN NOT NULL DEFAULT FALSE,
  requires_attachment BOOLEAN NOT NULL DEFAULT FALSE,
  requires_manager_approval BOOLEAN NOT NULL DEFAULT TRUE,
  requires_hr_approval BOOLEAN NOT NULL DEFAULT TRUE,
  affects_payroll BOOLEAN NOT NULL DEFAULT FALSE,
  payroll_impact_type VARCHAR(40) NOT NULL DEFAULT 'none',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT enterprise_leave_types_category_chk CHECK (category IN ('annual','sick','emergency','unpaid','custom')),
  CONSTRAINT enterprise_leave_types_payroll_impact_chk CHECK (payroll_impact_type IN ('none','deduct_daily_rate','deduct_hourly_rate'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_enterprise_leave_types_company_code
  ON enterprise_leave_types(company_id, lower(code))
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_enterprise_leave_types_company_active
  ON enterprise_leave_types(company_id, is_active, is_deleted);

CREATE TABLE IF NOT EXISTS leave_accrual_policies (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  leave_type_id INTEGER NOT NULL REFERENCES enterprise_leave_types(id),
  accrual_frequency VARCHAR(30) NOT NULL DEFAULT 'annual',
  entitlement_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  entitlement_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  accrual_rate_per_month NUMERIC(8,3) NOT NULL DEFAULT 0,
  min_service_months INTEGER NOT NULL DEFAULT 0,
  max_balance_days NUMERIC(8,2),
  carry_forward_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  carry_forward_max_days NUMERIC(8,2) NOT NULL DEFAULT 0,
  carry_forward_expiry_month INTEGER,
  include_weekends BOOLEAN NOT NULL DEFAULT FALSE,
  include_public_holidays BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT leave_accrual_frequency_chk CHECK (accrual_frequency IN ('annual','monthly','per_pay_period','manual'))
);

CREATE INDEX IF NOT EXISTS ix_leave_accrual_policies_company_type
  ON leave_accrual_policies(company_id, leave_type_id, is_active, is_deleted);

CREATE TABLE IF NOT EXISTS leave_request_approval_steps (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id),
  step_order INTEGER NOT NULL,
  approver_role VARCHAR(40) NOT NULL,
  approver_user_id INTEGER REFERENCES users(id),
  decision VARCHAR(30) NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT leave_request_step_decision_chk CHECK (decision IN ('pending','approved','rejected','changes_requested','skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_request_approval_steps_order
  ON leave_request_approval_steps(company_id, leave_request_id, step_order)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_leave_request_approval_steps_pending
  ON leave_request_approval_steps(company_id, approver_role, decision, is_deleted);

CREATE TABLE IF NOT EXISTS leave_request_audit_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  leave_request_id INTEGER REFERENCES leave_requests(id),
  actor_user_id INTEGER REFERENCES users(id),
  action VARCHAR(80) NOT NULL,
  before_json JSONB,
  after_json JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_leave_request_audit_company_request
  ON leave_request_audit_logs(company_id, leave_request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS leave_cancellations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id),
  requested_by INTEGER REFERENCES users(id),
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT leave_cancellations_status_chk CHECK (status IN ('pending','approved','rejected','cancelled'))
);

CREATE INDEX IF NOT EXISTS ix_leave_cancellations_company_request
  ON leave_cancellations(company_id, leave_request_id, status, is_deleted);

CREATE TABLE IF NOT EXISTS leave_payroll_impacts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  payslip_id INTEGER REFERENCES payslips(id),
  impact_type VARCHAR(40) NOT NULL,
  days NUMERIC(8,2) NOT NULL DEFAULT 0,
  hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  amount NUMERIC(14,3) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT leave_payroll_impacts_type_chk CHECK (impact_type IN ('none','unpaid_leave_deduction','reversal')),
  CONSTRAINT leave_payroll_impacts_status_chk CHECK (status IN ('pending','applied','reversed','ignored'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_payroll_impacts_request_run
  ON leave_payroll_impacts(company_id, leave_request_id, payroll_run_id)
  WHERE payroll_run_id IS NOT NULL AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_leave_payroll_impacts_employee_status
  ON leave_payroll_impacts(company_id, employee_id, status, is_deleted);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  notification_type VARCHAR(100) NOT NULL DEFAULT '*',
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, notification_type)
);

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  notification_id INTEGER REFERENCES notifications(id),
  channel VARCHAR(30) NOT NULL DEFAULT 'in_app',
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  provider_message_id VARCHAR(160),
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notification_delivery_channel_chk CHECK (channel IN ('in_app','email','sms','push')),
  CONSTRAINT notification_delivery_status_chk CHECK (status IN ('queued','sent','failed','skipped'))
);

CREATE INDEX IF NOT EXISTS ix_notification_delivery_logs_company_status
  ON notification_delivery_logs(company_id, status, attempted_at DESC);

INSERT INTO enterprise_leave_types
  (company_id, code, name_ar, name_en, category, color, is_paid, allow_half_day, allow_hourly, requires_attachment, affects_payroll, payroll_impact_type)
SELECT c.id, v.code, v.name_ar, v.name_en, v.category, v.color, v.is_paid, v.allow_half_day, v.allow_hourly, v.requires_attachment, v.affects_payroll, v.payroll_impact_type
FROM companies c
CROSS JOIN (VALUES
  ('ANNUAL', 'إجازة سنوية', 'Annual Leave', 'annual', '#2f8f6b', TRUE, TRUE, FALSE, FALSE, FALSE, 'none'),
  ('SICK', 'إجازة مرضية', 'Sick Leave', 'sick', '#3b82f6', TRUE, TRUE, TRUE, TRUE, FALSE, 'none'),
  ('EMERGENCY', 'إجازة طارئة', 'Emergency Leave', 'emergency', '#f59e0b', TRUE, TRUE, FALSE, FALSE, FALSE, 'none'),
  ('UNPAID', 'إجازة غير مدفوعة', 'Unpaid Leave', 'unpaid', '#ef4444', FALSE, TRUE, TRUE, FALSE, TRUE, 'deduct_daily_rate')
) AS v(code, name_ar, name_en, category, color, is_paid, allow_half_day, allow_hourly, requires_attachment, affects_payroll, payroll_impact_type)
WHERE NOT EXISTS (
  SELECT 1 FROM enterprise_leave_types elt
  WHERE elt.company_id = c.id AND lower(elt.code) = lower(v.code) AND elt.is_deleted = FALSE
);

INSERT INTO leave_accrual_policies
  (company_id, leave_type_id, accrual_frequency, entitlement_days, accrual_rate_per_month, carry_forward_allowed, carry_forward_max_days, include_weekends, include_public_holidays)
SELECT elt.company_id, elt.id,
  CASE WHEN elt.code = 'ANNUAL' THEN 'monthly' ELSE 'annual' END,
  CASE WHEN elt.code = 'ANNUAL' THEN 14 WHEN elt.code = 'SICK' THEN 14 WHEN elt.code = 'EMERGENCY' THEN 3 ELSE 0 END,
  CASE WHEN elt.code = 'ANNUAL' THEN 1.167 ELSE 0 END,
  CASE WHEN elt.code = 'ANNUAL' THEN TRUE ELSE FALSE END,
  CASE WHEN elt.code = 'ANNUAL' THEN 7 ELSE 0 END,
  FALSE,
  FALSE
FROM enterprise_leave_types elt
WHERE NOT EXISTS (
  SELECT 1 FROM leave_accrual_policies lap
  WHERE lap.company_id = elt.company_id AND lap.leave_type_id = elt.id AND lap.is_deleted = FALSE
);

CREATE INDEX IF NOT EXISTS ix_leave_requests_company_status
  ON leave_requests(company_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS ix_leave_requests_employee_dates
  ON leave_requests(employee_id, start_date, end_date, is_deleted);

COMMIT;

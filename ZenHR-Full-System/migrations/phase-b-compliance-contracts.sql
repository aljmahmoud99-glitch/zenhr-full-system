-- Phase B - Compliance + Contracts Engine
-- Additive-only migration. Safe to run manually on an existing ZenJO database.

CREATE TABLE IF NOT EXISTS contract_types (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  default_duration_months INTEGER,
  default_probation_days INTEGER DEFAULT 90,
  renewal_notice_days INTEGER DEFAULT 30,
  requires_attachment BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_contract_types_company_code_active
  ON contract_types(company_id, lower(code))
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_contract_types_company_active
  ON contract_types(company_id, is_active, is_deleted);

CREATE TABLE IF NOT EXISTS employee_contracts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  contract_type_id INTEGER NOT NULL REFERENCES contract_types(id),
  contract_number VARCHAR(120),
  title_ar VARCHAR(250) NOT NULL,
  title_en VARCHAR(250) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  probation_end_date DATE,
  renewal_notice_date DATE,
  renewal_status VARCHAR(40) NOT NULL DEFAULT 'not_required'
    CHECK (renewal_status IN ('not_required', 'pending_review', 'renewed', 'not_renewed', 'expired')),
  contract_status VARCHAR(40) NOT NULL DEFAULT 'active'
    CHECK (contract_status IN ('draft', 'active', 'pending_renewal', 'expired', 'terminated', 'superseded')),
  compliance_status VARCHAR(40) NOT NULL DEFAULT 'pending_review'
    CHECK (compliance_status IN ('compliant', 'warning', 'critical', 'missing_documents', 'pending_review')),
  auto_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  salary_amount NUMERIC(12,3),
  currency VARCHAR(10) NOT NULL DEFAULT 'JOD',
  notes_ar TEXT,
  notes_en TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT ck_employee_contract_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT ck_employee_contract_probation CHECK (probation_end_date IS NULL OR probation_end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_contracts_company_number_active
  ON employee_contracts(company_id, lower(contract_number))
  WHERE contract_number IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_employee_contracts_company_employee
  ON employee_contracts(company_id, employee_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_expiry
  ON employee_contracts(company_id, end_date, contract_status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_compliance
  ON employee_contracts(company_id, compliance_status, is_deleted);

CREATE TABLE IF NOT EXISTS contract_required_documents (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  contract_type_id INTEGER REFERENCES contract_types(id),
  contract_id INTEGER REFERENCES employee_contracts(id),
  document_code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  expires BOOLEAN NOT NULL DEFAULT FALSE,
  warning_days INTEGER DEFAULT 30,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_contract_required_documents_scope
  ON contract_required_documents(company_id, contract_type_id, contract_id, is_deleted);

CREATE TABLE IF NOT EXISTS contract_attachments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  contract_id INTEGER NOT NULL REFERENCES employee_contracts(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  document_id INTEGER REFERENCES documents(id),
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(800),
  mime_type VARCHAR(150),
  file_size BIGINT,
  attachment_type VARCHAR(80) NOT NULL DEFAULT 'contract',
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes_ar TEXT,
  notes_en TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_contract_attachments_contract
  ON contract_attachments(company_id, contract_id, is_deleted);

CREATE TABLE IF NOT EXISTS contract_audit_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  contract_id INTEGER REFERENCES employee_contracts(id),
  employee_id INTEGER REFERENCES employees(id),
  action VARCHAR(80) NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_contract_audit_logs_company_contract
  ON contract_audit_logs(company_id, contract_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_audit_logs_employee
  ON contract_audit_logs(company_id, employee_id, changed_at DESC);

INSERT INTO contract_types (
  company_id, code, name_ar, name_en, description_ar, description_en,
  default_duration_months, default_probation_days, renewal_notice_days,
  requires_attachment, created_at, updated_at
)
SELECT c.id, seed.code, seed.name_ar, seed.name_en, seed.description_ar, seed.description_en,
       seed.default_duration_months, seed.default_probation_days, seed.renewal_notice_days,
       seed.requires_attachment, NOW(), NOW()
FROM companies c
CROSS JOIN (
  VALUES
    ('PERMANENT', 'عقد دائم', 'Permanent contract', 'عقد عمل غير محدد المدة.', 'Open-ended employment contract.', NULL, 90, 30, TRUE),
    ('FIXED_TERM', 'عقد محدد المدة', 'Fixed-term contract', 'عقد عمل بتاريخ انتهاء محدد.', 'Employment contract with a defined end date.', 12, 90, 45, TRUE),
    ('PROBATION', 'عقد تحت التجربة', 'Probation contract', 'عقد مرتبط بفترة تجربة واضحة.', 'Contract focused on probation tracking.', 3, 90, 15, TRUE)
) AS seed(code, name_ar, name_en, description_ar, description_en, default_duration_months, default_probation_days, renewal_notice_days, requires_attachment)
WHERE NOT EXISTS (
  SELECT 1 FROM contract_types ct
  WHERE ct.company_id = c.id AND lower(ct.code) = lower(seed.code) AND ct.is_deleted = FALSE
);

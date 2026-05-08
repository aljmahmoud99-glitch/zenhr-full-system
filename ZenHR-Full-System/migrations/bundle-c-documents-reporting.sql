-- Bundle C: Documents, Forms & Reporting
-- Additive-only migration. Do not edit database.sql.

CREATE TABLE IF NOT EXISTS enterprise_document_categories (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  module_scope VARCHAR(60) NOT NULL DEFAULT 'hr',
  retention_months INTEGER,
  requires_expiry BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_document_categories_scope_chk CHECK (module_scope IN ('hr','payroll','recruitment','performance','workflow','employee','system')),
  CONSTRAINT enterprise_document_categories_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS enterprise_documents (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category_id BIGINT REFERENCES enterprise_document_categories(id),
  employee_id INTEGER REFERENCES employees(id),
  candidate_id BIGINT,
  workflow_instance_id BIGINT,
  source_module VARCHAR(80) NOT NULL DEFAULT 'hr',
  entity_type VARCHAR(80),
  entity_id BIGINT,
  title_ar VARCHAR(255) NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  document_number VARCHAR(120),
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  version_no INTEGER NOT NULL DEFAULT 1,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_object_id BIGINT,
  file_name VARCHAR(255),
  file_url TEXT,
  issued_at DATE,
  expires_at DATE,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_documents_status_chk CHECK (status IN ('draft','pending_approval','approved','signed','expired','archived','rejected'))
);

CREATE TABLE IF NOT EXISTS enterprise_form_templates (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  module_scope VARCHAR(60) NOT NULL DEFAULT 'hr',
  form_schema_json JSONB NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  workflow_template_id BIGINT,
  version_no INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  is_public_self_service BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_form_templates_status_chk CHECK (status IN ('draft','active','archived')),
  CONSTRAINT enterprise_form_templates_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS enterprise_form_submissions (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  template_id BIGINT NOT NULL REFERENCES enterprise_form_templates(id),
  employee_id INTEGER REFERENCES employees(id),
  candidate_id BIGINT,
  submitted_by INTEGER REFERENCES users(id),
  status VARCHAR(40) NOT NULL DEFAULT 'submitted',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_instance_id BIGINT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_form_submissions_status_chk CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','cancelled'))
);

CREATE TABLE IF NOT EXISTS enterprise_pdf_templates (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  template_type VARCHAR(80) NOT NULL DEFAULT 'letter',
  language_mode VARCHAR(20) NOT NULL DEFAULT 'bilingual',
  html_template TEXT NOT NULL,
  variables_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  branding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  version_no INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_pdf_templates_lang_chk CHECK (language_mode IN ('ar','en','bilingual')),
  CONSTRAINT enterprise_pdf_templates_status_chk CHECK (status IN ('draft','active','archived')),
  CONSTRAINT enterprise_pdf_templates_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS enterprise_report_definitions (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  report_type VARCHAR(80) NOT NULL,
  module_scope VARCHAR(60) NOT NULL DEFAULT 'hr',
  query_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  filters_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  columns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  chart_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_roles JSONB NOT NULL DEFAULT '["hradmin"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_report_definitions_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS enterprise_scheduled_reports (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  report_definition_id BIGINT NOT NULL REFERENCES enterprise_report_definitions(id),
  schedule_name_ar VARCHAR(255) NOT NULL,
  schedule_name_en VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(120) NOT NULL,
  export_format VARCHAR(20) NOT NULL DEFAULT 'pdf',
  recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_scheduled_reports_format_chk CHECK (export_format IN ('pdf','xlsx','csv')),
  CONSTRAINT enterprise_scheduled_reports_status_chk CHECK (status IN ('active','paused','failed','archived'))
);

CREATE TABLE IF NOT EXISTS enterprise_export_jobs (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  report_definition_id BIGINT REFERENCES enterprise_report_definitions(id),
  requested_by INTEGER REFERENCES users(id),
  export_type VARCHAR(80) NOT NULL,
  export_format VARCHAR(20) NOT NULL DEFAULT 'xlsx',
  status VARCHAR(40) NOT NULL DEFAULT 'queued',
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_object_id BIGINT,
  file_name VARCHAR(255),
  file_url TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_export_jobs_format_chk CHECK (export_format IN ('pdf','xlsx','csv')),
  CONSTRAINT enterprise_export_jobs_status_chk CHECK (status IN ('queued','running','completed','failed','cancelled'))
);

CREATE TABLE IF NOT EXISTS enterprise_print_history (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  document_id BIGINT REFERENCES enterprise_documents(id),
  pdf_template_id BIGINT REFERENCES enterprise_pdf_templates(id),
  report_definition_id BIGINT REFERENCES enterprise_report_definitions(id),
  actor_user_id INTEGER REFERENCES users(id),
  action_type VARCHAR(40) NOT NULL DEFAULT 'preview',
  output_format VARCHAR(20) NOT NULL DEFAULT 'pdf',
  ip_address VARCHAR(80),
  user_agent TEXT,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT enterprise_print_history_action_chk CHECK (action_type IN ('preview','print','download','email','export'))
);

CREATE INDEX IF NOT EXISTS idx_ent_doc_categories_company_scope ON enterprise_document_categories(company_id, module_scope, is_active, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_documents_company_status ON enterprise_documents(company_id, status, source_module, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_documents_employee_expiry ON enterprise_documents(company_id, employee_id, expires_at, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_form_templates_company_scope ON enterprise_form_templates(company_id, module_scope, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_form_submissions_company_template ON enterprise_form_submissions(company_id, template_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_pdf_templates_company_type ON enterprise_pdf_templates(company_id, template_type, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_report_defs_company_scope ON enterprise_report_definitions(company_id, module_scope, is_active, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_scheduled_reports_company_next ON enterprise_scheduled_reports(company_id, status, next_run_at, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_export_jobs_company_status ON enterprise_export_jobs(company_id, status, export_type, is_deleted);
CREATE INDEX IF NOT EXISTS idx_ent_print_history_company_created ON enterprise_print_history(company_id, created_at DESC, action_type);

INSERT INTO enterprise_document_categories (company_id, code, name_ar, name_en, module_scope, requires_expiry, requires_approval)
SELECT c.id, seed.code, seed.name_ar, seed.name_en, seed.module_scope, seed.requires_expiry, seed.requires_approval
FROM companies c
CROSS JOIN (VALUES
  ('EMPLOYEE_CONTRACTS', 'عقود الموظفين', 'Employee Contracts', 'hr', false, true),
  ('PAYROLL_DOCUMENTS', 'وثائق الرواتب', 'Payroll Documents', 'payroll', false, true),
  ('RECRUITMENT_DOCUMENTS', 'وثائق التوظيف', 'Recruitment Documents', 'recruitment', false, false),
  ('COMPLIANCE_EXPIRY', 'وثائق الامتثال', 'Compliance Documents', 'hr', true, true)
) AS seed(code, name_ar, name_en, module_scope, requires_expiry, requires_approval)
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO enterprise_pdf_templates (company_id, code, name_ar, name_en, template_type, language_mode, html_template, variables_json, status)
SELECT c.id, seed.code, seed.name_ar, seed.name_en, seed.template_type, 'bilingual', seed.html_template, seed.variables_json::jsonb, 'active'
FROM companies c
CROSS JOIN (VALUES
  ('SALARY_CERTIFICATE', 'شهادة راتب', 'Salary Certificate', 'salary_certificate', '<h1>{{companyName}}</h1><p>{{employeeName}}</p><p>{{salary}}</p>', '["companyName","employeeName","salary"]'),
  ('EXPERIENCE_CERTIFICATE', 'شهادة خبرة', 'Experience Certificate', 'experience_certificate', '<h1>{{companyName}}</h1><p>{{employeeName}}</p><p>{{hireDate}}</p>', '["companyName","employeeName","hireDate"]'),
  ('OFFER_LETTER', 'خطاب عرض وظيفي', 'Offer Letter', 'offer_letter', '<h1>{{companyName}}</h1><p>{{candidateName}}</p><p>{{jobTitle}}</p>', '["companyName","candidateName","jobTitle"]')
) AS seed(code, name_ar, name_en, template_type, html_template, variables_json)
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO enterprise_report_definitions (company_id, code, name_ar, name_en, report_type, module_scope, query_config_json, filters_json, columns_json, chart_config_json, visibility_roles)
SELECT c.id, seed.code, seed.name_ar, seed.name_en, seed.report_type, seed.module_scope, '{}'::jsonb, seed.filters_json::jsonb, seed.columns_json::jsonb, '{}'::jsonb, seed.visibility_roles::jsonb
FROM companies c
CROSS JOIN (VALUES
  ('EMPLOYEE_ROSTER', 'قائمة الموظفين', 'Employee Roster', 'employees', 'hr', '["department","status"]', '["employeeCode","name","department","status"]', '["hradmin"]'),
  ('PAYROLL_EXPORT', 'تقرير الرواتب', 'Payroll Export', 'payroll', 'payroll', '["month","year","department"]', '["employeeCode","gross","deductions","net"]', '["hradmin","payrolladmin"]'),
  ('RECRUITMENT_PIPELINE', 'مسار التوظيف', 'Recruitment Pipeline', 'recruitment', 'recruitment', '["stage","source","recruiter"]', '["candidate","stage","rating","source"]', '["hradmin","recruiter"]'),
  ('PERFORMANCE_SUMMARY', 'ملخص الأداء', 'Performance Summary', 'performance', 'performance', '["cycle","department"]', '["employee","score","rating","recommendation"]', '["hradmin","manager","payrolladmin"]')
) AS seed(code, name_ar, name_en, report_type, module_scope, filters_json, columns_json, visibility_roles)
ON CONFLICT (company_id, code) DO NOTHING;

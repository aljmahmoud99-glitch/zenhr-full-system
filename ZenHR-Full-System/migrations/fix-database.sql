-- Safe additive migration from the legacy database.sql dump to the active
-- Node.js / Express / Drizzle ORM / PostgreSQL codebase.
--
-- Rules followed:
--   - No DROP statements.
--   - No data deletion.
--   - Existing database.sql is not modified.
--   - Existing data is preserved; new required Drizzle columns without a safe
--     universal backfill are added nullable on existing tables.

BEGIN;

-- ---------------------------------------------------------------------------
-- Existing legacy tables: add Drizzle columns missing from database.sql.
-- ---------------------------------------------------------------------------

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS code varchar(20),
  ADD COLUMN IF NOT EXISTS country varchar(50) DEFAULT 'Jordan',
  ADD COLUMN IF NOT EXISTS plan_name varchar(50) DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_start date,
  ADD COLUMN IF NOT EXISTS subscription_end date,
  ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_employees integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT true;

ALTER TABLE companies
  ALTER COLUMN country SET DEFAULT 'Jordan',
  ALTER COLUMN industry_type SET DEFAULT 'other',
  ALTER COLUMN currency SET DEFAULT 'JOD',
  ALTER COLUMN plan_name SET DEFAULT 'trial',
  ALTER COLUMN max_users SET DEFAULT 10,
  ALTER COLUMN max_employees SET DEFAULT 50,
  ALTER COLUMN is_trial SET DEFAULT true,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_deleted SET DEFAULT false;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS org_node_id integer,
  ADD COLUMN IF NOT EXISTS job_description_id integer;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_id integer;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS attendance_type varchar(20) DEFAULT 'office';

ALTER TABLE attendance_records
  ALTER COLUMN attendance_type SET DEFAULT 'office';

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS barcode varchar(100),
  ADD COLUMN IF NOT EXISTS supplier varchar(200),
  ADD COLUMN IF NOT EXISTS current_condition varchar(20) DEFAULT 'good';

ALTER TABLE assets
  ALTER COLUMN current_condition SET DEFAULT 'good';

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS company_id integer,
  ADD COLUMN IF NOT EXISTS issued_by varchar(200),
  ADD COLUMN IF NOT EXISTS file_name varchar(500);

UPDATE documents d
SET company_id = e.company_id
FROM employees e
WHERE d.employee_id = e.id
  AND d.company_id IS NULL;

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS total_overtime_earnings numeric(14,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS total_ssc_employee numeric(14,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS total_ssc_employer numeric(14,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS total_income_tax numeric(14,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS published_by_id integer,
  ADD COLUMN IF NOT EXISTS created_by_id integer;

ALTER TABLE payroll_runs
  ALTER COLUMN total_overtime_earnings SET DEFAULT 0,
  ALTER COLUMN total_ssc_employee SET DEFAULT 0,
  ALTER COLUMN total_ssc_employer SET DEFAULT 0,
  ALTER COLUMN total_income_tax SET DEFAULT 0;

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS overtime_earnings numeric(12,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS ssc_employer_contribution numeric(12,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS advance_deduction numeric(12,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS components_snapshot text;

ALTER TABLE payslips
  ALTER COLUMN overtime_earnings SET DEFAULT 0,
  ALTER COLUMN ssc_employer_contribution SET DEFAULT 0,
  ALTER COLUMN advance_deduction SET DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Missing Drizzle tables from lib/db/src/schema.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL,
  attendance_record_id integer,
  correction_type varchar(30) NOT NULL DEFAULT 'time_correction',
  request_date date NOT NULL,
  current_clock_in timestamp with time zone,
  current_clock_out timestamp with time zone,
  requested_clock_in timestamp with time zone,
  requested_clock_out timestamp with time zone,
  reason text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  manager_approved_by_id integer,
  manager_approved_at timestamp with time zone,
  manager_notes text,
  hr_approved_by_id integer,
  hr_approved_at timestamp with time zone,
  hr_notes text,
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_nodes (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  parent_id integer,
  node_type varchar(20) NOT NULL DEFAULT 'department',
  name_ar varchar(200) NOT NULL,
  name_en varchar(200) NOT NULL,
  code varchar(20),
  manager_employee_id integer,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS roles (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  name varchar(50) NOT NULL,
  name_ar varchar(100) NOT NULL,
  is_system_role boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id serial PRIMARY KEY,
  screen varchar(50) NOT NULL,
  action varchar(20) NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id serial PRIMARY KEY,
  role_id integer NOT NULL,
  permission_id integer NOT NULL,
  data_scope varchar(20) NOT NULL DEFAULT 'company',
  custom_node_ids text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_descriptions (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  org_node_id integer,
  title_ar varchar(200) NOT NULL,
  title_en varchar(200) NOT NULL,
  grade varchar(10),
  min_salary numeric(12,3),
  max_salary numeric(12,3),
  responsibilities text,
  requirements text,
  skills text,
  qualifications text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS career_paths (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  from_job_description_id integer NOT NULL,
  to_job_description_id integer NOT NULL,
  min_months_required integer NOT NULL DEFAULT 12,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_qualifications (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL,
  qualification_type varchar(50) NOT NULL,
  data_json text NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_actions (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  employee_id integer NOT NULL,
  action_type varchar(50) NOT NULL,
  effective_date date NOT NULL,
  created_by_user_id integer,
  previous_value_json text,
  new_value_json text,
  notes text,
  status varchar(30) NOT NULL DEFAULT 'applied',
  approval_steps_json text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_components (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  name_ar varchar(100) NOT NULL,
  name_en varchar(100) NOT NULL,
  code varchar(50) NOT NULL,
  component_type varchar(20) NOT NULL DEFAULT 'earning',
  calculation_type varchar(20) NOT NULL DEFAULT 'fixed',
  default_value numeric(12,3) NOT NULL DEFAULT 0,
  formula_expression varchar(500),
  percentage_base varchar(50),
  is_taxable boolean NOT NULL DEFAULT true,
  is_ssc_applicable boolean NOT NULL DEFAULT false,
  is_recurring boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_salary_components (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL,
  salary_component_id integer NOT NULL,
  override_value numeric(12,3),
  effective_from date NOT NULL,
  effective_to date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_component_definitions (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  component_key varchar(50) NOT NULL,
  name_ar varchar(100) NOT NULL,
  name_en varchar(100) NOT NULL,
  component_type varchar(20) NOT NULL DEFAULT 'fixed',
  percentage numeric(8,4),
  base_ref varchar(50),
  formula_expr text,
  is_basic boolean NOT NULL DEFAULT false,
  is_insurable boolean NOT NULL DEFAULT true,
  is_taxable boolean NOT NULL DEFAULT true,
  is_deduction boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  company_id integer,
  recipient_user_id integer NOT NULL,
  actor_user_id integer,
  entity_type varchar(60),
  entity_id integer,
  notification_type varchar(80) NOT NULL,
  title_ar varchar(250) NOT NULL,
  title_en varchar(250) NOT NULL,
  message_ar text NOT NULL,
  message_en text NOT NULL,
  priority varchar(10) NOT NULL DEFAULT 'normal',
  status varchar(10) NOT NULL DEFAULT 'unread',
  action_url varchar(400),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS salary_advances (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL,
  company_id integer NOT NULL,
  requested_amount numeric(12,3) NOT NULL,
  approved_amount numeric(12,3),
  reason text NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  repayment_method varchar(20) NOT NULL DEFAULT 'monthly',
  repayment_plan text,
  remaining_balance numeric(12,3) NOT NULL DEFAULT 0,
  status varchar(30) NOT NULL DEFAULT 'pending',
  request_notes text,
  decision_notes text,
  rejection_reason text,
  approved_by_id integer,
  approved_at timestamp with time zone,
  rejected_by_id integer,
  rejected_at timestamp with time zone,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_records (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  employee_id integer NOT NULL,
  category varchar(50) NOT NULL,
  reference_number varchar(200),
  issue_date date,
  expiry_date date,
  issued_by varchar(200),
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS violation_types (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  code varchar(50) NOT NULL,
  name_ar varchar(200) NOT NULL,
  name_en varchar(200),
  available_penalties_json text,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disciplinary_cases (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  employee_id integer NOT NULL,
  violation_type_id integer NOT NULL,
  violation_date date NOT NULL,
  violation_description text,
  penalty_type varchar(50) NOT NULL DEFAULT 'warning_verbal',
  penalty_days integer DEFAULT 0,
  salary_deduction_amount numeric(12,3) DEFAULT 0,
  action_deadline date,
  issued_date date,
  status varchar(20) NOT NULL DEFAULT 'draft',
  employee_acknowledgment boolean NOT NULL DEFAULT false,
  previous_violations_count integer NOT NULL DEFAULT 0,
  decision_date date,
  notes text,
  reported_by varchar(200),
  created_by_user_id integer,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disciplinary_investigations (
  id serial PRIMARY KEY,
  case_id integer NOT NULL,
  company_id integer NOT NULL,
  hr_notes text,
  employee_statement text,
  manager_statement text,
  investigation_date date,
  outcome varchar(50) NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resignations (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  employee_id integer NOT NULL,
  resignation_date date NOT NULL,
  last_working_day date,
  notice_period_days integer NOT NULL DEFAULT 30,
  notice_timer_start date,
  notice_timer_end date,
  reason text,
  status varchar(30) NOT NULL DEFAULT 'pending',
  current_approval_step integer DEFAULT 1,
  leaving_reason text,
  company_feedback text,
  interview_date date,
  remaining_salary numeric(12,3) DEFAULT 0,
  leave_payout numeric(12,3) DEFAULT 0,
  eosb_amount numeric(12,3) DEFAULT 0,
  notice_compensation numeric(12,3) DEFAULT 0,
  other_deductions numeric(12,3) DEFAULT 0,
  settlement_notes text,
  clearance_items_json text DEFAULT '[]',
  created_by_user_id integer,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resignation_approvals (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  resignation_id integer NOT NULL,
  approval_step integer NOT NULL,
  step_label varchar(200),
  approver_role varchar(50),
  approver_user_id integer,
  decision varchar(20) NOT NULL DEFAULT 'pending',
  notes text,
  decided_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clearances (
  id serial PRIMARY KEY,
  company_id integer NOT NULL,
  employee_id integer NOT NULL,
  resignation_id integer,
  termination_reason varchar(50) NOT NULL DEFAULT 'resignation',
  clearance_status varchar(20) NOT NULL DEFAULT 'pending',
  hr_notes text,
  salary numeric(12,3) NOT NULL DEFAULT 0,
  years_of_service numeric(8,4) NOT NULL DEFAULT 0,
  gratuity numeric(12,3) NOT NULL DEFAULT 0,
  leave_balance_compensation numeric(12,3) NOT NULL DEFAULT 0,
  pending_salary numeric(12,3) NOT NULL DEFAULT 0,
  additions numeric(12,3) NOT NULL DEFAULT 0,
  penalties numeric(12,3) NOT NULL DEFAULT 0,
  advances numeric(12,3) NOT NULL DEFAULT 0,
  deductions numeric(12,3) NOT NULL DEFAULT 0,
  final_settlement_amount numeric(12,3) NOT NULL DEFAULT 0,
  created_by_user_id integer NOT NULL,
  completed_by_user_id integer,
  completed_at timestamp with time zone,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Safe indexes. Unique indexes are created only when existing duplicates do not
-- already make them unsafe.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS org_nodes_company_idx ON org_nodes (company_id);
CREATE INDEX IF NOT EXISTS org_nodes_parent_idx ON org_nodes (parent_id);
CREATE INDEX IF NOT EXISTS org_nodes_company_type_idx ON org_nodes (company_id, node_type);
CREATE INDEX IF NOT EXISTS roles_company_idx ON roles (company_id);
CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS role_permissions_perm_idx ON role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS documents_company_idx ON documents (company_id);
CREATE INDEX IF NOT EXISTS documents_employee_idx ON documents (employee_id);
CREATE INDEX IF NOT EXISTS assets_company_idx ON assets (company_id);
CREATE INDEX IF NOT EXISTS assets_assigned_employee_idx ON assets (assigned_to_employee_id);
CREATE INDEX IF NOT EXISTS attendance_records_employee_date_idx ON attendance_records (employee_id, date);
CREATE INDEX IF NOT EXISTS attendance_corrections_employee_idx ON attendance_corrections (employee_id);
CREATE INDEX IF NOT EXISTS employee_actions_company_idx ON employee_actions (company_id);
CREATE INDEX IF NOT EXISTS employee_actions_employee_idx ON employee_actions (employee_id);
CREATE INDEX IF NOT EXISTS employee_actions_type_status_idx ON employee_actions (action_type, status);
CREATE INDEX IF NOT EXISTS notifications_recipient_status_idx ON notifications (recipient_user_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS notifications_company_idx ON notifications (company_id);
CREATE INDEX IF NOT EXISTS compliance_records_company_idx ON compliance_records (company_id);
CREATE INDEX IF NOT EXISTS compliance_records_employee_idx ON compliance_records (employee_id);
CREATE INDEX IF NOT EXISTS clearances_company_idx ON clearances (company_id);
CREATE INDEX IF NOT EXISTS clearances_employee_idx ON clearances (employee_id);
CREATE INDEX IF NOT EXISTS salary_advances_company_idx ON salary_advances (company_id);
CREATE INDEX IF NOT EXISTS salary_advances_employee_idx ON salary_advances (employee_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'roles_company_name_uniq')
     AND NOT EXISTS (
       SELECT 1 FROM roles GROUP BY company_id, name HAVING count(*) > 1
     ) THEN
    EXECUTE 'CREATE UNIQUE INDEX roles_company_name_uniq ON roles (company_id, name)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'permissions_screen_action_uniq')
     AND NOT EXISTS (
       SELECT 1 FROM permissions GROUP BY screen, action HAVING count(*) > 1
     ) THEN
    EXECUTE 'CREATE UNIQUE INDEX permissions_screen_action_uniq ON permissions (screen, action)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'role_permissions_uniq')
     AND NOT EXISTS (
       SELECT 1 FROM role_permissions GROUP BY role_id, permission_id HAVING count(*) > 1
     ) THEN
    EXECUTE 'CREATE UNIQUE INDEX role_permissions_uniq ON role_permissions (role_id, permission_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'career_paths_from_to_unique')
     AND NOT EXISTS (
       SELECT 1 FROM career_paths GROUP BY from_job_description_id, to_job_description_id HAVING count(*) > 1
     ) THEN
    EXECUTE 'CREATE UNIQUE INDEX career_paths_from_to_unique ON career_paths (from_job_description_id, to_job_description_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'salary_components_code_company_uniq')
     AND NOT EXISTS (
       SELECT 1 FROM salary_components GROUP BY code, company_id HAVING count(*) > 1
     ) THEN
    EXECUTE 'CREATE UNIQUE INDEX salary_components_code_company_uniq ON salary_components (code, company_id)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Foreign keys. NOT VALID avoids failing on legacy orphaned data while still
-- enforcing future writes.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_company_id_companies_id_fk') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_org_node_id_org_nodes_id_fk') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_org_node_id_org_nodes_id_fk
      FOREIGN KEY (org_node_id) REFERENCES org_nodes(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_job_description_id_job_descriptions_id_fk') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_job_description_id_job_descriptions_id_fk
      FOREIGN KEY (job_description_id) REFERENCES job_descriptions(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_id_roles_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_id_roles_id_fk
      FOREIGN KEY (role_id) REFERENCES roles(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_corrections_employee_id_employees_id_fk') THEN
    ALTER TABLE attendance_corrections ADD CONSTRAINT attendance_corrections_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_corrections_record_id_attendance_records_id_fk') THEN
    ALTER TABLE attendance_corrections ADD CONSTRAINT attendance_corrections_record_id_attendance_records_id_fk
      FOREIGN KEY (attendance_record_id) REFERENCES attendance_records(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_corrections_manager_approved_by_id_users_id_fk') THEN
    ALTER TABLE attendance_corrections ADD CONSTRAINT attendance_corrections_manager_approved_by_id_users_id_fk
      FOREIGN KEY (manager_approved_by_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_corrections_hr_approved_by_id_users_id_fk') THEN
    ALTER TABLE attendance_corrections ADD CONSTRAINT attendance_corrections_hr_approved_by_id_users_id_fk
      FOREIGN KEY (hr_approved_by_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_nodes_company_id_companies_id_fk') THEN
    ALTER TABLE org_nodes ADD CONSTRAINT org_nodes_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_company_id_companies_id_fk') THEN
    ALTER TABLE roles ADD CONSTRAINT roles_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_id_roles_id_fk') THEN
    ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_roles_id_fk
      FOREIGN KEY (role_id) REFERENCES roles(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_permission_id_permissions_id_fk') THEN
    ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_id_permissions_id_fk
      FOREIGN KEY (permission_id) REFERENCES permissions(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_descriptions_company_id_companies_id_fk') THEN
    ALTER TABLE job_descriptions ADD CONSTRAINT job_descriptions_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_descriptions_org_node_id_org_nodes_id_fk') THEN
    ALTER TABLE job_descriptions ADD CONSTRAINT job_descriptions_org_node_id_org_nodes_id_fk
      FOREIGN KEY (org_node_id) REFERENCES org_nodes(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'career_paths_company_id_companies_id_fk') THEN
    ALTER TABLE career_paths ADD CONSTRAINT career_paths_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'career_paths_from_job_description_id_fk') THEN
    ALTER TABLE career_paths ADD CONSTRAINT career_paths_from_job_description_id_fk
      FOREIGN KEY (from_job_description_id) REFERENCES job_descriptions(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'career_paths_to_job_description_id_fk') THEN
    ALTER TABLE career_paths ADD CONSTRAINT career_paths_to_job_description_id_fk
      FOREIGN KEY (to_job_description_id) REFERENCES job_descriptions(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_qualifications_employee_id_employees_id_fk') THEN
    ALTER TABLE employee_qualifications ADD CONSTRAINT employee_qualifications_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_actions_company_id_companies_id_fk') THEN
    ALTER TABLE employee_actions ADD CONSTRAINT employee_actions_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_actions_employee_id_employees_id_fk') THEN
    ALTER TABLE employee_actions ADD CONSTRAINT employee_actions_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_actions_created_by_user_id_users_id_fk') THEN
    ALTER TABLE employee_actions ADD CONSTRAINT employee_actions_created_by_user_id_users_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_components_company_id_companies_id_fk') THEN
    ALTER TABLE salary_components ADD CONSTRAINT salary_components_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_salary_components_employee_id_employees_id_fk') THEN
    ALTER TABLE employee_salary_components ADD CONSTRAINT employee_salary_components_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_salary_components_salary_component_id_salary_components_id_fk') THEN
    ALTER TABLE employee_salary_components ADD CONSTRAINT employee_salary_components_salary_component_id_salary_components_id_fk
      FOREIGN KEY (salary_component_id) REFERENCES salary_components(id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_component_definitions_company_id_companies_id_fk') THEN
    ALTER TABLE salary_component_definitions ADD CONSTRAINT salary_component_definitions_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_company_id_companies_id_fk') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_recipient_user_id_users_id_fk') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_user_id_users_id_fk
      FOREIGN KEY (recipient_user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_actor_user_id_users_id_fk') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_actor_user_id_users_id_fk
      FOREIGN KEY (actor_user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_advances_employee_id_employees_id_fk') THEN
    ALTER TABLE salary_advances ADD CONSTRAINT salary_advances_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_advances_company_id_companies_id_fk') THEN
    ALTER TABLE salary_advances ADD CONSTRAINT salary_advances_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_advances_approved_by_id_users_id_fk') THEN
    ALTER TABLE salary_advances ADD CONSTRAINT salary_advances_approved_by_id_users_id_fk
      FOREIGN KEY (approved_by_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_advances_rejected_by_id_users_id_fk') THEN
    ALTER TABLE salary_advances ADD CONSTRAINT salary_advances_rejected_by_id_users_id_fk
      FOREIGN KEY (rejected_by_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_records_company_id_companies_id_fk') THEN
    ALTER TABLE compliance_records ADD CONSTRAINT compliance_records_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_records_employee_id_employees_id_fk') THEN
    ALTER TABLE compliance_records ADD CONSTRAINT compliance_records_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'violation_types_company_id_companies_id_fk') THEN
    ALTER TABLE violation_types ADD CONSTRAINT violation_types_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disciplinary_cases_company_id_companies_id_fk') THEN
    ALTER TABLE disciplinary_cases ADD CONSTRAINT disciplinary_cases_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disciplinary_cases_employee_id_employees_id_fk') THEN
    ALTER TABLE disciplinary_cases ADD CONSTRAINT disciplinary_cases_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disciplinary_cases_violation_type_id_violation_types_id_fk') THEN
    ALTER TABLE disciplinary_cases ADD CONSTRAINT disciplinary_cases_violation_type_id_violation_types_id_fk
      FOREIGN KEY (violation_type_id) REFERENCES violation_types(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disciplinary_cases_created_by_user_id_users_id_fk') THEN
    ALTER TABLE disciplinary_cases ADD CONSTRAINT disciplinary_cases_created_by_user_id_users_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disciplinary_investigations_case_id_disciplinary_cases_id_fk') THEN
    ALTER TABLE disciplinary_investigations ADD CONSTRAINT disciplinary_investigations_case_id_disciplinary_cases_id_fk
      FOREIGN KEY (case_id) REFERENCES disciplinary_cases(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disciplinary_investigations_company_id_companies_id_fk') THEN
    ALTER TABLE disciplinary_investigations ADD CONSTRAINT disciplinary_investigations_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resignations_company_id_companies_id_fk') THEN
    ALTER TABLE resignations ADD CONSTRAINT resignations_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resignations_employee_id_employees_id_fk') THEN
    ALTER TABLE resignations ADD CONSTRAINT resignations_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resignations_created_by_user_id_users_id_fk') THEN
    ALTER TABLE resignations ADD CONSTRAINT resignations_created_by_user_id_users_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resignation_approvals_company_id_companies_id_fk') THEN
    ALTER TABLE resignation_approvals ADD CONSTRAINT resignation_approvals_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resignation_approvals_resignation_id_resignations_id_fk') THEN
    ALTER TABLE resignation_approvals ADD CONSTRAINT resignation_approvals_resignation_id_resignations_id_fk
      FOREIGN KEY (resignation_id) REFERENCES resignations(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resignation_approvals_approver_user_id_users_id_fk') THEN
    ALTER TABLE resignation_approvals ADD CONSTRAINT resignation_approvals_approver_user_id_users_id_fk
      FOREIGN KEY (approver_user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clearances_company_id_companies_id_fk') THEN
    ALTER TABLE clearances ADD CONSTRAINT clearances_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clearances_employee_id_employees_id_fk') THEN
    ALTER TABLE clearances ADD CONSTRAINT clearances_employee_id_employees_id_fk
      FOREIGN KEY (employee_id) REFERENCES employees(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clearances_resignation_id_resignations_id_fk') THEN
    ALTER TABLE clearances ADD CONSTRAINT clearances_resignation_id_resignations_id_fk
      FOREIGN KEY (resignation_id) REFERENCES resignations(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clearances_created_by_user_id_users_id_fk') THEN
    ALTER TABLE clearances ADD CONSTRAINT clearances_created_by_user_id_users_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clearances_completed_by_user_id_users_id_fk') THEN
    ALTER TABLE clearances ADD CONSTRAINT clearances_completed_by_user_id_users_id_fk
      FOREIGN KEY (completed_by_user_id) REFERENCES users(id) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Safe data backfills and minimal seeds.
-- ---------------------------------------------------------------------------

INSERT INTO companies (
  name_ar, name_en, code, country, city, email, industry_type, currency,
  plan_name, max_users, max_employees, is_trial, is_active
)
SELECT
  'ZenJO Company', 'ZenJO Company', 'ZENJO', 'Jordan', 'Amman',
  'admin@zenjo.local', 'technology', 'JOD', 'trial', 10, 50, true, true
WHERE NOT EXISTS (SELECT 1 FROM companies);

INSERT INTO employees (
  company_id, employee_code,
  first_name_ar, last_name_ar, first_name_en, last_name_en,
  gender, date_of_birth, hire_date, basic_salary,
  employment_status, work_email
)
SELECT
  c.id, 'EMP-0001',
  'Admin', 'User', 'Admin', 'User',
  'male', DATE '1990-01-01', CURRENT_DATE, 0,
  'active', 'admin@zenjo.local'
FROM (SELECT id FROM companies ORDER BY id LIMIT 1) c
WHERE NOT EXISTS (SELECT 1 FROM employees);

INSERT INTO users (
  employee_id, company_id, username, password_hash, email, role,
  is_active, must_change_password
)
SELECT
  e.id, e.company_id, 'admin',
  '3b929697316ce55c9e254c2784e5587dcc3f28c0a66ce01914596522c98f1cce',
  'admin@zenjo.local', 'superadmin', true, true
FROM (SELECT id, company_id FROM employees ORDER BY id LIMIT 1) e
WHERE NOT EXISTS (SELECT 1 FROM users);

-- Seed company root nodes and department nodes, then backfill employees.org_node_id.
INSERT INTO org_nodes (
  company_id, parent_id, node_type, name_ar, name_en, code, is_active, sort_order
)
SELECT c.id, NULL, 'company', c.name_ar, c.name_en, c.code, c.is_active, 0
FROM companies c
WHERE NOT EXISTS (
  SELECT 1
  FROM org_nodes o
  WHERE o.company_id = c.id
    AND o.node_type = 'company'
    AND o.is_deleted = false
);

INSERT INTO org_nodes (
  company_id, parent_id, node_type, name_ar, name_en, code,
  manager_employee_id, is_active, sort_order
)
SELECT
  d.company_id,
  root.id,
  'department',
  d.name_ar,
  d.name_en,
  d.code,
  d.manager_employee_id,
  d.is_active,
  d.id
FROM departments d
LEFT JOIN org_nodes root
  ON root.company_id = d.company_id
 AND root.node_type = 'company'
 AND root.is_deleted = false
WHERE COALESCE(d.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM org_nodes o
    WHERE o.company_id = d.company_id
      AND o.node_type = 'department'
      AND o.name_en = d.name_en
      AND o.is_deleted = false
  );

UPDATE employees e
SET org_node_id = o.id
FROM departments d
JOIN org_nodes o
  ON o.company_id = d.company_id
 AND o.node_type = 'department'
 AND o.name_en = d.name_en
 AND o.is_deleted = false
WHERE e.department_id = d.id
  AND e.company_id = d.company_id
  AND e.org_node_id IS NULL;

-- Seed essential system roles for every company.
INSERT INTO roles (company_id, name, name_ar, is_system_role, is_active)
SELECT c.id, r.name, r.name_ar, true, true
FROM companies c
CROSS JOIN (
  VALUES
    ('superadmin', 'مدير النظام'),
    ('hradmin', 'مدير الموارد البشرية'),
    ('payrolladmin', 'مدير الرواتب'),
    ('manager', 'مدير القسم'),
    ('employee', 'موظف'),
    ('recruiter', 'موظف تعيين')
) AS r(name, name_ar)
WHERE NOT EXISTS (
  SELECT 1 FROM roles existing
  WHERE existing.company_id = c.id
    AND existing.name = r.name
);

-- Seed the permission catalog used by permission-service.ts.
WITH screens(screen) AS (
  SELECT unnest(ARRAY[
    'employees','leave','overtime','attendance','payroll','advances',
    'compliance','documents','assets','disciplinary','resignations',
    'clearance','reports','forms','users','settings','pre-employment',
    'job-descriptions'
  ]::varchar[])
),
actions(action) AS (
  SELECT unnest(ARRAY['view','create','update','delete','approve','export']::varchar[])
)
INSERT INTO permissions (screen, action, description)
SELECT s.screen, a.action, a.action || ' on ' || s.screen
FROM screens s
CROSS JOIN actions a
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p
  WHERE p.screen = s.screen
    AND p.action = a.action
);

WITH grants AS (
  SELECT r.id AS role_id, p.id AS permission_id, 'company'::varchar AS data_scope
  FROM roles r
  JOIN permissions p ON true
  WHERE r.name IN ('superadmin', 'hradmin')

  UNION ALL

  SELECT r.id, p.id, 'company'
  FROM roles r
  JOIN permissions p ON p.screen IN ('payroll','advances','reports','forms')
  WHERE r.name = 'payrolladmin'

  UNION ALL

  SELECT r.id, p.id, 'company'
  FROM roles r
  JOIN permissions p
    ON p.screen IN ('employees','documents','assets','attendance')
   AND p.action IN ('view','export')
  WHERE r.name = 'payrolladmin'

  UNION ALL

  SELECT r.id, p.id, 'department'
  FROM roles r
  JOIN permissions p
    ON (
      (p.screen IN ('employees','documents','assets','forms') AND p.action = 'view')
      OR (p.screen IN ('leave','overtime') AND p.action IN ('view','approve'))
      OR (p.screen = 'attendance' AND p.action = 'view')
      OR (p.screen = 'disciplinary' AND p.action IN ('view','create','update'))
    )
  WHERE r.name = 'manager'

  UNION ALL

  SELECT r.id, p.id, 'own'
  FROM roles r
  JOIN permissions p
    ON (
      (p.screen IN ('leave','overtime','advances','attendance') AND p.action IN ('view','create'))
      OR (p.screen IN ('documents','assets','payroll','forms') AND p.action = 'view')
    )
  WHERE r.name = 'employee'
)
INSERT INTO role_permissions (role_id, permission_id, data_scope)
SELECT DISTINCT g.role_id, g.permission_id, g.data_scope
FROM grants g
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = g.role_id
    AND rp.permission_id = g.permission_id
);

UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role_id IS NULL
  AND r.company_id = u.company_id
  AND r.name = u.role;

-- Seed latest configuration defaults for every company. The schema has one
-- description column, so descriptions include English and Arabic in one value.
INSERT INTO system_configurations (company_id, key, value, description, category)
SELECT c.id, cfg.key, cfg.value, cfg.description, cfg.category
FROM companies c
CROSS JOIN (
  VALUES
    ('currency_code','JOD','Currency code / رمز العملة','general'),
    ('company_name_ar','شركة زينجو','Company name in Arabic / اسم الشركة بالعربية','general'),
    ('company_name_en','ZenJO Company','Company name in English / اسم الشركة بالإنجليزية','general'),
    ('working_hours_per_day','8','Working hours per day / ساعات العمل اليومية','attendance'),
    ('working_days_per_week','5','Working days per week / أيام العمل الأسبوعية','attendance'),
    ('enable_geofencing','false','Enable geofencing / تفعيل تحديد الموقع','attendance'),
    ('enable_face_recognition','false','Enable face recognition / تفعيل التعرف على الوجه','attendance'),
    ('overtime_rate_weekday','1.5','Weekday overtime multiplier / معامل العمل الإضافي لأيام العمل','payroll'),
    ('overtime_rate_weekend','2.0','Weekend overtime multiplier / معامل العمل الإضافي للعطلة','payroll'),
    ('overtime_weekday_multiplier','1.5','Weekday overtime multiplier used by salary API / معامل إضافي لأيام العمل','payroll'),
    ('overtime_weekend_multiplier','2.0','Weekend overtime multiplier used by salary API / معامل إضافي للعطلة','payroll'),
    ('income_tax_exempt_annual','10000','Annual income tax exemption / الإعفاء الضريبي السنوي','payroll'),
    ('income_tax_personal_exemption','9000','Personal income tax exemption / الإعفاء الشخصي','payroll'),
    ('income_tax_family_exemption','500','Family income tax exemption / الإعفاء العائلي','payroll'),
    ('ssc_employee_rate','0.075','SSC employee contribution rate / نسبة اشتراك الموظف بالضمان','payroll'),
    ('ssc_employer_rate','0.1425','SSC employer contribution rate / نسبة اشتراك صاحب العمل بالضمان','payroll'),
    ('ssc_insurable_salary_cap','3000','SSC insurable salary cap / سقف الراتب الخاضع للضمان','payroll'),
    ('income_tax_brackets','[{"from":0,"to":9000,"rate":0},{"from":9000,"to":20000,"rate":0.05},{"from":20000,"to":30000,"rate":0.10},{"from":30000,"to":40000,"rate":0.15},{"from":40000,"to":50000,"rate":0.20},{"from":50000,"to":999999999,"rate":0.25}]','Jordan income tax brackets JSON / شرائح ضريبة الدخل بصيغة JSON','payroll'),
    ('probation_period_months','3','Probation period in months / فترة التجربة بالأشهر','hr'),
    ('notice_period_days','30','Notice period in days / مدة الإشعار بالأيام','hr'),
    ('annual_leave_days','14','Annual leave days / أيام الإجازة السنوية','leave'),
    ('sick_leave_days','14','Sick leave days / أيام الإجازة المرضية','leave'),
    ('compliance_enabled','true','Enable compliance tracking / تفعيل تتبع الامتثال','compliance'),
    ('ssf_compliance','true','SSF compliance enabled / تفعيل امتثال الضمان الاجتماعي','compliance'),
    ('compliance_warning_days','60','Expiry warning days / أيام التحذير قبل الانتهاء','compliance'),
    ('health_certificate_required','true','Health certificate required / شهادة الصحة مطلوبة','compliance'),
    ('criminal_record_required','true','Criminal record clearance required / شهادة عدم محكومية مطلوبة','compliance'),
    ('work_permit_required_non_jordanian','true','Work permit required for non-Jordanians / تصريح العمل لغير الأردنيين','compliance'),
    ('residency_required_non_jordanian','true','Residency required for non-Jordanians / الإقامة لغير الأردنيين','compliance'),
    ('passport_required_non_jordanian','true','Passport required for non-Jordanians / جواز السفر لغير الأردنيين','compliance'),
    ('social_security_required_active','true','SSC registration required for active employees / تسجيل الضمان للموظفين النشطين','compliance'),
    ('social_security_portal_url','','Social Security portal URL / رابط بوابة الضمان الاجتماعي','compliance'),
    ('ministry_of_health_portal_url','','Ministry of Health portal URL / رابط وزارة الصحة','compliance'),
    ('notify_leave_approval','true','Notify on leave approval / إشعار عند الموافقة على الإجازة','notifications'),
    ('notify_payroll_run','true','Notify on payroll run / إشعار عند تشغيل الرواتب','notifications'),
    ('theme_primary_color','#2d9e6b','Brand primary color / اللون الأساسي للهوية','branding'),
    ('theme_secondary_color','#475569','Brand secondary color / اللون الثانوي للهوية','branding'),
    ('theme_accent_color','#52d9a0','Brand accent color / لون التمييز للهوية','branding'),
    ('company_logo_url','','Company logo URL or upload path / رابط أو مسار شعار الشركة','branding'),
    ('theme_sidebar_color','#0f172a','Sidebar color / لون الشريط الجانبي','branding'),
    ('theme_topbar_color','#ffffff','Topbar color / لون الشريط العلوي','branding'),
    ('theme_background_color','#f8fafc','App background color / لون خلفية التطبيق','branding'),
    ('theme_json','{}','Extended theme JSON / إعدادات الهوية بصيغة JSON','branding')
) AS cfg(key, value, description, category)
WHERE NOT EXISTS (
  SELECT 1
  FROM system_configurations sc
  WHERE sc.company_id = c.id
    AND sc.key = cfg.key
);

COMMIT;

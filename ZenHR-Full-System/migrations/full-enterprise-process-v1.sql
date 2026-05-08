-- Full Enterprise Process Simulation support
-- Safe additive migration for persisted pre-employment/probation operations.

CREATE TABLE IF NOT EXISTS pre_employment_records (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  candidate_name_ar VARCHAR(200),
  candidate_name_en VARCHAR(200),
  candidate_email VARCHAR(200),
  candidate_phone VARCHAR(50),
  source VARCHAR(80),
  hiring_stage VARCHAR(60) NOT NULL DEFAULT 'probation',
  probation_start_date DATE NOT NULL,
  probation_end_date DATE NOT NULL,
  evaluation_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  performance_rating INTEGER,
  evaluation_date DATE,
  evaluation_notes TEXT,
  outcome VARCHAR(30),
  ssc_registered BOOLEAN NOT NULL DEFAULT false,
  ssc_registration_date DATE,
  ssc_registration_required_month INTEGER,
  ssc_registration_required_year INTEGER,
  ssc_status VARCHAR(30) DEFAULT 'pending',
  ssc_notes TEXT,
  ssc_number VARCHAR(80),
  police_clearance_provided BOOLEAN NOT NULL DEFAULT false,
  medical_certificate_provided BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id INTEGER REFERENCES users(id),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS probation_evaluations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  evaluation_stage VARCHAR(30) NOT NULL,
  evaluation_date DATE,
  commitment_score INTEGER NOT NULL DEFAULT 0,
  work_quality_score INTEGER NOT NULL DEFAULT 0,
  learning_score INTEGER NOT NULL DEFAULT 0,
  behavior_score INTEGER NOT NULL DEFAULT 0,
  teamwork_score INTEGER NOT NULL DEFAULT 0,
  commitment_notes TEXT,
  work_quality_notes TEXT,
  learning_notes TEXT,
  behavior_notes TEXT,
  teamwork_notes TEXT,
  overall_comments TEXT,
  evaluated_by VARCHAR(200),
  recommendation VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_employment_company ON pre_employment_records(company_id);
CREATE INDEX IF NOT EXISTS idx_pre_employment_employee ON pre_employment_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_pre_employment_status ON pre_employment_records(company_id, evaluation_status);
CREATE INDEX IF NOT EXISTS idx_probation_evaluations_company_employee ON probation_evaluations(company_id, employee_id);


-- Phase 3: Recruitment & Hiring System (Enterprise ATS + Hiring Flow)
-- Safe additive migration only. Do not edit database.sql.

CREATE TABLE IF NOT EXISTS recruitment_pipeline_stages (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  code varchar(60) NOT NULL,
  name_ar varchar(160) NOT NULL,
  name_en varchar(160) NOT NULL,
  stage_order integer NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  is_hired boolean NOT NULL DEFAULT false,
  is_rejected boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS recruitment_requests (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  request_number varchar(80) NOT NULL,
  job_profile_id integer REFERENCES job_descriptions(id),
  department_id integer REFERENCES departments(id),
  org_node_id integer REFERENCES org_nodes(id),
  manager_employee_id integer REFERENCES employees(id),
  requested_by_user_id integer REFERENCES users(id),
  title_ar varchar(220) NOT NULL,
  title_en varchar(220) NOT NULL,
  required_headcount integer NOT NULL DEFAULT 1 CHECK (required_headcount > 0),
  filled_headcount integer NOT NULL DEFAULT 0 CHECK (filled_headcount >= 0),
  hiring_reason varchar(80) NOT NULL DEFAULT 'replacement',
  employment_type varchar(40) NOT NULL DEFAULT 'full_time',
  min_salary numeric(12,3),
  max_salary numeric(12,3),
  urgency varchar(30) NOT NULL DEFAULT 'normal',
  expected_joining_date date,
  inherited_profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(40) NOT NULL DEFAULT 'draft',
  current_approval_step varchar(40),
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  rejection_reason text,
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, request_number),
  CHECK (min_salary IS NULL OR max_salary IS NULL OR min_salary <= max_salary)
);

CREATE TABLE IF NOT EXISTS recruitment_request_approvers (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  recruitment_request_id bigint NOT NULL REFERENCES recruitment_requests(id),
  step_order integer NOT NULL,
  approver_role varchar(40) NOT NULL,
  approver_user_id integer REFERENCES users(id),
  decision varchar(30) NOT NULL DEFAULT 'pending',
  decided_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (recruitment_request_id, step_order)
);

CREATE TABLE IF NOT EXISTS candidates (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_number varchar(80) NOT NULL,
  recruitment_request_id bigint REFERENCES recruitment_requests(id),
  current_stage_id integer REFERENCES recruitment_pipeline_stages(id),
  first_name_ar varchar(120),
  last_name_ar varchar(120),
  first_name_en varchar(120),
  last_name_en varchar(120),
  full_name_ar varchar(260) NOT NULL,
  full_name_en varchar(260) NOT NULL,
  email varchar(220),
  phone varchar(50),
  nationality varchar(100),
  current_company varchar(220),
  current_salary numeric(12,3),
  expected_salary numeric(12,3),
  notice_period_days integer,
  years_of_experience numeric(5,2),
  source varchar(80),
  tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  rating numeric(3,2),
  status varchar(40) NOT NULL DEFAULT 'active',
  rejection_reason text,
  converted_employee_id integer REFERENCES employees(id),
  converted_user_id integer REFERENCES users(id),
  hired_at timestamp with time zone,
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, candidate_number),
  UNIQUE (company_id, email)
);

CREATE TABLE IF NOT EXISTS candidate_documents (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  file_object_id bigint REFERENCES file_objects(id),
  document_type varchar(80) NOT NULL DEFAULT 'resume',
  file_name varchar(500),
  file_url varchar(800),
  notes text,
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS candidate_notes (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  note_type varchar(60) NOT NULL DEFAULT 'note',
  note_ar text,
  note_en text,
  visibility varchar(30) NOT NULL DEFAULT 'internal',
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS candidate_experiences (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  company_name varchar(220) NOT NULL,
  title varchar(220),
  start_date date,
  end_date date,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS candidate_education (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  educational_qualification_id integer REFERENCES educational_qualifications(id),
  specialization_id integer REFERENCES specializations(id),
  university_id integer REFERENCES universities(id),
  institution_name varchar(220),
  graduation_year integer,
  grade varchar(80),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS candidate_skills (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  skill_id integer REFERENCES skills(id),
  skill_name varchar(180),
  proficiency varchar(40),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS candidate_languages (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  language_id integer REFERENCES languages(id),
  language_name varchar(180),
  proficiency varchar(40),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS candidate_pipeline_history (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  from_stage_id integer REFERENCES recruitment_pipeline_stages(id),
  to_stage_id integer REFERENCES recruitment_pipeline_stages(id),
  from_status varchar(40),
  to_status varchar(40),
  rejection_reason text,
  moved_by_user_id integer REFERENCES users(id),
  moved_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS interviews (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  recruitment_request_id bigint REFERENCES recruitment_requests(id),
  stage_id integer REFERENCES recruitment_pipeline_stages(id),
  interview_type varchar(60) NOT NULL DEFAULT 'hr',
  scheduled_at timestamp with time zone NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  location varchar(250),
  meeting_url varchar(500),
  status varchar(40) NOT NULL DEFAULT 'scheduled',
  notes text,
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS interview_feedback (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  interview_id bigint NOT NULL REFERENCES interviews(id),
  interviewer_user_id integer REFERENCES users(id),
  technical_score numeric(4,2),
  communication_score numeric(4,2),
  culture_score numeric(4,2),
  overall_score numeric(4,2),
  recommendation varchar(40) NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_offers (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  recruitment_request_id bigint REFERENCES recruitment_requests(id),
  job_profile_id integer REFERENCES job_descriptions(id),
  department_id integer REFERENCES departments(id),
  org_node_id integer REFERENCES org_nodes(id),
  manager_employee_id integer REFERENCES employees(id),
  grade_id integer REFERENCES job_grades(id),
  salary numeric(12,3) NOT NULL,
  housing_allowance numeric(12,3) NOT NULL DEFAULT 0,
  transport_allowance numeric(12,3) NOT NULL DEFAULT 0,
  mobile_allowance numeric(12,3) NOT NULL DEFAULT 0,
  probation_months integer NOT NULL DEFAULT 3,
  joining_date date NOT NULL,
  contract_type varchar(40) NOT NULL DEFAULT 'permanent',
  employment_type varchar(40) NOT NULL DEFAULT 'full_time',
  status varchar(40) NOT NULL DEFAULT 'draft',
  approved_at timestamp with time zone,
  accepted_at timestamp with time zone,
  expires_at date,
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS hiring_decisions (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint NOT NULL REFERENCES candidates(id),
  recruitment_request_id bigint REFERENCES recruitment_requests(id),
  decision varchar(40) NOT NULL,
  reason text,
  decided_by_user_id integer REFERENCES users(id),
  decided_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS onboarding_batches (
  id bigserial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  candidate_id bigint REFERENCES candidates(id),
  employee_id integer REFERENCES employees(id),
  batch_number varchar(80) NOT NULL,
  status varchar(40) NOT NULL DEFAULT 'created',
  start_date date,
  checklist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by integer REFERENCES users(id),
  updated_by integer REFERENCES users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, batch_number)
);

CREATE INDEX IF NOT EXISTS recruitment_pipeline_stages_company_idx ON recruitment_pipeline_stages(company_id, is_deleted, is_active, stage_order);
CREATE INDEX IF NOT EXISTS recruitment_requests_company_status_idx ON recruitment_requests(company_id, is_deleted, status, created_at DESC);
CREATE INDEX IF NOT EXISTS recruitment_requests_job_profile_idx ON recruitment_requests(job_profile_id);
CREATE INDEX IF NOT EXISTS recruitment_request_approvers_request_idx ON recruitment_request_approvers(recruitment_request_id, decision, step_order);
CREATE INDEX IF NOT EXISTS candidates_company_status_idx ON candidates(company_id, is_deleted, status, created_at DESC);
CREATE INDEX IF NOT EXISTS candidates_stage_idx ON candidates(current_stage_id, status);
CREATE INDEX IF NOT EXISTS candidates_request_idx ON candidates(recruitment_request_id);
CREATE INDEX IF NOT EXISTS candidate_documents_candidate_idx ON candidate_documents(candidate_id, is_deleted);
CREATE INDEX IF NOT EXISTS candidate_notes_candidate_idx ON candidate_notes(candidate_id, is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_pipeline_history_candidate_idx ON candidate_pipeline_history(candidate_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS interviews_company_status_idx ON interviews(company_id, is_deleted, status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS interviews_candidate_idx ON interviews(candidate_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS interview_feedback_interview_idx ON interview_feedback(interview_id, is_deleted);
CREATE INDEX IF NOT EXISTS job_offers_company_status_idx ON job_offers(company_id, is_deleted, status, created_at DESC);
CREATE INDEX IF NOT EXISTS job_offers_candidate_idx ON job_offers(candidate_id);
CREATE INDEX IF NOT EXISTS hiring_decisions_candidate_idx ON hiring_decisions(candidate_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_batches_company_idx ON onboarding_batches(company_id, is_deleted, status);

INSERT INTO recruitment_pipeline_stages (company_id, code, name_ar, name_en, stage_order, is_terminal, is_hired, is_rejected)
SELECT c.id, v.code, v.name_ar, v.name_en, v.stage_order, v.is_terminal, v.is_hired, v.is_rejected
FROM companies c
CROSS JOIN (VALUES
  ('applied', 'تم التقديم', 'Applied', 10, false, false, false),
  ('screening', 'الفرز الأولي', 'Screening', 20, false, false, false),
  ('hr_interview', 'مقابلة الموارد البشرية', 'HR Interview', 30, false, false, false),
  ('technical_interview', 'المقابلة الفنية', 'Technical Interview', 40, false, false, false),
  ('manager_interview', 'مقابلة المدير', 'Manager Interview', 50, false, false, false),
  ('offer', 'العرض الوظيفي', 'Offer', 60, false, false, false),
  ('hired', 'تم التعيين', 'Hired', 70, true, true, false),
  ('rejected', 'مرفوض', 'Rejected', 80, true, false, true),
  ('withdrawn', 'منسحب', 'Withdrawn', 90, true, false, false)
) AS v(code, name_ar, name_en, stage_order, is_terminal, is_hired, is_rejected)
WHERE c.is_deleted = false
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO email_templates (company_id, template_key, subject_ar, subject_en, body_ar, body_en, is_active)
SELECT c.id, v.template_key, v.subject_ar, v.subject_en, v.body_ar, v.body_en, true
FROM companies c
CROSS JOIN (VALUES
  ('recruitment_interview_invitation', 'دعوة مقابلة', 'Interview invitation', 'تمت جدولة مقابلة للمرشح {{candidateName}}.', 'An interview has been scheduled for {{candidateName}}.'),
  ('recruitment_offer', 'عرض وظيفي', 'Job offer', 'تم إنشاء عرض وظيفي للمرشح {{candidateName}}.', 'A job offer has been created for {{candidateName}}.'),
  ('recruitment_rejection', 'تحديث طلب التوظيف', 'Recruitment update', 'نشكرك على اهتمامك. تم تحديث حالة طلبك.', 'Thank you for your interest. Your application status has been updated.'),
  ('recruitment_onboarding', 'بدء التأهيل', 'Onboarding started', 'تم بدء تأهيل الموظف الجديد {{candidateName}}.', 'Onboarding has started for {{candidateName}}.')
) AS v(template_key, subject_ar, subject_en, body_ar, body_en)
WHERE c.is_deleted = false
ON CONFLICT (company_id, template_key) DO NOTHING;

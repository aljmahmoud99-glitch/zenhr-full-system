-- Bundle B: Performance & Workflow Automation
-- Additive-only migration. Do not edit database.sql.

CREATE TABLE IF NOT EXISTS performance_rating_policies (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  policy_type VARCHAR(40) NOT NULL DEFAULT 'numeric',
  min_score NUMERIC(8,3),
  max_score NUMERIC(8,3),
  passing_score NUMERIC(8,3),
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_rating_policies_type_chk CHECK (policy_type IN ('numeric','letter','grade','custom')),
  CONSTRAINT performance_rating_policies_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS performance_rating_scale_items (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  policy_id BIGINT NOT NULL REFERENCES performance_rating_policies(id),
  code VARCHAR(80) NOT NULL,
  label_ar VARCHAR(255) NOT NULL,
  label_en VARCHAR(255) NOT NULL,
  min_score NUMERIC(8,3),
  max_score NUMERIC(8,3),
  numeric_value NUMERIC(8,3),
  color_token VARCHAR(40),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_rating_scale_items_code_uq UNIQUE (company_id, policy_id, code)
);

CREATE TABLE IF NOT EXISTS performance_evaluation_cycles (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  cycle_type VARCHAR(40) NOT NULL DEFAULT 'annual',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE,
  rating_policy_id BIGINT REFERENCES performance_rating_policies(id),
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_evaluation_cycles_type_chk CHECK (cycle_type IN ('monthly','quarterly','semi_annual','annual','probation','custom')),
  CONSTRAINT performance_evaluation_cycles_status_chk CHECK (status IN ('draft','active','closed','archived')),
  CONSTRAINT performance_evaluation_cycles_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS performance_goals (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  cycle_id BIGINT REFERENCES performance_evaluation_cycles(id),
  parent_goal_id BIGINT REFERENCES performance_goals(id),
  scope_type VARCHAR(40) NOT NULL DEFAULT 'employee',
  department_id INTEGER REFERENCES departments(id),
  employee_id INTEGER REFERENCES employees(id),
  owner_user_id INTEGER REFERENCES users(id),
  code VARCHAR(80),
  title_ar VARCHAR(255) NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  metric_type VARCHAR(40) NOT NULL DEFAULT 'percentage',
  target_value NUMERIC(14,3),
  actual_value NUMERIC(14,3),
  achievement_percent NUMERIC(8,3) NOT NULL DEFAULT 0,
  weight NUMERIC(8,3) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'not_started',
  due_date DATE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_goals_scope_chk CHECK (scope_type IN ('company','department','employee')),
  CONSTRAINT performance_goals_status_chk CHECK (status IN ('not_started','on_track','at_risk','completed','cancelled')),
  CONSTRAINT performance_goals_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS performance_evaluations (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  cycle_id BIGINT REFERENCES performance_evaluation_cycles(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  manager_employee_id INTEGER REFERENCES employees(id),
  job_profile_id BIGINT,
  rating_policy_id BIGINT REFERENCES performance_rating_policies(id),
  evaluation_type VARCHAR(40) NOT NULL DEFAULT 'manager',
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  self_score NUMERIC(8,3),
  manager_score NUMERIC(8,3),
  hr_score NUMERIC(8,3),
  peer_score NUMERIC(8,3),
  final_score NUMERIC(8,3),
  final_rating_code VARCHAR(80),
  strengths_ar TEXT,
  strengths_en TEXT,
  improvement_ar TEXT,
  improvement_en TEXT,
  recommendation VARCHAR(60),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_evaluations_type_chk CHECK (evaluation_type IN ('manager','self','hr','peer','committee','probation','custom')),
  CONSTRAINT performance_evaluations_status_chk CHECK (status IN ('draft','self_review','manager_review','hr_review','pending_approval','approved','rejected','closed')),
  CONSTRAINT performance_evaluations_recommendation_chk CHECK (recommendation IS NULL OR recommendation IN ('none','promotion','salary_increment','development_plan','disciplinary_review','probation_extend'))
);

CREATE TABLE IF NOT EXISTS performance_evaluation_items (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  evaluation_id BIGINT NOT NULL REFERENCES performance_evaluations(id),
  item_type VARCHAR(40) NOT NULL,
  goal_id BIGINT REFERENCES performance_goals(id),
  responsibility_id BIGINT REFERENCES responsibilities(id),
  title_ar VARCHAR(255),
  title_en VARCHAR(255),
  weight NUMERIC(8,3) NOT NULL DEFAULT 0,
  target_value NUMERIC(14,3),
  actual_value NUMERIC(14,3),
  score NUMERIC(8,3),
  rating_code VARCHAR(80),
  notes_ar TEXT,
  notes_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_evaluation_items_type_chk CHECK (item_type IN ('goal','kpi','responsibility','competency','custom'))
);

CREATE TABLE IF NOT EXISTS performance_workflow_templates (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  trigger_type VARCHAR(80) NOT NULL DEFAULT 'manual',
  condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sla_hours INTEGER,
  escalation_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_workflow_templates_code_uq UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS performance_workflow_steps (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  template_id BIGINT NOT NULL REFERENCES performance_workflow_templates(id),
  step_order INTEGER NOT NULL,
  approver_role VARCHAR(60),
  approver_user_id INTEGER REFERENCES users(id),
  condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sla_hours INTEGER,
  escalation_role VARCHAR(60),
  is_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_workflow_steps_order_uq UNIQUE (company_id, template_id, step_order)
);

CREATE TABLE IF NOT EXISTS performance_workflow_instances (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  template_id BIGINT REFERENCES performance_workflow_templates(id),
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  current_step_order INTEGER NOT NULL DEFAULT 1,
  current_approver_role VARCHAR(60),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_workflow_instances_status_chk CHECK (status IN ('pending','approved','rejected','cancelled','escalated','completed'))
);

CREATE TABLE IF NOT EXISTS performance_workflow_actions (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  workflow_instance_id BIGINT NOT NULL REFERENCES performance_workflow_instances(id),
  actor_user_id INTEGER REFERENCES users(id),
  action_type VARCHAR(40) NOT NULL,
  step_order INTEGER,
  status_before VARCHAR(40),
  status_after VARCHAR(40),
  notes_ar TEXT,
  notes_en TEXT,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT performance_workflow_actions_type_chk CHECK (action_type IN ('created','submitted','approved','rejected','escalated','cancelled','commented','completed'))
);

CREATE TABLE IF NOT EXISTS performance_escalations (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  workflow_instance_id BIGINT REFERENCES performance_workflow_instances(id),
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT NOT NULL,
  escalation_reason VARCHAR(255) NOT NULL,
  from_role VARCHAR(60),
  to_role VARCHAR(60),
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_escalations_status_chk CHECK (status IN ('open','resolved','dismissed'))
);

CREATE TABLE IF NOT EXISTS performance_promotion_recommendations (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  evaluation_id BIGINT REFERENCES performance_evaluations(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  current_job_profile_id BIGINT,
  recommended_job_profile_id BIGINT,
  current_grade_id BIGINT REFERENCES job_grades(id),
  recommended_grade_id BIGINT REFERENCES job_grades(id),
  current_salary NUMERIC(14,3),
  recommended_salary NUMERIC(14,3),
  increment_amount NUMERIC(14,3),
  increment_percent NUMERIC(8,3),
  reason_ar TEXT,
  reason_en TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  workflow_instance_id BIGINT REFERENCES performance_workflow_instances(id),
  effective_date DATE,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT performance_promotion_status_chk CHECK (status IN ('draft','pending','approved','rejected','applied','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_perf_rating_policies_company ON performance_rating_policies(company_id, is_deleted, is_active);
CREATE INDEX IF NOT EXISTS idx_perf_cycles_company ON performance_evaluation_cycles(company_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_perf_goals_company_scope ON performance_goals(company_id, scope_type, employee_id, department_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_perf_evaluations_company_employee ON performance_evaluations(company_id, employee_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_perf_evaluation_items_eval ON performance_evaluation_items(company_id, evaluation_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_perf_templates_company ON performance_workflow_templates(company_id, entity_type, is_deleted, is_active);
CREATE INDEX IF NOT EXISTS idx_perf_instances_company_status ON performance_workflow_instances(company_id, status, current_approver_role, is_deleted);
CREATE INDEX IF NOT EXISTS idx_perf_actions_instance ON performance_workflow_actions(company_id, workflow_instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_escalations_company_status ON performance_escalations(company_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_perf_promotions_company_status ON performance_promotion_recommendations(company_id, status, employee_id, is_deleted);

INSERT INTO performance_rating_policies
  (company_id, code, name_ar, name_en, description_ar, description_en, policy_type, min_score, max_score, passing_score, is_default, created_by, updated_by)
SELECT c.id, 'NUMERIC_100', 'تقييم رقمي من 100', 'Numeric 100-point rating',
       'سياسة تقييم افتراضية من صفر إلى مئة.', 'Default zero-to-one-hundred performance rating policy.',
       'numeric', 0, 100, 60, true, NULL, NULL
FROM companies c
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO performance_rating_scale_items
  (company_id, policy_id, code, label_ar, label_en, min_score, max_score, numeric_value, color_token, sort_order)
SELECT p.company_id, p.id, v.code, v.label_ar, v.label_en, v.min_score, v.max_score, v.numeric_value, v.color_token, v.sort_order
FROM performance_rating_policies p
CROSS JOIN (VALUES
  ('EXCELLENT','ممتاز','Excellent',90::numeric,100::numeric,95::numeric,'success',1),
  ('GOOD','جيد','Good',75::numeric,89.999::numeric,82::numeric,'info',2),
  ('MEETS','يلبي التوقعات','Meets Expectations',60::numeric,74.999::numeric,67::numeric,'warning',3),
  ('LOW','أقل من المتوقع','Below Expectations',0::numeric,59.999::numeric,45::numeric,'danger',4)
) AS v(code,label_ar,label_en,min_score,max_score,numeric_value,color_token,sort_order)
WHERE p.code = 'NUMERIC_100'
ON CONFLICT (company_id, policy_id, code) DO NOTHING;

INSERT INTO performance_workflow_templates
  (company_id, code, name_ar, name_en, entity_type, trigger_type, sla_hours, escalation_policy_json)
SELECT c.id, 'PERFORMANCE_REVIEW_APPROVAL', 'اعتماد تقييم الأداء', 'Performance Review Approval',
       'performance_evaluation', 'manual', 72,
       '{"escalateTo":"hradmin","afterHours":72}'::jsonb
FROM companies c
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO performance_workflow_steps
  (company_id, template_id, step_order, approver_role, sla_hours, escalation_role, is_final)
SELECT t.company_id, t.id, s.step_order, s.approver_role, s.sla_hours, s.escalation_role, s.is_final
FROM performance_workflow_templates t
CROSS JOIN (VALUES
  (1,'manager',48,'hradmin',false),
  (2,'hradmin',72,'hradmin',true)
) AS s(step_order, approver_role, sla_hours, escalation_role, is_final)
WHERE t.code = 'PERFORMANCE_REVIEW_APPROVAL'
ON CONFLICT (company_id, template_id, step_order) DO NOTHING;

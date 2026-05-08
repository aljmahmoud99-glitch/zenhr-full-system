-- Admin v2: Enterprise automation primitives
-- Safe additive migration only.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id serial PRIMARY KEY,
  company_id integer,
  user_id integer NOT NULL,
  notification_type varchar(100) NOT NULL DEFAULT '*',
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id serial PRIMARY KEY,
  company_id integer,
  workflow_key varchar(100) NOT NULL,
  name_ar varchar(200),
  name_en varchar(200) NOT NULL,
  applies_to_action_type varchar(80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (company_id, workflow_key)
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id serial PRIMARY KEY,
  workflow_definition_id integer NOT NULL,
  step_order integer NOT NULL,
  status_key varchar(80) NOT NULL,
  approver_role varchar(80) NOT NULL,
  escalation_days integer,
  is_final boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (workflow_definition_id, step_order)
);

CREATE TABLE IF NOT EXISTS workflow_actions (
  id bigserial PRIMARY KEY,
  company_id integer,
  workflow_request_id integer,
  actor_user_id integer,
  action varchar(40) NOT NULL,
  status_before varchar(80),
  status_after varchar(80),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id bigserial PRIMARY KEY,
  company_id integer,
  job_type varchar(100) NOT NULL,
  queue_name varchar(100) NOT NULL DEFAULT 'default',
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  error_message text,
  created_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id serial PRIMARY KEY,
  company_id integer,
  template_key varchar(100) NOT NULL,
  subject_ar varchar(300),
  subject_en varchar(300) NOT NULL,
  body_ar text,
  body_en text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_key)
);

CREATE TABLE IF NOT EXISTS email_logs (
  id bigserial PRIMARY KEY,
  company_id integer,
  recipient_user_id integer,
  to_email varchar(300),
  template_key varchar(100),
  subject varchar(500),
  status varchar(30) NOT NULL DEFAULT 'dry_run',
  provider_message_id varchar(300),
  error_message text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_objects (
  id bigserial PRIMARY KEY,
  company_id integer,
  employee_id integer,
  owner_user_id integer,
  linked_entity_type varchar(80),
  linked_entity_id integer,
  storage_provider varchar(40) NOT NULL DEFAULT 'local',
  storage_key varchar(800) NOT NULL,
  original_file_name varchar(500) NOT NULL,
  mime_type varchar(200),
  size_bytes bigint,
  visibility varchar(30) NOT NULL DEFAULT 'private',
  checksum varchar(200),
  created_by_user_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS file_access_logs (
  id bigserial PRIMARY KEY,
  file_object_id bigint NOT NULL,
  company_id integer,
  actor_user_id integer,
  action varchar(40) NOT NULL,
  ip_address varchar(80),
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_channels_json jsonb DEFAULT '["in_app"]'::jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_status varchar(30);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_object_id bigint;

CREATE INDEX IF NOT EXISTS notification_preferences_user_idx ON notification_preferences (user_id);
CREATE INDEX IF NOT EXISTS workflow_actions_request_idx ON workflow_actions (workflow_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS background_jobs_status_run_idx ON background_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS background_jobs_company_idx ON background_jobs (company_id);
CREATE INDEX IF NOT EXISTS email_logs_company_idx ON email_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_objects_company_idx ON file_objects (company_id, is_deleted);
CREATE INDEX IF NOT EXISTS file_objects_employee_idx ON file_objects (employee_id, is_deleted);
CREATE INDEX IF NOT EXISTS file_access_logs_file_idx ON file_access_logs (file_object_id, created_at DESC);

INSERT INTO system_configurations (company_id, key, value, description, category)
SELECT c.id, v.key, v.value, v.description, v.category
FROM companies c
CROSS JOIN (VALUES
  ('smtp_host', '', 'SMTP host', 'email'),
  ('smtp_port', '587', 'SMTP port', 'email'),
  ('smtp_user', '', 'SMTP username', 'email'),
  ('smtp_from_email', 'no-reply@zenjo.local', 'Default from email', 'email'),
  ('smtp_from_name', 'ZenJO HR', 'Default from name', 'email'),
  ('email_enabled', 'false', 'Enable outbound email', 'email'),
  ('email_dry_run', 'true', 'Log email without sending when SMTP is not configured', 'email'),
  ('storage_provider', 'local', 'File storage provider', 'storage'),
  ('storage_local_path', 'uploads', 'Local storage path', 'storage'),
  ('max_upload_mb', '5', 'Maximum upload size in MB', 'storage'),
  ('allowed_upload_types', 'application/pdf,image/jpeg,image/jpg,image/png,image/webp', 'Allowed upload MIME types', 'storage'),
  ('notifications_email_enabled', 'false', 'Enable email notifications', 'notifications'),
  ('notifications_in_app_enabled', 'true', 'Enable in-app notifications', 'notifications'),
  ('approval_escalation_days', '3', 'Default approval escalation days', 'workflow')
) AS v(key, value, description, category)
WHERE NOT EXISTS (
  SELECT 1 FROM system_configurations sc WHERE sc.company_id = c.id AND sc.key = v.key
);

INSERT INTO email_templates (company_id, template_key, subject_ar, subject_en, body_ar, body_en)
SELECT c.id, v.template_key, v.subject_ar, v.subject_en, v.body_ar, v.body_en
FROM companies c
CROSS JOIN (VALUES
  ('welcome_user', 'مرحباً بك في ZenJO', 'Welcome to ZenJO', 'مرحباً {{name}}، تم إنشاء حسابك.', 'Hello {{name}}, your account has been created.'),
  ('password_reset', 'إعادة تعيين كلمة المرور', 'Password reset', 'تم طلب إعادة تعيين كلمة المرور لحسابك.', 'A password reset was requested for your account.'),
  ('approval_pending', 'طلب بانتظار الاعتماد', 'Approval pending', 'يوجد طلب بانتظار اعتمادك.', 'A request is waiting for your approval.'),
  ('approval_decision', 'قرار اعتماد', 'Approval decision', 'تم تحديث حالة طلبك.', 'Your request status has been updated.'),
  ('payslip_ready', 'قسيمة الراتب جاهزة', 'Payslip ready', 'قسيمة راتبك جاهزة للعرض.', 'Your payslip is ready to view.'),
  ('document_expiry_reminder', 'تنبيه انتهاء وثيقة', 'Document expiry reminder', 'توجد وثيقة قاربت على الانتهاء.', 'A document is close to expiry.')
) AS v(template_key, subject_ar, subject_en, body_ar, body_en)
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates et WHERE et.company_id = c.id AND et.template_key = v.template_key
);

INSERT INTO workflow_definitions (company_id, workflow_key, name_ar, name_en, applies_to_action_type)
SELECT c.id, v.workflow_key, v.name_ar, v.name_en, v.applies_to_action_type
FROM companies c
CROSS JOIN (VALUES
  ('career_movement', 'الحركات الوظيفية', 'Career Movement', 'transfer'),
  ('salary_change', 'تعديل الراتب', 'Salary Change', 'salary_change'),
  ('employment_status', 'حالة التوظيف', 'Employment Status Change', 'termination')
) AS v(workflow_key, name_ar, name_en, applies_to_action_type)
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_definitions wd WHERE wd.company_id = c.id AND wd.workflow_key = v.workflow_key
);

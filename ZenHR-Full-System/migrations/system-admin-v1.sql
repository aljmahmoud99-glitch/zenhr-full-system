-- ZenJO System Admin / SaaS Control Center v1
-- Safe additive migration. Do not edit database.sql.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone VARCHAR(80) DEFAULT 'Asia/Amman';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS locale VARCHAR(20) DEFAULT 'ar-JO';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20) DEFAULT '#0f766e';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) DEFAULT '#1d4ed8';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '#f59e0b';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) DEFAULT 'trial';

CREATE TABLE IF NOT EXISTS platform_plans (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name_ar VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NOT NULL,
  price NUMERIC(12,3) NOT NULL DEFAULT 0,
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
  max_users INTEGER NOT NULL DEFAULT 10,
  max_employees INTEGER NOT NULL DEFAULT 50,
  enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  trial_days INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  plan_id INTEGER REFERENCES platform_plans(id),
  status VARCHAR(30) NOT NULL DEFAULT 'trial',
  starts_at DATE,
  ends_at DATE,
  trial_ends_at DATE,
  max_users INTEGER,
  max_employees INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS company_modules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  module_key VARCHAR(50) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INTEGER REFERENCES users(id),
  UNIQUE(company_id, module_key)
);

CREATE TABLE IF NOT EXISTS company_branding (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  logo_url TEXT,
  primary_color VARCHAR(20) NOT NULL DEFAULT '#0f766e',
  secondary_color VARCHAR(20) NOT NULL DEFAULT '#1d4ed8',
  accent_color VARCHAR(20) NOT NULL DEFAULT '#f59e0b',
  sidebar_color VARCHAR(20),
  topbar_color VARCHAR(20),
  background_color VARCHAR(20),
  theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INTEGER REFERENCES users(id),
  UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  permission_id INTEGER NOT NULL REFERENCES permissions(id),
  effect VARCHAR(10) NOT NULL CHECK (effect IN ('allow','deny')),
  data_scope VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INTEGER REFERENCES users(id),
  UNIQUE(user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  actor_user_id INTEGER REFERENCES users(id),
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  before_snapshot JSONB,
  after_snapshot JSONB,
  ip_address VARCHAR(80),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_subscriptions_company_idx ON company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS company_subscriptions_plan_idx ON company_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS company_subscriptions_status_idx ON company_subscriptions(status);
CREATE INDEX IF NOT EXISTS company_modules_company_idx ON company_modules(company_id);
CREATE INDEX IF NOT EXISTS company_branding_company_idx ON company_branding(company_id);
CREATE INDEX IF NOT EXISTS user_permission_overrides_user_idx ON user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_company_idx ON admin_audit_logs(company_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx ON admin_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx ON admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);

INSERT INTO platform_plans
  (code, name_ar, name_en, price, billing_cycle, max_users, max_employees, enabled_modules, trial_days, is_active)
VALUES
  ('trial', 'تجريبي', 'Trial', 0, 'monthly', 10, 25, '["attendance","documents","assets","workflows","reports"]'::jsonb, 14, TRUE),
  ('basic', 'أساسي', 'Basic', 99, 'monthly', 25, 75, '["attendance","documents","assets","workflows","reports"]'::jsonb, 0, TRUE),
  ('pro', 'احترافي', 'Pro', 249, 'monthly', 75, 250, '["payroll","attendance","assets","compliance","documents","workflows","reports"]'::jsonb, 0, TRUE),
  ('enterprise', 'مؤسسي', 'Enterprise', 0, 'annual', 9999, 9999, '["payroll","attendance","assets","compliance","documents","workflows","reports"]'::jsonb, 0, TRUE)
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  name_en = EXCLUDED.name_en,
  price = EXCLUDED.price,
  billing_cycle = EXCLUDED.billing_cycle,
  max_users = EXCLUDED.max_users,
  max_employees = EXCLUDED.max_employees,
  enabled_modules = EXCLUDED.enabled_modules,
  trial_days = EXCLUDED.trial_days,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO company_subscriptions
  (company_id, plan_id, status, starts_at, ends_at, trial_ends_at, max_users, max_employees)
SELECT
  c.id,
  COALESCE(p.id, (SELECT id FROM platform_plans WHERE code = 'trial')),
  COALESCE(NULLIF(c.subscription_status, ''), CASE WHEN c.is_trial THEN 'trial' ELSE 'active' END),
  COALESCE(c.subscription_start, CURRENT_DATE),
  COALESCE(c.subscription_end, CURRENT_DATE + INTERVAL '30 days'),
  CASE WHEN c.is_trial THEN COALESCE(c.subscription_end, CURRENT_DATE + INTERVAL '14 days') ELSE NULL END,
  COALESCE(c.max_users, p.max_users, 10),
  COALESCE(c.max_employees, p.max_employees, 50)
FROM companies c
LEFT JOIN platform_plans p ON p.code = COALESCE(c.plan_name, 'trial')
WHERE c.is_deleted = FALSE
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO company_modules (company_id, module_key, is_enabled)
SELECT c.id, m.module_key, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('payroll'), ('attendance'), ('assets'), ('compliance'), ('documents'), ('workflows'), ('reports')
) AS m(module_key)
WHERE c.is_deleted = FALSE
ON CONFLICT (company_id, module_key) DO NOTHING;

INSERT INTO company_branding
  (company_id, logo_url, primary_color, secondary_color, accent_color, sidebar_color, topbar_color, background_color)
SELECT
  c.id,
  c.logo,
  COALESCE(c.primary_color, '#0f766e'),
  COALESCE(c.secondary_color, '#1d4ed8'),
  COALESCE(c.accent_color, '#f59e0b'),
  '#0f172a',
  '#ffffff',
  '#f8fafc'
FROM companies c
WHERE c.is_deleted = FALSE
ON CONFLICT (company_id) DO NOTHING;

COMMIT;

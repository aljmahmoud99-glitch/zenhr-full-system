-- Cleanup Sprint 2 - Notification preference schema normalization
-- Additive only. Do not apply automatically.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  notification_type VARCHAR(120) NOT NULL DEFAULT '*',
  channel VARCHAR(40) NOT NULL DEFAULT 'in_app',
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  digest_frequency VARCHAR(30) NOT NULL DEFAULT 'instant',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id);
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notification_type VARCHAR(120) NOT NULL DEFAULT '*';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS channel VARCHAR(40) NOT NULL DEFAULT 'in_app';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS digest_frequency VARCHAR(30) NOT NULL DEFAULT 'instant';
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS preferences_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE notification_preferences np
SET company_id = u.company_id
FROM users u
WHERE np.user_id = u.id
  AND np.company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_preferences_user_type_channel_active
  ON notification_preferences (user_id, notification_type, channel)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_notification_preferences_company_user
  ON notification_preferences (company_id, user_id)
  WHERE is_deleted = false;

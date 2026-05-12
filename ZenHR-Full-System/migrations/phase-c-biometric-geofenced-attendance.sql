-- Phase C - Biometric Geofenced Attendance
-- Standalone additive migration. Do not edit database.sql.

CREATE TABLE IF NOT EXISTS attendance_trusted_devices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  credential_id TEXT NOT NULL,
  public_key_cose TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  device_label TEXT,
  platform TEXT,
  browser TEXT,
  user_agent TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'revoked', 'pending_reenroll')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  last_ip TEXT,
  blocked_at TIMESTAMPTZ,
  blocked_by INTEGER REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by INTEGER REFERENCES users(id),
  force_reenroll_at TIMESTAMPTZ,
  force_reenroll_by INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT attendance_trusted_devices_status_not_empty CHECK (length(trim(status)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_trusted_devices_active_credential
  ON attendance_trusted_devices(company_id, credential_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_attendance_trusted_devices_company_employee
  ON attendance_trusted_devices(company_id, employee_id)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_attendance_trusted_devices_status
  ON attendance_trusted_devices(company_id, status)
  WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS attendance_biometric_challenges (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  challenge TEXT NOT NULL,
  challenge_type VARCHAR(30) NOT NULL
    CHECK (challenge_type IN ('registration', 'authentication')),
  attendance_action VARCHAR(20)
    CHECK (attendance_action IS NULL OR attendance_action IN ('clock_in', 'clock_out')),
  rp_id TEXT NOT NULL,
  origin TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  device_id INTEGER REFERENCES attendance_trusted_devices(id),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_biometric_challenges_open
  ON attendance_biometric_challenges(company_id, user_id, challenge)
  WHERE used_at IS NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_attendance_biometric_challenges_employee
  ON attendance_biometric_challenges(company_id, employee_id, challenge_type, expires_at)
  WHERE used_at IS NULL AND is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS attendance_biometric_audit_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER REFERENCES employees(id),
  user_id INTEGER REFERENCES users(id),
  device_id INTEGER REFERENCES attendance_trusted_devices(id),
  attendance_record_id INTEGER REFERENCES attendance_records(id),
  event_type VARCHAR(60) NOT NULL,
  result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'blocked', 'failed')),
  failure_reason VARCHAR(120),
  message_ar TEXT,
  message_en TEXT,
  geofence_status VARCHAR(40),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  distance_meters INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_biometric_audit_company_employee
  ON attendance_biometric_audit_logs(company_id, employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_biometric_audit_device
  ON attendance_biometric_audit_logs(company_id, device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_biometric_audit_result
  ON attendance_biometric_audit_logs(company_id, result, event_type, created_at DESC);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS biometric_device_id INTEGER REFERENCES attendance_trusted_devices(id),
  ADD COLUMN IF NOT EXISTS biometric_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS biometric_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geofence_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS geofence_distance_meters INTEGER,
  ADD COLUMN IF NOT EXISTS geofence_location_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_attendance_records_biometric_device
  ON attendance_records(biometric_device_id)
  WHERE biometric_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_biometric_verified
  ON attendance_records(employee_id, date, biometric_verified);

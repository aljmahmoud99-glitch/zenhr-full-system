-- Phase 1: HR Master Data Foundation
-- Safe additive migration only. Do not edit database.sql.

CREATE TABLE IF NOT EXISTS responsibility_groups (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS responsibilities (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  responsibility_group_id INTEGER NOT NULL REFERENCES responsibility_groups(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  priority_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS job_grades (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  grade_code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  salary_band_min NUMERIC(14,3),
  salary_band_max NUMERIC(14,3),
  level_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS educational_qualifications (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  level_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS specializations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS universities (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  country VARCHAR(120),
  city VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS training_courses (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  provider_ar VARCHAR(255),
  provider_en VARCHAR(255),
  duration_hours NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  skill_category VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS languages (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  proficiency_levels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_rtl BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS experience_levels (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255) NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  min_years NUMERIC(5,2),
  max_years NUMERIC(5,2),
  level_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_responsibility_groups_company_code_active ON responsibility_groups(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_responsibilities_company_code_active ON responsibilities(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_grades_company_code_active ON job_grades(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_educational_qualifications_company_code_active ON educational_qualifications(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_specializations_company_code_active ON specializations(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_universities_company_code_active ON universities(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_courses_company_code_active ON training_courses(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_company_code_active ON skills(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_languages_company_code_active ON languages(company_id, lower(code)) WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_experience_levels_company_code_active ON experience_levels(company_id, lower(code)) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_responsibility_groups_company_search ON responsibility_groups(company_id, is_deleted, is_active, lower(name_ar), lower(name_en));
CREATE INDEX IF NOT EXISTS idx_responsibilities_company_group ON responsibilities(company_id, responsibility_group_id, is_deleted, is_active, priority_order);
CREATE INDEX IF NOT EXISTS idx_responsibilities_company_search ON responsibilities(company_id, is_deleted, is_active, lower(name_ar), lower(name_en));
CREATE INDEX IF NOT EXISTS idx_job_grades_company_order ON job_grades(company_id, is_deleted, is_active, level_order);
CREATE INDEX IF NOT EXISTS idx_educational_qualifications_company_order ON educational_qualifications(company_id, is_deleted, is_active, level_order);
CREATE INDEX IF NOT EXISTS idx_specializations_company_search ON specializations(company_id, is_deleted, is_active, lower(name_ar), lower(name_en));
CREATE INDEX IF NOT EXISTS idx_universities_company_search ON universities(company_id, is_deleted, is_active, lower(name_ar), lower(name_en));
CREATE INDEX IF NOT EXISTS idx_training_courses_company_search ON training_courses(company_id, is_deleted, is_active, lower(name_ar), lower(name_en));
CREATE INDEX IF NOT EXISTS idx_skills_company_search ON skills(company_id, is_deleted, is_active, lower(name_ar), lower(name_en));
CREATE INDEX IF NOT EXISTS idx_languages_company_search ON languages(company_id, is_deleted, is_active, lower(name_ar), lower(name_en));
CREATE INDEX IF NOT EXISTS idx_experience_levels_company_order ON experience_levels(company_id, is_deleted, is_active, level_order);

CREATE INDEX IF NOT EXISTS idx_responsibility_groups_company_updated ON responsibility_groups(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_responsibilities_company_updated ON responsibilities(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_grades_company_updated ON job_grades(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_educational_qualifications_company_updated ON educational_qualifications(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_specializations_company_updated ON specializations(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_universities_company_updated ON universities(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_courses_company_updated ON training_courses(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_company_updated ON skills(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_languages_company_updated ON languages(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_experience_levels_company_updated ON experience_levels(company_id, updated_at DESC);


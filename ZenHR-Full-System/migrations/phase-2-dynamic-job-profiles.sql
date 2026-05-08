-- Phase 2: Dynamic Job Profiles
-- Additive-only migration. Do not run automatically from application code.

BEGIN;

ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS code varchar(80);
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS grade_id integer;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS responsibility_group_id integer;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS min_experience_years integer;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS max_experience_years integer;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS reporting_to_job_description_id integer;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS employment_type varchar(40);
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS job_summary_ar text;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS job_summary_en text;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS responsibilities_text_ar text;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS responsibilities_text_en text;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS requirements_ar text;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS requirements_en text;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS status varchar(30) NOT NULL DEFAULT 'active';
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS created_by integer;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS updated_by integer;

UPDATE job_descriptions
SET code = 'JOB-' || id::text
WHERE code IS NULL OR btrim(code) = '';

UPDATE job_descriptions
SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
WHERE status IS NULL OR btrim(status) = '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_job_descriptions_company_code_active
  ON job_descriptions(company_id, lower(code))
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_job_descriptions_company_active
  ON job_descriptions(company_id, is_active, is_deleted);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_company_status
  ON job_descriptions(company_id, status, is_deleted);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_grade_id
  ON job_descriptions(company_id, grade_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_descriptions_responsibility_group_id
  ON job_descriptions(company_id, responsibility_group_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_descriptions_org_node_id
  ON job_descriptions(company_id, org_node_id)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS job_profile_responsibilities (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  responsibility_id integer NOT NULL REFERENCES responsibilities(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'required',
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_profile_educational_qualifications (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  educational_qualification_id integer NOT NULL REFERENCES educational_qualifications(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'required',
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_profile_specializations (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  specialization_id integer NOT NULL REFERENCES specializations(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'required',
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_profile_universities (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  university_id integer NOT NULL REFERENCES universities(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'preferred',
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_profile_training_courses (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  training_course_id integer NOT NULL REFERENCES training_courses(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'preferred',
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_profile_skills (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  skill_id integer NOT NULL REFERENCES skills(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'required',
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_profile_languages (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  language_id integer NOT NULL REFERENCES languages(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'required',
  proficiency_level varchar(80),
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_profile_experience_levels (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id),
  job_description_id integer NOT NULL REFERENCES job_descriptions(id),
  experience_level_id integer NOT NULL REFERENCES experience_levels(id),
  requirement_level varchar(20) NOT NULL DEFAULT 'required',
  weight integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  notes_ar text,
  notes_en text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_responsibilities_active
  ON job_profile_responsibilities(company_id, job_description_id, responsibility_id)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_educational_qualifications_active
  ON job_profile_educational_qualifications(company_id, job_description_id, educational_qualification_id)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_specializations_active
  ON job_profile_specializations(company_id, job_description_id, specialization_id)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_universities_active
  ON job_profile_universities(company_id, job_description_id, university_id)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_training_courses_active
  ON job_profile_training_courses(company_id, job_description_id, training_course_id)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_skills_active
  ON job_profile_skills(company_id, job_description_id, skill_id)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_languages_active
  ON job_profile_languages(company_id, job_description_id, language_id)
  WHERE is_deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS ux_job_profile_experience_levels_active
  ON job_profile_experience_levels(company_id, job_description_id, experience_level_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_job_profile_responsibilities_lookup
  ON job_profile_responsibilities(company_id, responsibility_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_profile_qualifications_lookup
  ON job_profile_educational_qualifications(company_id, educational_qualification_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_profile_specializations_lookup
  ON job_profile_specializations(company_id, specialization_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_profile_universities_lookup
  ON job_profile_universities(company_id, university_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_profile_training_courses_lookup
  ON job_profile_training_courses(company_id, training_course_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_profile_skills_lookup
  ON job_profile_skills(company_id, skill_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_profile_languages_lookup
  ON job_profile_languages(company_id, language_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_job_profile_experience_levels_lookup
  ON job_profile_experience_levels(company_id, experience_level_id)
  WHERE is_deleted = false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_descriptions_grade_id_job_grades_id_fk') THEN
    ALTER TABLE job_descriptions ADD CONSTRAINT job_descriptions_grade_id_job_grades_id_fk
      FOREIGN KEY (grade_id) REFERENCES job_grades(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_descriptions_responsibility_group_id_fk') THEN
    ALTER TABLE job_descriptions ADD CONSTRAINT job_descriptions_responsibility_group_id_fk
      FOREIGN KEY (responsibility_group_id) REFERENCES responsibility_groups(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_descriptions_reporting_to_fk') THEN
    ALTER TABLE job_descriptions ADD CONSTRAINT job_descriptions_reporting_to_fk
      FOREIGN KEY (reporting_to_job_description_id) REFERENCES job_descriptions(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_descriptions_created_by_users_id_fk') THEN
    ALTER TABLE job_descriptions ADD CONSTRAINT job_descriptions_created_by_users_id_fk
      FOREIGN KEY (created_by) REFERENCES users(id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_descriptions_updated_by_users_id_fk') THEN
    ALTER TABLE job_descriptions ADD CONSTRAINT job_descriptions_updated_by_users_id_fk
      FOREIGN KEY (updated_by) REFERENCES users(id) NOT VALID;
  END IF;
END $$;

COMMIT;

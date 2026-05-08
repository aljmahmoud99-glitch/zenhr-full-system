# Database Migration Report

## Active Stack Detected

- Backend: Node.js / Express.
- API entrypoint: `artifacts/api-server/src/index.ts`.
- API start scripts: `artifacts/api-server/package.json` uses `tsx src/index.ts`.
- ORM: Drizzle ORM.
- Database driver/dialect: PostgreSQL via `pg` and `drizzle-orm/node-postgres`.
- DB client source: `lib/db/src/index.ts`.
- Drizzle config: `lib/db/drizzle.config.ts` with `dialect: "postgresql"`.
- Schema source of truth: `lib/db/src/schema/index.ts` plus all files under `lib/db/src/schema/`.

## Source Paths Read

- `package.json`
- `artifacts/api-server/package.json`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/permission-service.ts`
- `artifacts/api-server/src/notification.service.ts`
- `artifacts/api-server/src/payroll-run.service.ts`
- `lib/db/package.json`
- `lib/db/src/index.ts`
- `lib/db/drizzle.config.ts`
- `lib/db/src/schema/*.ts`
- `lib/db/src/seed.ts`
- `lib/db/src/seed-phase1.ts`
- `lib/db/src/seed-phase2.ts`
- `database.sql`

## Schema Comparison Summary

- Drizzle schema tables found: 43.
- Drizzle schema column declarations parsed: 618.
- Legacy `database.sql` tables found: 22.
- Missing tables from `database.sql`: 21.
- All 43 Drizzle schema table names were checked against `database.sql`.
- Existing legacy tables were checked for missing Drizzle columns.

## Tables Added

The migration creates these missing tables with `CREATE TABLE IF NOT EXISTS`:

- `attendance_corrections`
- `org_nodes`
- `roles`
- `permissions`
- `role_permissions`
- `job_descriptions`
- `career_paths`
- `employee_qualifications`
- `employee_actions`
- `salary_components`
- `employee_salary_components`
- `salary_component_definitions`
- `notifications`
- `salary_advances`
- `compliance_records`
- `violation_types`
- `disciplinary_cases`
- `disciplinary_investigations`
- `resignations`
- `resignation_approvals`
- `clearances`

## Columns Added To Existing Tables

- `companies`: `code`, `country`, `plan_name`, `subscription_start`, `subscription_end`, `max_users`, `max_employees`, `is_trial`.
- `employees`: `org_node_id`, `job_description_id`.
- `users`: `role_id`.
- `attendance_records`: `attendance_type`.
- `assets`: `barcode`, `supplier`, `current_condition`.
- `documents`: `company_id`, `issued_by`, `file_name`.
- `payroll_runs`: `total_overtime_earnings`, `total_ssc_employee`, `total_ssc_employer`, `total_income_tax`, `published_at`, `published_by_id`, `created_by_id`.
- `payslips`: `overtime_earnings`, `ssc_employer_contribution`, `advance_deduction`, `components_snapshot`.

## Defaults Added Or Reinforced

- Company defaults: `country`, `industry_type`, `currency`, `plan_name`, `max_users`, `max_employees`, `is_trial`, `is_active`, `is_deleted`.
- Attendance default: `attendance_type = 'office'`.
- Asset default: `current_condition = 'good'`.
- Payroll aggregate defaults: overtime, SSC, and tax totals default to `0`.
- Payslip defaults: overtime, employer SSC contribution, and advance deduction default to `0`.

## Indexes And FKs Added

Indexes added with `CREATE INDEX IF NOT EXISTS` include org hierarchy, document, asset, attendance, workflow, notification, compliance, clearance, and salary advance access paths.

Unique indexes are only created when duplicate legacy data would not make them unsafe:

- `roles_company_name_uniq`
- `permissions_screen_action_uniq`
- `role_permissions_uniq`
- `career_paths_from_to_unique`
- `salary_components_code_company_uniq`

Foreign keys are added with idempotent `DO` blocks and `NOT VALID` so existing legacy orphan rows do not abort the migration. Future writes are still constrained.

## Seed Data Added

The migration adds minimal safe seed data only when missing:

- One company if `companies` is empty.
- One employee if `employees` is empty.
- One `superadmin` user if `users` is empty.
- Essential role records for every company: `superadmin`, `hradmin`, `payrolladmin`, `manager`, `employee`, `recruiter`.
- Permission catalog for the active screens/actions used by `permission-service.ts`.
- Role permission mappings matching the active code's legacy role behavior.
- `users.role_id` backfill from `users.role`.
- Company root `org_nodes`, department `org_nodes`, and `employees.org_node_id` backfill from departments.
- System configuration defaults used by `/api/config`, `/api/config/catalog`, salary calculations, compliance, notifications, and branding/theme endpoints.

Seeded admin password hash matches `Admin@1234` with the active `zenjo_salt` hashing logic. Existing login accounts are not overwritten.

## Module Verification

- Auth/users/roles: `users.role_id`, `roles`, `permissions`, and `role_permissions` covered; `/api/users` role joins are supported.
- Employees: `org_node_id` and `job_description_id` covered.
- Departments/org structure/job titles: legacy departments/job titles remain; `org_nodes`, `job_descriptions`, and `career_paths` added.
- Attendance/shifts: `attendance_records.attendance_type` and `attendance_corrections` covered. Shifts are currently in-memory in `index.ts`, not DB-backed.
- Leave/overtime/holidays: existing leave/overtime tables match schema. Public holidays are currently in-memory in `index.ts`, not DB-backed.
- Payroll/payslips/salary components/salary advances: payroll columns, normalized salary component tables, and `salary_advances` covered.
- Documents: `company_id`, `issued_by`, `file_name`, `issued_at`, `expires_at` supported.
- Assets: `supplier`, `barcode`, and `current_condition` supported.
- Compliance: `compliance_records` covered.
- Disciplinary: `violation_types`, `disciplinary_cases`, and `disciplinary_investigations` covered.
- Resignations: `resignations` and `resignation_approvals` covered.
- Clearance: `clearances` covered.
- Employee actions: `employee_actions` covered for career movements, salary changes, and employment status changes.
- Official forms: the active code uses in-memory `FORMS_CATALOG_ALL` and `formSubmissionsStore`; no DB-backed forms schema exists to migrate.
- Notifications: bilingual title/message, user targeting, actor user, priority, read status, entity type/id, and soft-delete covered.
- Activity logs: existing schema supports semantic `type`, `company_id`, `description`, and `employee_name`; no actor/entity columns exist in Drizzle.
- Settings/system configurations: active config keys seeded with validation-friendly values.
- Company branding/theme: logo URL, primary/secondary/accent colors, sidebar/topbar/background colors, and extensible theme JSON keys seeded.
- Dashboard dependencies: employee status, org nodes, attendance, leave, assets, payroll, compliance, and activity log dependencies covered.

## Runtime Validation Performed

Logical route validation was performed against the active schema and route code for:

- `/api/auth/login`
- `/api/users`
- `/api/config/catalog`
- `/api/documents`
- `/api/assets`
- `/api/compliance/overview`
- `/api/workflow/career-movements`
- `/api/workflow/salary-changes`
- `/api/workflow/status-changes`
- `/api/clearance`
- `/api/forms-catalog`
- `/api/notifications`

No live database was available in this workspace for applying the migration with `psql`; validation was static/logical against the active Drizzle schema and API code.

## Risky Assumptions

- Existing required Drizzle columns with no safe universal backfill were added nullable on legacy tables to avoid migration failure or invented data.
- Foreign keys are `NOT VALID` to preserve existing data even if old rows contain orphaned references.
- Official forms, public holidays, and shifts are not migrated into DB tables because the active backend currently stores them in memory.
- `system_configurations` has a single `description` column, so bilingual descriptions are stored as combined English/Arabic text.

## Safety Confirmation

- `database.sql` was not modified.
- Original `database.sql` SHA-256 before and after: `B0C5B3B1234961624C6967C4F426965CD6D3665D65EF5B7F3F7DBCB643E86A3D`.
- Migration file created: `migrations/fix-database.sql`.
- Report file created: `migrations/report.md`.
- No `DROP`, `DELETE`, or `TRUNCATE` statements are present in the migration.

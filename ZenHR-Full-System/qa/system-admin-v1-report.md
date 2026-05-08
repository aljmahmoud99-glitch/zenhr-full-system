# System Admin / SaaS Control Center v1 Report

## Status

GO for System Admin v1 implementation.

## Files Changed

- `migrations/system-admin-v1.sql`
- `artifacts/api-server/src/index.ts`
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/core/services/role-access.service.ts`
- `frontend/src/app/features/system-admin/system-admin-v1.component.ts`

## Database Objects Added

- `platform_plans`
- `company_subscriptions`
- `company_modules`
- `company_branding`
- `user_permission_overrides`
- `admin_audit_logs`
- Safe additive columns on `companies`:
  - `timezone`
  - `locale`
  - `primary_color`
  - `secondary_color`
  - `accent_color`
  - `subscription_status`

No tables were dropped. No data was deleted or truncated. `database.sql` was not modified.

## Seed Data Added

The migration seeds default plans:

- Trial
- Basic
- Pro
- Enterprise

It also creates default module, branding, and subscription rows for existing companies using `INSERT ... SELECT ... ON CONFLICT`.

## APIs Added

Role and permission management:

- `GET /api/admin/roles`
- `GET /api/admin/permissions`
- `GET /api/admin/role-permissions`
- `PATCH /api/admin/role-permissions`
- `GET /api/admin/users/:id/permissions`
- `PATCH /api/admin/users/:id/permissions`

Company settings:

- `GET /api/admin/companies/:id/settings`
- `PATCH /api/admin/companies/:id/settings`
- `PATCH /api/admin/companies/:id/modules`
- `PATCH /api/admin/companies/:id/branding`

Plans and subscriptions:

- `GET /api/admin/plans`
- `POST /api/admin/plans`
- `PATCH /api/admin/plans/:id`
- `GET /api/admin/subscriptions`
- `PATCH /api/admin/companies/:id/subscription`

Analytics:

- `GET /api/admin/analytics/summary`
- `GET /api/admin/analytics/companies-growth`
- `GET /api/admin/analytics/users-growth`
- `GET /api/admin/analytics/subscriptions`
- `GET /api/admin/analytics/system-health`

Audit logs:

- `GET /api/admin/audit-logs`
- `GET /api/admin/audit-logs/:id`

## Frontend Added

New admin routes:

- `/admin/roles-permissions`
- `/admin/company-settings`
- `/admin/plans-subscriptions`
- `/admin/analytics`
- `/admin/audit-logs`

The new UI supports role permission edits, company settings/modules/branding, plan create/update, subscription assignment, analytics views, and paginated audit-log details. Loading and saving states use `finalize()`.

## Security / RBAC

All new `/api/admin/*` platform APIs require `superadmin`.

Validation confirmed:

- `admin` / `superadmin`: `200`
- `hr` / `hradmin`: `403`
- `payroll` / `payrolladmin`: `403`
- `manager`: `403`
- `employee`: `403`
- `recruiter`: `403`

The implementation does not add access to sensitive payroll-summary or company payroll employee salary endpoints.

## Validation Results

Migration:

- `migrations/system-admin-v1.sql` applied successfully to local PostgreSQL.

Build/typecheck:

- `pnpm.cmd run typecheck`: passed.
- `node .\node_modules\@angular\cli\bin\ng.js build --configuration development`: passed.

Backend:

- Backend restarted on `http://localhost:3001`.
- All new admin GET APIs returned `200` for `superadmin`.
- Admin mutations returned expected success:
  - role permissions restore: `200`
  - malformed role permission request: `400`
  - create plan: `201`
  - patch plan: `200`
  - update company settings: `200`
  - update company modules: `200`
  - update company branding: `200`
  - update company subscription: `200`

Frontend:

- Frontend is serving on `http://localhost:5000`.
- Existing routes returned `200`:
  - `/admin/companies`
  - `/admin/users`
  - `/app/dashboard`
  - `/app/job-descriptions`
- New routes returned `200`:
  - `/admin/roles-permissions`
  - `/admin/company-settings`
  - `/admin/plans-subscriptions`
  - `/admin/analytics`
  - `/admin/audit-logs`

Audit:

- `GET /api/admin/audit-logs` returned `200`.
- Audit log total after validation: `28`.
- Recent audited actions included:
  - `company_subscription_updated`
  - `company_branding_updated`
  - `company_modules_updated`
  - `company_settings_updated`
  - `plan_updated`
  - `plan_created`
  - `role_permissions_updated`

## Risks / Assumptions

- The backend uses raw PostgreSQL queries for the new platform tables, so Drizzle schema files were not required for runtime support.
- The new UI is a first-pass control center using existing Angular patterns and route guards. It is functional but intentionally compact.
- Validation created QA plan rows and updated company 1 settings/modules/branding/subscription as requested. Existing data was not deleted or truncated.

# ZenJO — Jordanian HR Management System (HRMS)

## Overview
Enterprise-grade HRMS built for Jordanian companies. Full bilingual (Arabic/English) with RTL-first design, Jordanian labor law compliance, and strict role-based product architecture (6 distinct experience layers).

## Architecture
- **Frontend**: Angular 18 (`ZenHR-Full-System/frontend/`) — port 5000 (webview)
- **Backend**: Node.js/Express API (`ZenHR-Full-System/artifacts/api-server/`) — port 3001 (console)
- **Database**: PostgreSQL (Replit built-in via `DATABASE_URL`)
- **ORM**: Drizzle ORM (`ZenHR-Full-System/lib/db/`)
- **Package Manager**: pnpm workspace for backend; npm for Angular frontend

## Workflows
- `Start application` — Angular 18 dev server on port 5000 (webview, auto-start)
- `ZenJO API` — Node.js/Express API on port 3001 (console, auto-start)

## Setup
1. Backend pnpm deps: `cd ZenHR-Full-System && pnpm install`
2. Frontend npm deps: `cd ZenHR-Full-System/frontend && npm install`
3. DB schema push: `cd ZenHR-Full-System && pnpm --filter db push`
4. DB seed: `cd ZenHR-Full-System && pnpm --filter db seed`

## Demo Accounts
| Username | Password | Role |
|----------|----------|------|
| admin | Admin@1234 | superadmin |
| hr | Hr@1234 | hradmin |
| payroll | Payroll@1234 | payrolladmin |
| manager | Manager@1234 | manager |
| employee | Employee@1234 | employee |
| recruiter | Recruiter@1234 | recruiter |

## API Endpoints (all under /api prefix, proxied by Angular dev server)
- `GET /api/healthz` — Health check
- `POST /api/auth/login` — Login (returns JWT)
- `GET /api/auth/context` — Tenant/org context for current user (company + branch/dept names)
- `GET/POST /api/employees` — Employee management (enriched: branch, breadcrumb, manager name; supports `?branchId=`, `?jobDescriptionId=` filters)
- `GET/POST /api/departments` — Departments
- `GET/POST /api/job-titles` — Job titles
- `GET/POST /api/leave/requests` — Leave requests
- `GET/POST /api/leave/policies` — Leave policies
- `GET/POST /api/payroll/runs` — Payroll runs
- `GET /api/payroll/slips` — Payslips
- `GET/POST /api/attendance` — Attendance records
- `GET/POST /api/documents` — Documents
- `GET/POST /api/assets` — Assets
- `GET /api/lookups/*` — Reference data (nationalities, cities, banks, etc.)
- `GET /api/dashboard/*` — Dashboard stats
- `GET/POST /api/job-descriptions` — Job descriptions CRUD (search, filter by grade/dept/status, pagination)
- `GET/PUT/DELETE /api/job-descriptions/:id` — Single job description (409 guard if referenced by career path or employee)
- `GET/POST /api/career-paths` — Career paths CRUD (company-scoped)
- `DELETE /api/career-paths/:id` — Delete career path

## Key Files
- `ZenHR-Full-System/artifacts/api-server/src/index.ts` — Main Express API server
- `ZenHR-Full-System/artifacts/api-server/src/auth.ts` — JWT auth & middleware
- `ZenHR-Full-System/frontend/src/app/app.routes.ts` — Angular routes
- `ZenHR-Full-System/frontend/src/app/core/services/auth.service.ts` — Auth service
- `ZenHR-Full-System/frontend/src/app/core/services/role-access.service.ts` — RBAC
- `ZenHR-Full-System/frontend/src/app/core/services/tenant-context.service.ts` — Tenant/org context service (Phase UI-1)
- `ZenHR-Full-System/lib/db/src/schema/` — Drizzle ORM schema definitions
- `ZenHR-Full-System/lib/db/src/seed.ts` — Demo data seeder
- `ZenHR-Full-System/frontend/proxy.conf.json` — Proxies /api → localhost:3001

## Phase UI-1 — Tenant/Org Context Visibility (Completed)
- **Layout header**: Shows company name (and branch/dept for manager/employee) as a green pill badge next to the role label in every page header
- **Employees screen**: Branch filter dropdown added; Branch column shows branch badge; Org Unit column now shows node name + full breadcrumb; filtering uses descendant traversal (branch filter matches all sub-units)
- **Employee profile / Employment tab**: Shows Company, Branch (if assigned), Department, and Manager Name (resolved from ID) instead of raw IDs
- **Manager dashboard**: Scope banner below the hero shows Company › Branch › Department with a note that data is scoped to the manager's org context
- **Backend enrichment**: `GET /api/employees` and `GET /api/employees/:id` return virtual fields: `branchId/NameAr/NameEn`, `orgBreadcrumb`, `directManagerName/Ar`; `GET /api/auth/context` returns full company + org context for the current user

## JWT Config
- Key: `ZenJO-HRMS-2024-Secure-Secret-Key-Minimum32Characters!`
- Access token: 60 minutes; Refresh token: 7 days
- Password hash: SHA-256 with salt `zenjo_salt`

## Role-Based Access (RBAC)
- **superadmin**: Platform controls, company management
- **hradmin**: Full HR operations, all employees
- **payrolladmin**: Payroll + advances + reports
- **manager**: Team attendance/leave/overtime
- **employee**: Own data (ESS portal)
- **recruiter**: Pre-employment + own ESS

### RBAC Audit Pass (completed)
- `RoleAccessService` is the **single source of truth** for all role checks in the frontend
  - `isHrAdmin()`, `isEmployee()`, `isManager()`, `isAny(...roles)` — direct role checks
  - `canDoAction('resource:action')` — fine-grained action-level checks via `ACTION_ACCESS` map
  - `hasPermission(screen, action)` and `hasAnyPermission(items[])` — screen-level permission helpers
- All 12 feature components (employees, assets, attendance, compliance, documents, employee-profile, holidays, leave, overtime, payroll, reports, job-descriptions) now use `RoleAccessService` exclusively — no direct `auth.hasRole()` calls remain in any component
- Auth interceptor handles 403 — shows a toast warning and rethrows the error
- `status.service.ts` dead code deleted
- All `console.log/warn/debug` calls removed from production component code
- Backend: all ~45 API endpoints return `{ success: boolean, data: T }` consistently; frontend uses `response.data ?? fallback` pattern throughout

## Phase 3 — Employee Profile (Step 6: Global RTL + Number Formatting — Completed)
- **Number formatting**: All `ar-JO` locale strings replaced with `ar-JO-u-nu-latn` across 10 files (layout, dashboard, employees, attendance, employee-profile, leave, payroll, resignations, shifts, form-definitions) — forces Latin numerals (0-9) even when Arabic locale is active
- **LOCALE_ID**: Explicitly provided as `'en-US'` in `app.config.ts` — ensures Angular `| number`, `| date` pipes always use Western digits
- **Dashboard hero RTL**: Fixed `margin-inline-start: auto` → `margin-inline-end: auto` in all RTL hero blocks (both `.rtl-layout` class and `[dir='rtl']` selectors); fixed `justify-content: flex-end` → `justify-content: flex-start` in RTL hero containers so welcome text correctly aligns to the right side
- **Global RTL CSS** added to `styles.scss`: KPI card accent bar border-radius flipped for RTL (`0 22px 22px 0`); modal-actions `justify-content: flex-start` in RTL; notification panel text `text-align: end`; table cells `text-align: start`; direction explicit on page headers, filter bars, badges, eyebrow chips

## Jordan-Specific Rules
- SSC: insurable salary = MIN(basic, 3000 JOD). Employee 7.5% + Employer 14.25%
- EOSB: resignation <3yr = 0, ≥3yr = basic×years/12. Termination = basic×years
- Income tax: 5 brackets per Jordanian law

## Phase 2 — Job Descriptions & Career Paths (Completed)
- **DB**: New `job_descriptions` table (titleAr, titleEn, grade, department, orgNodeId, minSalary, maxSalary, responsibilities, requirements, skills, qualifications as JSON text, isActive). New `career_paths` table (fromJobDescriptionId, toJobDescriptionId, minMonthsRequired, notes). `employees.job_description_id` nullable FK added.
- **Backend**: 8 new endpoints — full CRUD for job descriptions (with search, grade/dept/status filter, pagination, 409 conflict guard), full CRUD for career paths (company-scoped). `/api/employees` supports `?jobDescriptionId=X` filter.
- **Frontend** (`job-descriptions.component`): Two-tab layout — Job Descriptions table + Career Paths card grid. Skeleton loading, error/retry state, illustrated empty state. Add/Edit modal with bilingual title fields, grade, department, salary range, and 4 JSON textarea sections (responsibilities, requirements, skills, qualifications) with inline per-field validation. Side drawer shows all details + employees assigned + career paths to/from. Career path modal with from/to job selects and months input. All errors via toast — no `alert()`. Full RTL support.

## Database Schema (PostgreSQL)
- companies, users, employees, departments, job_titles
- leave_requests, leave_policies, leave_balances, leave_types
- payroll_runs, payslips
- attendance_records
- documents, document_types
- assets, asset_categories
- nationalities, cities, banks
- activity_logs, system_configurations, overtime_requests
- **job_descriptions** (Phase 2)
- **career_paths** (Phase 2)

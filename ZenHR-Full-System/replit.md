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

## Employee Profile Improvements (Completed)
- **Edit button fixed**: Clicking "Edit" in the employee profile header now navigates to `/app/employees?edit={id}` and automatically opens the edit modal for that employee. The employees list component reads the `?edit` query param on init, clears it from the URL, and calls `openEdit()`.
- **Profile layout CSS**: Added all missing layout classes to `employee-profile.component.scss`: `profile-header-bar` (sticky header), `profile-header-info`, `profile-name`, `profile-meta-row`, `emp-code`, `profile-tabs` (horizontally scrollable), `profile-tab`, `profile-tab-body`, `profile-section-card`, `profile-section-title`, `info-grid`, `info-row`, `info-label`, `info-val`, `profile-grid-2`.
- **Action dropdown styling**: Dropdown menu already had solid styles; tab bar and action header now have proper CSS with active-tab underline indicator and smooth transitions.
- **Approval workflow**: `POST /api/employee-actions` now inserts actions with `status: "pending"` and does NOT apply side effects immediately. Two new endpoints handle the lifecycle: `POST /api/employee-actions/:id/approve` (applies all side effects — employee field updates, salary component creation — and sets status to "applied") and `POST /api/employee-actions/:id/reject` (sets status to "rejected"). The profile's Actions tab shows a colored status badge (yellow=pending, green=applied, red=rejected) on each action card, and for pending actions shows Approve/Reject buttons that call these endpoints.
- **Disciplinary integration**: When recording a `warning_issued` or `suspension` action from the profile, the frontend also fires a `POST /api/disciplinary` to create a linked disciplinary case (in-memory store). The disciplinary tab in the profile reads from the same `/api/disciplinary?employeeId=X` endpoint and displays any linked cases.
- **Career/Action timeline**: The timeline already worked via `GET /api/employee-actions?employeeId=X`; now it also shows the action status badge and approve/reject controls for pending items.

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

## Phase 4 — Employee Actions & Self-Service Isolation (Completed)

### Employee Actions System
- **DB**: `employee_actions` table — id, company_id, employee_id (RESTRICT), action_type, effective_date, created_by_user_id (SET NULL), previous_value_json (TEXT before-snapshot), new_value_json (TEXT after-snapshot), notes, status (applied|reversed), created_at
- **17 action types**: hire | probation_start | probation_complete | probation_fail | transfer | promotion | demotion | salary_change | suspension | suspension_lift | termination | resignation | leave_of_absence | return_from_leave | warning_issued | document_expired | contract_renewal
- **GET /api/employee-actions?employeeId=X** — auth-scoped (employee sees own only; HR passes employeeId); returns enriched timeline with labelEn/labelAr
- **POST /api/employee-actions** — hradmin only; captures before/after snapshots; runs in DB transaction with immediate side effects (employee status, salary, title, org-node, department updated atomically)
- **GET /api/employee-actions/types** — returns all types with AR+EN labels for frontend dropdowns
- **Side effects per action**: transfer→orgNodeId+departmentId, promotion/demotion→jobTitleId+salary, salary_change→all salary fields, suspension/suspension_lift/termination/resignation/probation_complete/probation_fail→employmentStatus+terminationDate
- **Frontend (Phase 4 Step 4 — COMPLETED)**: Rich Actions tab + "اتخاذ إجراء" header dropdown:
  - **Grouped header dropdown** on every employee profile for HR admins: bolt button opens a grouped menu (التوظيف: نقل/ترقية/خفض; الراتب: تعديل الراتب; الحالة: إيقاف/رفع/إنهاء; الإجراءات: إنذار/تجديد عقد)
  - **Type-specific modal fields**: Transfer shows org-unit + department dropdowns; Promotion/Demotion shows job-title dropdown + optional salary toggle; Salary Change shows all 6 salary component inputs with current values displayed
  - **Two-step confirm**: "Review & Confirm" button opens a summary step showing exactly what will change (from → to) before the final "Confirm & Save"
  - **Rich timeline**: Before/after JSON diffs rendered as color-coded rows (red strikethrough from, green bold to); `createdByName` attribution fixed; action-type color chips with icons
  - **Department/job-title lazy loading**: fetched once on first action requiring them

### Self-Service Data Isolation (8 endpoints hardened)
All 8 endpoints now enforce role-based scoping at the DB query level — the frontend cannot bypass by crafting API calls:
- **GET /api/leave/requests** — employee→own; manager→department; hradmin→all
- **GET /api/payroll/slips** — employee→own; hradmin/payrolladmin→filter by employeeId
- **GET /api/attendance** — employee→own; manager→department; hradmin→all
- **GET /api/documents** — employee→own; manager→department; hradmin→all
- **GET /api/assets** — employee→own assigned; manager→department; hradmin→all
- **GET /api/overtime** — employee→own; manager→department; hradmin→all
- **GET /api/resignations** — employee→own; hradmin→all
- **GET /api/salary-advances** — employee→own; hradmin→employeeId filter

## API Endpoints (all under /api prefix, proxied by Angular dev server)
- `GET /api/healthz` — Health check
- `POST /api/auth/login` — Login (returns JWT)
- `GET /api/auth/context` — Tenant/org context for current user (company + branch/dept names)
- `GET/POST /api/employees` — Employee management (enriched: branch, breadcrumb, manager name; supports `?branchId=`, `?jobDescriptionId=` filters)
- `GET/POST /api/departments` — Departments
- `GET/POST /api/job-titles` — Job titles
- `GET/POST /api/leave/requests` — Leave requests (role-scoped)
- `GET/POST /api/leave/policies` — Leave policies
- `GET/POST /api/payroll/runs` — Payroll runs
- `GET /api/payroll/slips` — Payslips (role-scoped)
- `GET/POST /api/attendance` — Attendance records (role-scoped)
- `GET/POST /api/documents` — Documents (role-scoped)
- `GET/POST /api/assets` — Assets (role-scoped)
- `GET /api/overtime` — Overtime (role-scoped)
- `GET /api/resignations` — Resignations (role-scoped)
- `GET /api/salary-advances` — Salary advances (role-scoped)
- `GET /api/lookups/*` — Reference data (nationalities, cities, banks, etc.)
- `GET /api/dashboard/*` — Dashboard stats
- `GET/POST /api/job-descriptions` — Job descriptions CRUD
- `GET/PUT/DELETE /api/job-descriptions/:id` — Single job description
- `GET/POST /api/career-paths` — Career paths CRUD
- `GET /api/employee-actions?employeeId=X` — Employee actions timeline (Phase 4)
- `POST /api/employee-actions` — Record new employee action with side effects (Phase 4)
- `GET /api/employee-actions/types` — All action types with AR+EN labels (Phase 4)

## Phase 5 — Dynamic Salary System (Completed)

### Calculation Engine
- **Integer milli-JOD arithmetic**: `toM(s)=Math.round(parseFloat(s)*1000)`, `fromM(n)=(n/1000).toFixed(3)` — all payroll math in integer milli-JOD to avoid floating-point drift
- **Jordanian SSC**: Employee 7.5% + Employer 14.25% on `MIN(basicSalary, ssc_insurable_salary_cap)` (default cap 3,000 JOD), configurable via `system_configurations`
- **Progressive income tax**: 6 Jordan brackets (0%→25%) read from `system_configurations.income_tax_brackets`, annual basis then /12 for monthly
- **Overtime**: Approved OT for the period included in gross (weekday 1.5×, weekend 2×, configurable)
- **Immutability guard**: Once a payroll run is approved, re-running the same period returns 409

### New API Endpoints (Phase 5)
- `POST /api/payroll/runs` — Creates a draft payroll run; computes payslips for all active employees with integer milli-JOD math
- `POST /api/payroll/runs/:id/approve` — Approves a draft run (hradmin/payrolladmin only); blocks re-approval
- `GET /api/payroll/preview/:employeeId` — Returns a real-time salary breakdown for one employee (no DB write)
- `GET/POST /api/salary-components/definitions` — CRUD for HR-configurable salary component catalog
- `PATCH/DELETE /api/salary-components/definitions/:id` — Update/soft-delete a component definition

### enrichPayslips Helper
- Joins employees + payroll runs + org nodes
- Adds aliases: `periodMonth/periodYear` (from `runMonth/runYear`), `overtimeAmount` (from `overtimeEarnings`), `sscEmployeeDeduction` (from `sscDeduction`), `fullNameAr/En`, `employeeCode`, `orgNodeNameAr/En`, `payrollRunStatus`

### Frontend (Phase 5)
- **Salary Component Definitions page** (`/app/payroll/salary-components`): Full CRUD table — create/edit/deactivate component definitions; accessible to hradmin + payrolladmin
- **Employee Profile → Payslips tab**: Shows a real-time salary breakdown card (earnings, deductions, SSC, tax, net) fetched from `/api/payroll/preview/:id` (visible to hradmin/payrolladmin only)
- **Printable Payslip**: Each payslip row has a print button that opens a professional bilingual payslip in a new window and triggers the browser print dialog (works in both Arabic RTL and English LTR)
- **Status labels**: Added `draft` (warning) and `cancelled` (danger) to payslip status badges

## Step 2 — Normalized Salary Components (Completed)

### New Tables
- **`salary_components`**: Company-level catalog of salary component templates. Fields: `id, company_id, name_ar, name_en, code (UNIQUE per company), component_type (earning/deduction), calculation_type (fixed/percentage/formula), default_value, formula_expression, percentage_base, is_taxable, is_ssc_applicable, is_recurring, is_active, sort_order, created_at, updated_at`.
- **`employee_salary_components`**: Normalized per-employee salary assignments with effective date ranges. Fields: `id, employee_id (→ RESTRICT), salary_component_id (→ RESTRICT), override_value, effective_from, effective_to, notes, created_at`.

### Seeded Data
- 6 default components per company: BASIC (fixed, SSC-applicable), HOUSING (25% of basic), TRANSPORT (fixed), MOBILE (fixed), MEAL (fixed), OVERTIME (formula). 18 total across 3 companies.
- 31 employee_salary_components rows migrated from existing flat employee salary columns (BASIC/HOUSING/TRANSPORT/MOBILE/MEAL). Existing flat columns kept on `employees` table as fallback.

### Updated Payroll Engine
- `POST /api/payroll/runs`: Now bulk-loads normalized salary components effective during the payroll period. Falls back to flat employee columns if no normalized data found.
- `GET /api/payroll/preview/:employeeId`: Reads current (open effective_to=NULL) salary components from normalized table, falls back to flat columns.

### New API Endpoints (Step 2)
- `GET /api/salary-components/catalog` — List company's salary component catalog
- `POST /api/salary-components/catalog` — Create new component (hradmin/payrolladmin)
- `PATCH /api/salary-components/catalog/:id` — Update component
- `DELETE /api/salary-components/catalog/:id` — Soft-deactivate component
- `GET /api/employees/:id/salary-components` — List employee's salary assignments (joined with catalog)
- `POST /api/employees/:id/salary-components` — Add a salary assignment
- `PATCH /api/employee-salary-components/:id` — Update an assignment
- `DELETE /api/employee-salary-components/:id` — Remove an assignment

### Updated Action Approval
- Both `POST /api/employee-actions/:id/approve` and the multi-step workflow approval endpoint now write normalized `employee_salary_components` rows (per-component, per effective date) instead of the old flat-column snapshot.

## Database Schema (PostgreSQL)
- companies, users, employees, departments, job_titles
- leave_requests, leave_policies, leave_balances, leave_types
- payroll_runs, payslips (+ `overtime_earnings`, `ssc_employer_contribution` columns added Phase 5)
- attendance_records
- documents, document_types
- assets, asset_categories
- nationalities, cities, banks
- activity_logs, system_configurations, overtime_requests
- **job_descriptions** (Phase 2)
- **career_paths** (Phase 2)
- **employee_actions** (Phase 4 — action history with before/after snapshots and side-effect system)
- **salary_component_definitions** (Phase 5 — HR-configurable earnings/deductions catalog)
- **salary_components** (Step 2 — company salary component catalog, normalized)
- **employee_salary_components** (Step 2 — per-employee salary assignments with effective date ranges)

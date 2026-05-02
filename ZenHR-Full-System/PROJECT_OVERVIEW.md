# ZenJO / ZenHR Full System — Project Overview (Senior Developer Doc)

This document summarizes the **active** ZenJO HRMS implementation in this repository, including architecture, project structure, main modules, API surface, database model, and cross-layer data flow.

> **Primary active stack**: **Angular 18** + **.NET 9 (ASP.NET Core Web API)** + **MySQL 8**  
> **Legacy/reference stack also exists** (React/Node/Postgres) and is stored alongside the primary code.

---

## 1) System architecture

### 1.1 Runtime components

- **Frontend (SPA)**
  - Location: `artifacts/zenjo-ng`
  - Angular 18 app served via Angular dev server in development (port `4200`).
  - Proxies API calls from `/api/**` to backend (see `artifacts/zenjo-ng/proxy.conf.json`).

- **Backend (REST API)**
  - Location: `artifacts/zenjo-api`
  - ASP.NET Core Web API targeting **`.NET 9 (net9.0)`**
  - Authentication: **JWT Bearer**
  - Multi-tenancy enforcement: `TenantValidationMiddleware` + `companyId` claim checks
  - Static file hosting: `/uploads` served from a local `uploads` folder at runtime

- **Database**
  - Intended engine for primary runtime: **MySQL 8.x** (Pomelo EF provider)
  - EF Core data model is defined in:
    - `artifacts/zenjo-api/Models/Entities.cs`
    - `artifacts/zenjo-api/Data/AppDbContext.cs`

### 1.2 High-level system design diagram (text-based)

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  Angular 18 SPA (artifacts/zenjo-ng)                                 │
│  - Auth: stores JWT/refresh                                          │
│  - Calls /api/**                                                     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  HTTP (dev proxy: /api -> :5000)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ASP.NET Core Web API (.NET 9) (artifacts/zenjo-api)                 │
│  - Controllers under /api/*                                          │
│  - JWT AuthN/AuthZ                                                   │
│  - TenantValidationMiddleware (company subscription checks)          │
│  - EF Core AppDbContext                                              │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  SQL
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MySQL 8.x                                                           │
│  - Tenant partition key: company_id/companyId pattern                 │
│  - Transaction tables for attendance/leave/overtime/payroll/...       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2) Project structure (repo layout explained)

This repo is intentionally **multi-era**: it contains the primary Angular/.NET/MySQL system and also a legacy/reference React/Node/Postgres system.

### 2.1 Inner project root (what to treat as “repo root”)

- `artifacts/`
  - **Primary active implementation**
    - `artifacts/zenjo-ng/`: Angular 18 frontend
    - `artifacts/zenjo-api/`: .NET 9 backend
  - **Legacy/reference implementation**
    - `artifacts/zenjo/`: React frontend (legacy/reference)
    - `artifacts/api-server/`: Node/Express API (legacy/reference)
    - plus `lib/*` packages (api spec/client/db tooling)

- `Controllers/`, `Models/`, `Services/`, `Data/`
  - Additional/older code copies and helpers at root level.
  - For primary runtime, treat `artifacts/zenjo-api/*` as source of truth.

- `database.sql`
  - SQL dump/reference. **Important**: current `database.sql` content is a **PostgreSQL** dump (see section 6.3).

- Launcher scripts (Windows)
  - `run-backend.bat`, `run-frontend.bat`, `run-mysql.bat`, `run-zenjo.bat`

- Documentation
  - `ZenJO-System-Documentation.md` (large, “complete system” doc)
  - `API_ENDPOINTS.md` (endpoint catalog)
  - `DATABASE_MODEL.md` (entity model)
  - `ERD.md` (text ERD)
  - `ROLE_MATRIX.md` (roles/access matrix)

---

## 3) Main modules and features (domain-level)

ZenJO is a multi-tenant HRMS covering the employee lifecycle and back-office workflows.

### 3.1 Platform / tenant management (SuperAdmin)

- Company registrations, plan/subscription, company activation/suspension
- Superadmin impersonation
- Enforced at runtime by `TenantValidationMiddleware`:
  - blocks expired subscriptions (HTTP `402`)
  - blocks suspended tenants (HTTP `403`)

### 3.2 Tenant HR operations (core domains)

- **Auth & user accounts**
  - JWT access token + refresh token, role claim, companyId claim
- **Employees**
  - Employee master record, org assignment, compliance fields, salary data (role-masked)
- **Departments & job titles**
  - Org structure and titles catalog
- **Attendance**
  - clock-in/out, manual entries, correction requests, geofence (work locations), reporting
- **Shifts**
  - shift templates, assignments to employees/departments, exceptions, rotations
- **Leave**
  - leave types/policies/balances/requests + approval workflows
- **Overtime**
  - overtime requests + derived overtime records + rules
- **Payroll**
  - payroll runs, payslips with immutable “salary snapshots”, deductions, tax/SSC logic
- **Salary advances**
  - request/approval flow; some metadata stored as JSON in `SalaryAdvance.Notes`
- **Documents & assets**
  - employee documents, expirations; asset assignment/return lifecycle
- **Compliance**
  - SSC/work permits/passport/health cert status & updates
- **Disciplinary, resignations, clearance**
  - case management, exit workflows and settlement data
- **Forms**
  - form records and submissions
- **Notifications & activity logs**
  - system notifications, audit trail of key actions (ex: login)

---

## 4) API structure (endpoints overview)

### 4.1 API conventions

- **Base path**: `/api/*`
- **Auth**: JWT Bearer
  - header: `Authorization: Bearer <accessToken>`
- **Response shape** (common pattern):

```json
{ "success": true, "data": {} }
```

- **Tenancy**:
  - `companyId` claim is required for non-superadmin requests.
  - Many controllers filter data using `tenant.GetCompanyId()` (“Cid”).

### 4.2 Controller inventory (route prefixes)

The backend is controller-based (not minimal APIs). Route prefixes found in `artifacts/zenjo-api/Controllers/*`:

- **Auth / public**
  - `api/auth` (login/refresh/logout/me/change-password)
  - `api/register` (company registration)

- **Platform (SuperAdmin)**
  - `api/admin`

- **Tenant core**
  - `api/dashboard`
  - `api/users`
  - `api/employees`
  - `api/departments`
  - `api/job-titles`
  - `api/lookups`
  - `api/banks`

- **Attendance / leave / overtime**
  - `api/attendance`
  - `api/shifts`
  - `api/leave`
  - `api/overtime`

- **Payroll / finance**
  - `api/payroll`
  - `api/salary-advances`

- **Compliance / documents / assets**
  - `api/compliance`
  - `api/documents`
  - `api/assets`
  - `api/notifications`

- **Lifecycle**
  - `api/pre-employment`
  - `api/probation`
  - `api/resignations`
  - `api/clearance`
  - `api/disciplinary`

- **Other**
  - `api/public-holidays`
  - `api/forms`
  - `api/reports`
  - `api/config`

For a route-by-route catalog, see `API_ENDPOINTS.md`.

---

## 5) Database schema overview (conceptual + key relationships)

### 5.1 Source of truth

The primary database model is defined in:

- `artifacts/zenjo-api/Models/Entities.cs` (domain classes)
- `artifacts/zenjo-api/Data/AppDbContext.cs` (table names, relationships, query filters, precision)

### 5.2 Tenant partitioning & soft delete

- **Tenant boundary**:
  - Most business entities include `CompanyId` and are filtered by `Cid` in controllers.
  - Middleware validates company subscription status before proceeding.

- **Soft delete**:
  - Several core tables use `IsDeleted` and EF query filters (ex: `Company`, `Employee`, `User`, `LeaveRequest`, `OvertimeRequest`, `Asset`, `Document`, `PayrollRun`).

### 5.3 High-level table groups (by module)

- **Platform / tenancy**
  - `companies`, `company_subscriptions`, `company_registrations`

- **Organization & identity**
  - `departments`, `job_titles`, `employees`, `users`
  - lookups: `banks`, `nationalities`, `governorates`, `cities`

- **Attendance & shifts**
  - `attendance_records`, `attendance_requests`, `work_locations`
  - `shifts`, `shift_assignments`, `shift_rotations`, `shift_exceptions`

- **Leave**
  - `leave_types`, `leave_policies`, `leave_balances`, `leave_requests`

- **Overtime**
  - `overtime_requests`, `overtime_records`, `overtime_rules`

- **Payroll**
  - `payroll_runs`, `payslips` (with snapshot columns)

- **Finance**
  - `salary_advances`

- **Documents, assets, compliance**
  - `document_types`, `documents`, `asset_categories`, `assets`, `employee_compliance_statuses`

- **System**
  - `system_configurations`, `activity_logs`, `notifications`

- **Lifecycle**
  - `pre_employment_records`
  - `resignations`, `clearance_records`, `resignation_approvals`, `exit_interviews`
  - `violation_types`, `disciplinary_actions`, `disciplinary_investigations`

- **Holidays**
  - `public_holidays`, `public_holiday_departments`

- **Forms**
  - `form_records`

For an ERD-style relationship summary, see `ERD.md`.

---

## 6) Data flow between frontend and backend

### 6.1 Auth flow (JWT + refresh)

1. Angular calls `POST /api/auth/login` with credentials.
2. Backend validates password hash (BCrypt) and returns:
   - `accessToken` (JWT) + `refreshToken`
   - user profile including `role`, `companyId`, `employeeId`
3. Angular stores tokens and sends `Authorization: Bearer ...` on subsequent requests.
4. When access token expires, Angular calls `POST /api/auth/refresh` using refresh token.

### 6.2 Tenant enforcement flow

- For authenticated requests (excluding public paths), `TenantValidationMiddleware`:
  - reads `companyId` claim
  - validates `Company` exists and is active
  - enforces subscription expiry (returns HTTP `402` with `SUBSCRIPTION_EXPIRED`)

### 6.3 Frontend API routing

- In development, Angular uses a dev proxy:
  - `artifacts/zenjo-ng/proxy.conf.json` maps `/api` -> `http://localhost:5000`
- This allows frontend code to call relative URLs like `/api/employees` without CORS issues in dev.

---

## 7) Technologies used

### 7.1 Backend

- **.NET 9** (`net9.0`)
- ASP.NET Core Web API
- Entity Framework Core 9
- Pomelo EntityFrameworkCore MySQL provider
- JWT Bearer authentication
- BCrypt password hashing (`BCrypt.Net-Next`)

### 7.2 Frontend

- **Angular 18**
- Angular Router
- RxJS
- SCSS
- `@ngx-translate/*` for i18n (Arabic-first + English)

### 7.3 Database

- **MySQL 8.x**

---

## 8) Potential issues / risks / improvement opportunities

This section is intentionally specific to artifacts found in the current codebase.

### 8.1 Security & secrets management

- **Hard-coded secrets in config**:
  - `artifacts/zenjo-api/appsettings.json` includes a **MySQL password** and a **JWT signing key**.
  - **Recommendation**: move secrets to environment variables / secret store; keep example values in `appsettings.Example.json`.

- **CORS policy is fully open**:
  - `Program.cs` allows any origin via `SetIsOriginAllowed(_ => true)` and `AllowCredentials()`.
  - **Recommendation**: restrict allowed origins per environment; avoid wildcard+credentials for production.

### 8.2 Schema management / migrations

- Backend uses `db.Database.EnsureCreated()` at startup and also runs raw `ALTER TABLE ... ADD COLUMN ...` checks (`EnsurePayrollSnapshotColumnsAsync`, `EnsurePreEmploymentColumnsAsync`).
  - This is convenient for demos, but risky in production (drift, non-repeatable state, lack of migration history).
  - **Recommendation**: move to proper EF migrations (or Flyway/Liquibase) and remove startup DDL.

### 8.3 Database artifact mismatch

- Root `database.sql` is a **PostgreSQL dump** (header shows PostgreSQL 16 + pg_dump), while the primary stack targets **MySQL**.
  - This strongly suggests it belongs to the legacy/reference stack or an earlier phase.
  - **Recommendation**: rename/split DB dumps (`database.mysql.sql`, `database.postgres.sql`) and document which stack uses which file.

### 8.4 Multi-repo-in-one complexity

- Co-locating **two implementations** (primary + legacy) increases onboarding and “which code is active?” risk.
  - **Recommendation**: explicitly mark legacy code as archived, or move legacy into a separate branch/repo, or add a `docs/ACTIVE_STACK.md` pointer.

### 8.5 AuthZ mismatches between UI and API

- Example noted in existing docs: salary advances UI visibility vs backend role restrictions can diverge.
  - **Recommendation**: treat backend `[Authorize(Roles=...)]` as authoritative; build a shared role/permission registry (or generate the role matrix from code).

---

## 9) Quick “where to look” map (for senior devs)

- **Backend entrypoint**: `artifacts/zenjo-api/Program.cs`
- **Controllers (API)**: `artifacts/zenjo-api/Controllers/`
- **Entities**: `artifacts/zenjo-api/Models/Entities.cs`
- **EF mappings**: `artifacts/zenjo-api/Data/AppDbContext.cs`
- **Tenant enforcement**: `artifacts/zenjo-api/Middleware/TenantValidationMiddleware.cs`
- **JWT**: `artifacts/zenjo-api/Services/JwtService.cs`
- **Frontend app**: `artifacts/zenjo-ng/src/`
- **Angular dev proxy**: `artifacts/zenjo-ng/proxy.conf.json`
- **Existing deep docs**:
  - `ZenJO-System-Documentation.md`
  - `API_ENDPOINTS.md`
  - `DATABASE_MODEL.md`
  - `ERD.md`


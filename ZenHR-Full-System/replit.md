# ZenJO — Jordanian HR Management System (HRMS)

## Overview
Enterprise-grade HRMS built for Jordanian companies. Full bilingual (Arabic/English) with RTL-first design, Jordanian labor law compliance, and strict role-based product architecture (6 distinct experience layers).

## Features (v3.3)
- **Forms Module** — 16 HR form types, 5 categories, live A4 Arabic preview, print
- **Probation Tracking** — employee profile page, inline progress bars, 3-stage evaluation workflow, probation alerts API
- **Shifts Module** — shift definitions, overnight/flexible shifts, exception management, Haversine-based work location
- **Attendance Module v2.0** — clock in/out, GPS verification, correction requests, 30-day seeded data
- **Overtime Management Module v1.0 COMPLETE** — OvertimeRecord + OvertimeRule entities, 14 API endpoints, 5-tab Angular component:
  - **Dashboard**: period toggle, stat cards (employees/hours/cost/pending), top employees, top departments, alerts
  - **Log**: 42 auto-seeded records from attendance, filters, inline approve/reject, payroll-processed indicator
  - **Requests**: submit form + dual-approval workflow (Manager → HR), 3 demo requests seeded
  - **Reports**: 5 report types (employee/department/monthly/cost/comparison) with date range filters
  - **Settings**: configurable OvertimeRule (tiers, weekend/holiday rates, approval toggles, auto-calculate flag)
  - **Payroll integration**: `/api/overtime/payroll-summary` returns approved OT amounts per employee by month

## Architecture
- **Backend**: .NET 9 API (`artifacts/zenjo-api/`) — port 5000
- **Frontend**: Angular 18 (`artifacts/zenjo-ng/`) — port 20256 (via artifact system)
- **Database**: MySQL 8.0 — socket `/home/runner/.zenjo-mysql/mysql.sock`

## Workflows
- `artifacts/zenjo: web` — Angular 18 dev server (auto-start, main preview)
- `ZenJO API` — MySQL startup + .NET 9 API (auto-start, console)

## Role-Based Product Architecture (v3.1)
Two system layers, six roles. Each role has a completely separate nav tree, dashboard, and action scope.

### Platform Layer (SuperAdmin only)
SuperAdmin sees ONLY: Platform Dashboard, User Management, System Settings, Platform Reports.
SuperAdmin does NOT see HR operational screens (employees, attendance, leave, payroll, etc.)

### Tenant/Company Layer (HR, Payroll, Manager, Employee, Recruiter)
Each company-level role sees only what belongs to their operational domain.

| Role | Nav Tree | Dashboard |
|------|----------|-----------|
| superadmin | Platform controls | Company-wide stats + user mgmt |
| hradmin | Full HR operations | 4-row KPI: workforce / approvals / workflows / compliance |
| payrolladmin | Payroll + advances + reports | Payroll status KPIs |
| manager | Team attendance/leave/overtime/disciplinary | Team today summary |
| employee | My attendance/leave/overtime/payslips/documents | ESS dashboard |
| recruiter | Pre-employment + own ESS | Recruitment + ESS |

### Source of Truth Files
- `artifacts/zenjo-ng/src/app/core/services/role-access.service.ts` — SCREEN_ACCESS_MAP, NAV_MAP per role, ACTION_ACCESS, canSeePage/canSeeWidget/canDoAction helpers
- `artifacts/zenjo-ng/src/app/core/guards/auth.guard.ts` — authGuard, guestGuard, roleGuard (route-level enforcement)
- `artifacts/zenjo-ng/src/app/app.routes.ts` — All routes wired with roleGuard + data.page key

## Multi-Tenant Architecture (v3.1+)
- **3 seeded companies**: ZenJO HR Solutions (professional), Jordan Commerce Group (starter), TechInnovate LLC (trial)
- **SuperAdmin**: CompanyId = null in DB, role = "superadmin". Gets companyId=0 in token. Bypasses all tenant filters.
- **ITenantService**: `GetCompanyId()` reads `companyId` claim. `IsSuperAdmin()` uses `IsInRole("superadmin")`.
- **TenantValidationMiddleware**: Validates that authenticated non-superadmin users have a valid companyId and active company.
- **JWT claims**: `userId`, `username`, `role` (+ `ClaimTypes.Role`), `companyId`, `employeeId`, `impersonatedBy`
- **Impersonation**: SuperAdmin can impersonate any company's HR admin. Returns `accessToken` + `user` object.
- **402 handling**: Angular interceptor redirects to `/subscription-expired` on 402 response.

## Demo Accounts
| Username | Password | Role | Company |
|----------|----------|------|---------|
| admin | Admin@1234 | superadmin | (platform) |
| hr | Hr@1234 | hradmin | Company 1 |
| hr2 | Hr@1234 | hradmin | Company 2 |
| hr3 | Hr@1234 | hradmin | Company 3 |
| payroll | Payroll@1234 | payrolladmin | Company 1 |
| manager | Manager@1234 | manager | Company 1 |
| employee | Employee@1234 | employee | Company 1 |
| emp2 | Employee@1234 | employee | Company 2 |
| emp3 | Employee@1234 | employee | Company 3 |
| recruiter | Recruiter@1234 | recruiter | Company 1 |

## v3.1 Features (32 DB Tables)
1. **Role-specific dashboards** — 6 completely different experiences per role
2. **Role-specific nav trees** — Grouped sidebar navigation, Arabic-first labels
3. **Route-level role guards** — Unauthorized routes redirect to dashboard
4. **Action-level visibility** — Buttons/forms hidden based on ACTION_ACCESS map
5. **Employees** — Full CRUD with SSC/compliance/banking sections (HR/Payroll)
6. **Pre-Employment** — Probation tracking, evaluations (HR/Recruiter)
7. **Disciplinary** — Violation workflow, 14-day window, no Fri/Sat rule (HR/Manager)
8. **Resignations** — Notice period tracking, EOSB calculation (HR)
9. **Clearance** — Multi-step clearance process (HR)
10. **Compliance** — SSC enrollment, work permits, health certs tracking (HR)
11. **Documents** — Employee document management with expiry alerts (HR/Employee)
12. **Assets** — Asset assignment/return tracking (HR)
13. **Salary Advances** — Request/approval workflow (HR/Payroll/Employee)
14. **Holidays** — Jordanian public holiday calendar (all non-superadmin)
15. **Reports** — Multi-category reports (SuperAdmin/HR/Payroll)
16. **Attendance/Leave/Overtime** — Role-scoped (own data for employee, team for manager, all for HR)
17. **Payroll** — Monthly runs + payslips with SSC/tax calculations

## Jordan-Specific Rules
- SSC: insurable salary = MIN(basic, 3000 JOD). Employee 7.5% + Employer 14.25%
- Hire 1-16 → SSC starts same month; 17+ → next month
- EOSB: resignation <3yr = 0, ≥3yr = basic×years/12. Termination = basic×years
- Disciplinary: cannot issue on Fri/Sat; 14-day window from violation (configurable)
- Income tax: 5 brackets per Jordanian law

## Key Files
- `artifacts/zenjo-api/Models/Entities.cs` — 34 entity models (multi-tenant)
- `artifacts/zenjo-api/Data/AppDbContext.cs` — EF Core context + Fluent API
- `artifacts/zenjo-api/Data/DbSeeder.cs` — v3.1 demo data (3 companies, all roles)
- `artifacts/zenjo-api/Services/TenantService.cs` — ITenantService: GetCompanyId(), IsSuperAdmin()
- `artifacts/zenjo-api/Middleware/TenantValidationMiddleware.cs` — Company validation per request
- `artifacts/zenjo-api/Controllers/AdminController.cs` — SuperAdmin: companies, impersonate, registrations
- `artifacts/zenjo-api/Controllers/RegisterController.cs` — Self-service company registration
- `artifacts/zenjo-api/start.sh` — MySQL start + DB recreate + dotnet run (always rebuilds)
- `artifacts/zenjo-ng/src/app/core/services/auth.service.ts` — JWT decode, companyId, impersonation
- `artifacts/zenjo-ng/src/app/core/services/role-access.service.ts` — RBAC source of truth
- `artifacts/zenjo-ng/src/app/features/superadmin/superadmin.component.ts` — SuperAdmin dashboard
- `artifacts/zenjo-ng/src/app/features/auth/register/register.component.ts` — 3-step registration
- `artifacts/zenjo-ng/src/app/layout/layout.component.ts` — Grouped nav + impersonation banner
- `artifacts/zenjo-ng/src/app/features/dashboard/dashboard.component.html` — 6 role-specific dashboards
- `artifacts/zenjo-ng/proxy.conf.json` — Proxies /api → localhost:5000

## MySQL Details
- Socket: `/home/runner/.zenjo-mysql/mysql.sock`
- Data dir: `/home/runner/.zenjo-mysql/data`
- DB: `zenjo`, User: `zenjo_user`, Password: `ZenJO2024!`
- Version: 8.0.42
- start.sh drops and recreates DB on every start (EnsureCreated + DbSeeder)

## JWT Config
- Key: `ZenJO-HRMS-2024-Secure-Secret-Key-Minimum32Characters!`
- Access token: 60 minutes; Refresh token: 7 days

## Forms Module (v3.2)
Full 16-form HR document engine with live split-screen preview and print support.

### Forms
| ID | Arabic Name | Category |
|----|-------------|----------|
| leave | نموذج طلب إجازة | employee |
| exit-permit | تصريح خروج | employee |
| resignation | خطاب استقالة | employee |
| salary-advance | طلب سلفة راتب | employee |
| hiring-request | طلب توظيف | recruitment |
| appointment-letter | كتاب تعيين | recruitment |
| employment-contract | عقد عمل | recruitment |
| asset-handover | استلام عهدة | assets |
| work-permit | طلب تصريح عمل | assets |
| passport-request | طلب تسليم جواز | assets |
| investigation | إشعار تحقيق | legal |
| termination | قرار إنهاء خدمة | legal |
| admin-decision | قرار إداري | legal |
| clearance | براءة ذمة | legal |
| experience-certificate | شهادة خبرة | certificates |
| letterhead | خطاب رسمي | certificates |

### Key Files
- `artifacts/zenjo-ng/src/app/features/forms/form-definitions.ts` — All 16 form type configs + HTML templates
- `artifacts/zenjo-ng/src/app/features/forms/forms.component.ts` — Category grid + recent forms list
- `artifacts/zenjo-ng/src/app/features/forms/form-viewer/form-viewer.component.ts` — Split-screen engine (fields left, preview right), save draft, print
- `artifacts/zenjo-api/Controllers/FormsController.cs` — CRUD + /employee-data/{id} + /leave-balance/{id} + /company-info
- `artifacts/zenjo-api/Models/Entities.cs` — FormRecord entity (last entry)
- Routes: `/app/forms` (list) and `/app/forms/:formId` (viewer)
- Print CSS: in `styles.scss` under `@media print`

### Architecture
- Form template engine: `getTemplate(values, empData, companyInfo)` → HTML string → `[innerHTML]` with `DomSanitizer.bypassSecurityTrustHtml()`
- Auto-fill: selecting employee triggers `/api/forms/employee-data/{id}` which returns all HR fields
- Draft save: POST to `/api/forms` creates record, PUT updates it
- Role access: all roles except superadmin can see Forms in nav

## EF Core / Pomelo 9.0.0 Critical Rules
- `new MySqlServerVersion(new Version(8, 0, 42))` — NOT AutoDetect
- Soft-delete global filter on Employee — informational warn only
- `.ToDateTime(TimeOnly.MinValue)` must be used outside LINQ (in-memory post-query)
- **NEVER** use `HasColumnType("date")` on `DateOnly?` (nullable) properties — Pomelo 9.0.0 bug maps `DateOnly?` to `TimeSpan?` internally when `HasColumnType("date")` is set, causing `InvalidOperationException: No coercion from DateTime to Nullable<TimeSpan>` at query compile time
- **Safe**: `DateOnly?` without any `HasColumnType()` — Pomelo defaults to `datetime` with a value converter that works correctly for both null and non-null values
- **Safe**: `DateOnly` (non-nullable) can use `HasColumnType("date")` without issues
- **Safe**: `TimeOnly?` with `HasColumnType("time(6)")` — time mapping is not affected by this bug
- Use `.Include()` + `.ToListAsync()` + in-memory `.Select()` for queries involving entities with `DateOnly?` fields — avoids all projection-level shaper compilation issues

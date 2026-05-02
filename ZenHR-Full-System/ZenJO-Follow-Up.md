# ZenJO HRMS — System Follow-Up Report

> **Date:** April 6, 2026  
> **Version:** v3.1  
> **Stack:** Angular 18 · .NET 9 · MySQL 8.0.42  
> **Status:** API fully operational — all 19 endpoint groups return HTTP 200 ✓

---

## 1. Overall System Status

| Layer | Component | Status |
|-------|-----------|--------|
| Database | MySQL 8.0.42 (UNIX socket) | Running ✓ |
| Backend | .NET 9 REST API (port 5000) | Running ✓ |
| Frontend | Angular 18 SPA (port 20256) | Running ✓ |
| Auth | JWT (access 60min / refresh 7d) | Working ✓ |
| Seed data | v3.1 demo data (all 6 roles) | Seeded ✓ |

---

## 2. API Endpoint Health Check

All endpoints verified with live HTTP calls using the `hr` demo account.

| Endpoint Group | HTTP | Notes |
|----------------|------|-------|
| `POST /api/auth/login` | 200 ✓ | All 6 demo accounts work |
| `GET /api/employees` | 200 ✓ | Role-scoped (HR sees all, Manager sees team) |
| `GET /api/compliance/overview` | 200 ✓ | SSC/permit/health cert summary |
| `GET /api/disciplinary` | 200 ✓ | Violation workflow |
| `GET /api/pre-employment` | 200 ✓ | Probation tracking |
| `GET /api/resignations` | 200 ✓ | **Was 500 — now fixed** |
| `GET /api/clearance` | 200 ✓ | Multi-step clearance records |
| `GET /api/assets` | 200 ✓ | Asset assignment tracking |
| `GET /api/documents` | 200 ✓ | **Was 500 — now fixed** |
| `GET /api/documents/expiring` | 200 ✓ | **Was 500 — now fixed** |
| `GET /api/salary-advances` | 200 ✓ | Advance request/approval |
| `GET /api/payroll/runs` | 200 ✓ | Monthly payroll runs |
| `GET /api/overtime` | 200 ✓ | Overtime requests |
| `GET /api/leave/requests` | 200 ✓ | Leave management |
| `GET /api/leave/balances` | 200 ✓ | Annual leave balances |
| `GET /api/reports/headcount` | 200 ✓ | Workforce analytics |
| `GET /api/reports/payroll-summary` | 200 ✓ | Payroll analytics |
| `GET /api/users` | 200 ✓ | User management (SuperAdmin/HR) |
| `GET /api/notifications` | 200 ✓ | Per-user notification feed |
| `GET /api/lookups/nationalities` | 200 ✓ | Reference data lookups |

**Total: 19/19 endpoint groups returning 200**

---

## 3. Backend Controllers (23 total)

| Controller | File | Endpoints |
|------------|------|-----------|
| `AuthController` | `AuthController.cs` | login, refresh, logout, me |
| `EmployeesController` | `EmployeesController.cs` | CRUD + documents + assets |
| `DepartmentsController` | `DepartmentsController.cs` | CRUD |
| `JobTitlesController` | `JobTitlesController.cs` | CRUD |
| `BanksController` | `BanksController.cs` | List |
| `UsersController` | `UsersController.cs` | CRUD + role assignment |
| `AttendanceController` | `AttendanceController.cs` | clock-in/out + summary |
| `LeaveController` | `LeaveController.cs` | types, requests, balances, approve/reject |
| `OvertimeController` | `OvertimeController.cs` | requests, approve/reject |
| `PayrollController` | `PayrollController.cs` | runs, payslips, approve |
| `PreEmploymentController` | `PreEmploymentController.cs` | probation + evaluation |
| `ResignationController` | `ResignationController.cs` | submit, acknowledge, complete |
| `ClearanceController` | `ClearanceController.cs` | clearance checklist |
| `DisciplinaryController` | `DisciplinaryController.cs` | violations, deadline check |
| `ComplianceController` | `ComplianceController.cs` | overview, alerts, update |
| `SalaryAdvancesController` | `SalaryAdvancesController.cs` | request, approve/reject |
| `AssetsController` | `AssetsController.cs` | CRUD + assign/return |
| `DocumentsController` | `DocumentsController.cs` | CRUD + expiring alerts |
| `ReportsController` | `ReportsController.cs` | headcount, payroll, turnover, leave |
| `DashboardController` | `DashboardController.cs` | role-specific dashboard data |
| `ConfigController` | `ConfigController.cs` | system configuration key-value |
| `NotificationsController` | `NotificationsController.cs` | list + mark read |
| `LookupsController` | `LookupsController.cs` | nationalities, governorates, cities, violations, asset categories |

---

## 4. Angular Pages (20 feature modules)

| Route | Page | Roles |
|-------|------|-------|
| `#/dashboard` | Role-specific dashboard (6 variants) | All |
| `#/employees` | Employee list + filters | HR, Payroll |
| `#/employees/new` | Create employee | HR |
| `#/employees/:id` | Employee detail + tabs | HR, Payroll |
| `#/attendance` | Attendance records | All |
| `#/leave` | Leave requests + balances | All |
| `#/overtime` | Overtime requests | All |
| `#/payroll` | Payroll runs + payslips | Payroll, HR |
| `#/pre-employment` | Pre-employment / probation | HR, Recruiter |
| `#/disciplinary` | Disciplinary actions | HR, Manager |
| `#/resignations` | Resignation workflow | HR |
| `#/clearance` | Clearance records | HR |
| `#/compliance` | Compliance overview + alerts | HR |
| `#/documents` | Employee documents + expiry | HR, Employee |
| `#/assets` | Asset assignment | HR |
| `#/advances` | Salary advances | HR, Payroll, Employee |
| `#/reports` | Multi-category reports | SuperAdmin, HR, Payroll |
| `#/settings` | System settings | HR |
| `#/users` | User management | SuperAdmin, HR |
| `#/holidays` | Public holiday calendar | All except SuperAdmin |

---

## 5. Role-Based Access (6 Roles)

| Role | Username | Password | Experience Layer |
|------|----------|----------|-----------------|
| Super Admin | `admin` | `Admin@1234` | Platform only — user mgmt, settings, reports |
| HR Admin | `hr` | `Hr@1234` | Full HR operations — all modules |
| Payroll Admin | `payroll` | `Payroll@1234` | Payroll, advances, reports |
| Manager | `manager` | `Manager@1234` | Team: attendance, leave, overtime, disciplinary |
| Employee | `employee` | `Employee@1234` | Self-service: own data, payslips, leave, documents |
| Recruiter | `recruiter` | `Recruiter@1234` | Pre-employment + own ESS |

**RBAC is enforced at three levels:**
1. **Route level** — `roleGuard` in `app.routes.ts` redirects unauthorized routes
2. **Nav level** — Sidebar built from `NAV_MAP[role]` in `role-access.service.ts`
3. **Action level** — Buttons/forms hidden by `canDoAction()` checks

---

## 6. Database — 32 Tables

### Reference / Lookup (10 tables)
`companies` · `departments` · `job_titles` · `banks` · `nationalities` · `governorates` · `cities` · `violation_types` · `asset_categories` · `document_types`

### Core (2 tables)
`employees` (70+ columns) · `users`

### Time & Attendance (6 tables)
`attendance_records` · `leave_types` · `leave_policies` · `leave_balances` · `leave_requests` · `overtime_requests`

### Payroll (2 tables)
`payroll_runs` · `payslips`

### HR Workflows — v3.1 new (5 tables)
`pre_employment_records` · `resignations` · `clearance_records` · `disciplinary_actions` · `salary_advances`

### Compliance & Assets (3 tables)
`employee_compliance_statuses` · `assets` · `documents`

### System (4 tables)
`system_configurations` · `activity_logs` · `public_holidays` · `notifications`

---

## 7. Jordanian Labour Law Rules Implemented

| Rule | Implementation |
|------|----------------|
| **SSC employee contribution** | 7.5% of insurable salary |
| **SSC employer contribution** | 14.25% of insurable salary |
| **SSC insurable ceiling** | MIN(basicSalary, 3000 JOD) |
| **SSC start month** | Hire day 1–16 → same month; 17+ → next month |
| **EOSB on resignation** | < 3 years = 0; ≥ 3 years = basic × years / 12 |
| **EOSB on termination** | basic × years (full) |
| **Disciplinary window** | Cannot issue on Friday/Saturday; 14-day window from violation (configurable via `system_configurations`) |
| **Income tax** | 5 Jordanian tax brackets applied in payslip calculation |

---

## 8. Critical Bug Fixed This Session

### Pomelo 9.0.0 — `HasColumnType("date")` on `DateOnly?`

**Symptoms:**  
`/api/resignations`, `/api/documents`, `/api/documents/expiring` all returned HTTP 500 with:
```
System.InvalidOperationException: No coercion operator is defined
between types 'System.DateTime' and 'System.Nullable<TimeSpan>'.
```

**Root Cause:**  
When `HasColumnType("date")` is set on a `DateOnly?` (nullable) property in `AppDbContext`, Pomelo 9.0.0 incorrectly maps the type to `TimeSpan?` internally during EF Core query shaper compilation. The MySQL connector returns `DateTime` for date columns, and EF Core then tries — and fails — to coerce `DateTime → Nullable<TimeSpan>`.

**Why some entities worked:**  
`Employee` has 15 nullable `DateOnly?` fields and never failed, because those fields had **no** `HasColumnType()` annotation. Without it, Pomelo defaults to a `datetime` column with a value-converter to `DateOnly`, which correctly handles nullability.

**Fix Applied:**
1. Removed all `HasColumnType("date")` annotations from `DateOnly?` properties in `Resignation` and `Document` entities in `AppDbContext.cs`
2. Converted both controllers from SQL-level `.Select()` projections to the safer `.Include()` → `.ToListAsync()` → in-memory mapping pattern

**The Rule Going Forward:**

| Scenario | Safe? |
|----------|-------|
| `DateOnly?` — no `HasColumnType()` annotation | ✓ Safe |
| `DateOnly?` — with `HasColumnType("date")` | ✗ Crash |
| `DateOnly` (non-nullable) — with `HasColumnType("date")` | ✓ Safe |
| `TimeOnly?` — with `HasColumnType("time(6)")` | ✓ Safe |
| In-memory mapping after `ToListAsync()` | ✓ Safe for all date types |

---

## 9. Architecture Decisions to Preserve

### Controller Pattern
All read endpoints that join entities with `DateOnly?` fields must use:
```csharp
// CORRECT — fetch full entities, map in-memory
var raw = await db.Resignations
    .Include(r => r.Employee!).ThenInclude(e => e!.Department)
    .Where(...)
    .ToListAsync();

var data = raw.Select(r => new { ... });  // in-memory, no DB compile

// WRONG — SQL-level projection with DateOnly?
await db.Resignations
    .Select(r => new { r.NoticeTimerStart, r.ClearanceCompletedDate })  // crash!
    .ToListAsync();
```

### EF Core Config
```csharp
options.UseMySql(connStr, new MySqlServerVersion(new Version(8, 0, 42)))
// Always pin the version — do NOT use ServerVersion.AutoDetect()
```

### MySQL Connection
```
Server=/home/runner/.zenjo-mysql/mysql.sock;Database=zenjo;
User=zenjo_user;Password=ZenJO2024!;CharSet=utf8mb4;SslMode=None;
```

### JWT
```
Key: ZenJO-HRMS-2024-Secure-Secret-Key-Minimum32Characters!
Access token: 60 min  |  Refresh token: 7 days
```

---

## 10. File Structure

```
artifacts/
├── zenjo-api/                          .NET 9 Backend
│   ├── Controllers/                    23 controllers
│   ├── Data/
│   │   ├── AppDbContext.cs             EF Core context (Fluent API config)
│   │   └── DbSeeder.cs                 v3.1 demo data seed
│   ├── Models/
│   │   └── Entities.cs                 32 entity models
│   ├── start.sh                        MySQL start + DB recreate + dotnet run
│   └── Program.cs                      Middleware pipeline + JWT + CORS
│
└── zenjo-ng/                           Angular 18 Frontend
    ├── proxy.conf.json                  /api → localhost:5000
    └── src/app/
        ├── core/
        │   ├── services/
        │   │   ├── auth.service.ts      JWT storage + login/logout
        │   │   ├── api.service.ts       HTTP client wrapper
        │   │   └── role-access.service.ts  RBAC: SCREEN_ACCESS_MAP, NAV_MAP, ACTION_ACCESS
        │   └── guards/
        │       └── auth.guard.ts        authGuard, roleGuard, guestGuard
        ├── layout/
        │   └── layout.component.ts      Grouped sidebar from RoleAccessService
        ├── features/                    20 lazy-loaded feature modules
        │   ├── dashboard/
        │   ├── employees/
        │   ├── attendance/
        │   ├── leave/
        │   ├── overtime/
        │   ├── payroll/
        │   ├── pre-employment/
        │   ├── disciplinary/
        │   ├── resignations/
        │   ├── clearance/
        │   ├── compliance/
        │   ├── documents/
        │   ├── assets/
        │   ├── advances/
        │   ├── reports/
        │   ├── settings/
        │   ├── users/
        │   ├── holidays/
        │   └── auth/
        └── app.routes.ts               All routes with roleGuard + data.page key
```

---

## 11. Pending / Remaining Work

The following items are not yet implemented and represent potential next steps:

### Backend
- [ ] Attendance — clock-in/out validation (prevent double clock-in, enforce shift hours)
- [ ] Payroll run — auto-calculate payslips on run creation (SSC + tax + deductions)
- [ ] Leave balance — auto-reset/carry-forward on year change
- [ ] Notifications — auto-generate on workflow state changes (resignation submitted, leave approved, etc.)
- [ ] Email integration — send notification emails (SMTP or SendGrid)
- [ ] File upload — actual file storage for documents (currently stores filename/URL string only)
- [ ] Audit log — populate `activity_logs` table from controller actions
- [ ] Multi-tenant isolation — currently hardcoded `CompanyId = 1`; needs dynamic from JWT claim

### Frontend
- [ ] Employee detail page — full tab layout (Personal, Employment, SSC, Banking, Compliance, Documents)
- [ ] Payroll run — UI to trigger a run and view generated payslips
- [ ] Leave calendar view — visual calendar for team leave
- [ ] Overtime approval flow — manager approve/reject UI
- [ ] Document upload — file picker + upload to storage
- [ ] Reports — charts and export to Excel/PDF
- [ ] RTL polish — verify all new v3.1 pages have correct Arabic RTL layout
- [ ] Mobile responsiveness — sidebar collapse, table scroll on small screens
- [ ] Toast notifications — success/error feedback on form submissions
- [ ] Loading states — skeleton loaders on data-heavy pages

### Infrastructure
- [ ] Deploy to production (Replit Deploy)
- [ ] Environment-specific connection strings (dev vs prod)
- [ ] Database backup strategy
- [ ] Rate limiting on API endpoints

---

## 12. Quick Reference — Start & Test

### Start the system
Both workflows auto-start. If restarting manually:
1. Restart `ZenJO API` workflow — this runs `start.sh` which: starts MySQL, drops+recreates the DB, seeds v3.1 data, then starts the .NET API
2. Restart `artifacts/zenjo: web` workflow — Angular dev server with proxy

### Test login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"hr","password":"Hr@1234"}'
```

### Full API health check
```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"hr","password":"Hr@1234"}' \
  | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//;s/"//')

for ep in employees disciplinary resignations documents payroll/runs; do
  echo "$ep → $(curl -s -o /dev/null -w '%{http_code}' \
    http://localhost:5000/api/$ep -H "Authorization: Bearer $TOKEN")"
done
```

---

*Last updated: April 6, 2026 — all 19 API endpoint groups verified at HTTP 200*

# ZenJO HRMS — Complete System Documentation

> **Jordanian Multi-Tenant HR Management System**  
> Stack: Angular 18 · .NET 9 · MySQL 8 · REST API · JWT Auth  
> Version: 3.1 | Language: Arabic-first (RTL) + English

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack — Exact Versions](#3-tech-stack--exact-versions)
4. [Database — 32 Tables](#4-database--32-tables)
5. [REST API — All Endpoints](#5-rest-api--all-endpoints)
6. [Authentication & JWT](#6-authentication--jwt)
7. [Role-Based Access Control](#7-role-based-access-control)
8. [Angular Frontend](#8-angular-frontend)
9. [Backend .NET 9](#9-backend-net-9)
10. [Jordanian Labor Law Rules](#10-jordanian-labor-law-rules)
11. [File Structure](#11-file-structure)
12. [Startup & Environment](#12-startup--environment)
13. [Demo Accounts](#13-demo-accounts)

---

## 1. System Overview

ZenJO is an enterprise-grade, **multi-tenant** HRMS built specifically for **Jordanian companies**. It enforces Jordanian labour law (Social Security Corporation rules, income tax brackets, EOSB, disciplinary procedures) and provides 6 completely isolated role-based product experiences.

**Platform model:**
- Multiple companies share one platform
- Each company's data is fully isolated (`company_id` scoping on every query)
- Non-superadmin users never see data outside their own company

**Two layers:**
- **Platform Layer** — SuperAdmin manages companies, users, system settings
- **Tenant Layer** — HR Admin, Payroll Admin, Manager, Employee, Recruiter see only their company's operational data

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Angular 18 SPA)                               │
│  Hash routing (#)  ·  RTL-first  ·  Arabic + English    │
│  Port: 20256 (Replit artifact proxy)                    │
└───────────────────┬─────────────────────────────────────┘
                    │  HTTP /api/** (proxied)
                    ▼
┌─────────────────────────────────────────────────────────┐
│  .NET 9 ASP.NET Core REST API                           │
│  Port: 5000  ·  JWT Bearer Auth  ·  23 controllers      │
│  EF Core 9 + Pomelo MySQL Provider                      │
└───────────────────┬─────────────────────────────────────┘
                    │  UNIX socket
                    ▼
┌─────────────────────────────────────────────────────────┐
│  MySQL 8.0.42                                           │
│  Socket: /home/runner/.zenjo-mysql/mysql.sock           │
│  DB: zenjo  ·  User: zenjo_user  ·  32 tables           │
│  Charset: utf8mb4_unicode_ci                            │
└─────────────────────────────────────────────────────────┘
```

**Proxy:**  
Angular dev server proxies all `/api/**` requests to `http://localhost:5000` via `proxy.conf.json`.

---

## 3. Tech Stack — Exact Versions

### Frontend

| Package | Version |
|---------|---------|
| `@angular/core` | 18.2.0 |
| `@angular/router` | 18.2.0 |
| `@angular/forms` | 18.2.0 |
| `@angular/animations` | 18.2.0 |
| `@angular/common` | 18.2.0 |
| `@angular-devkit/build-angular` | 18.2.21 |
| `@angular/cli` | 18.2.21 |
| `rxjs` | 7.8.0 |
| `typescript` | 5.5.2 |
| `zone.js` | 0.14.10 |
| Node.js runtime | 24.12.0 |

**Angular config:**
- Standalone components (no NgModules)
- Signals (`signal()`, `computed()`) for state
- Hash-based routing: `withHashLocation()`
- Lazy-loaded route chunks per feature
- SCSS global styles (`styles.scss`)
- Material Icons (CDN via `index.html`)
- Cairo + Inter fonts (Google Fonts CDN)

### Backend

| Package | Version |
|---------|---------|
| .NET / ASP.NET Core | 9.0.308 |
| `Pomelo.EntityFrameworkCore.MySql` | 9.0.0 |
| `Microsoft.EntityFrameworkCore.Design` | 9.0.0 |
| `Microsoft.AspNetCore.Authentication.JwtBearer` | 9.0.0 |
| `BCrypt.Net-Next` | 4.0.3 |

**EF Core config:**
```csharp
options.UseMySql(connStr, new MySqlServerVersion(new Version(8, 0, 42)))
// NOT AutoDetect — version is pinned
```

### Database

| Property | Value |
|----------|-------|
| Engine | MySQL 8.0.42 |
| Charset | utf8mb4 |
| Collation | utf8mb4_unicode_ci |
| Connection | UNIX socket only |
| Socket path | `/home/runner/.zenjo-mysql/mysql.sock` |
| Database name | `zenjo` |
| Username | `zenjo_user` |
| Password | `ZenJO2024!` |

---

## 4. Database — 32 Tables

### Reference / Lookup Tables

| Table | Entity | Purpose |
|-------|--------|---------|
| `companies` | `Company` | Multi-tenant company registry |
| `departments` | `Department` | Company departments, manager assignment |
| `job_titles` | `JobTitle` | Job grades, salary min/max |
| `banks` | `Bank` | Jordanian banks list |
| `nationalities` | `Nationality` | Nationality reference data |
| `governorates` | `Governorate` | Jordanian governorates |
| `cities` | `City` | Cities per governorate |
| `violation_types` | `ViolationType` | Disciplinary violation codes |
| `asset_categories` | `AssetCategory` | Asset classification |
| `document_types` | `DocumentType` | HR document types |

### Core Employee & User Tables

| Table | Entity | Key Fields |
|-------|--------|-----------|
| `employees` | `Employee` | 70+ fields: names AR/EN, salary components, SSC, work permit, residency, passport, health cert, bank account, IBAN, hire date, status |
| `users` | `User` | Auth accounts linked to employees, role, bcrypt password |

### Time & Attendance

| Table | Entity | Key Fields |
|-------|--------|-----------|
| `attendance_records` | `AttendanceRecord` | date, clock_in (DateTime?), clock_out (DateTime?), status, late_minutes, worked_minutes, overtime_minutes |
| `leave_types` | `LeaveType` | name AR/EN, paid flag, default days, gender restriction, once-in-career |
| `leave_policies` | `LeavePolicy` | Per-company leave type config |
| `leave_balances` | `LeaveBalance` | Employee leave balance per year |
| `leave_requests` | `LeaveRequest` | Request with status workflow: pending → manager_approved → approved/rejected |
| `overtime_requests` | `OvertimeRequest` | Date, hours, type (regular/weekend/holiday), compensation type (cash/compensatory), status |

### Payroll

| Table | Entity | Key Fields |
|-------|--------|-----------|
| `payroll_runs` | `PayrollRun` | Month, year, status (draft/approved/paid), totals |
| `payslips` | `Payslip` | Per-employee payslip: basic, allowances, SSC deduction, income tax, net salary |

### HR Workflows (v3.1)

| Table | Entity | Key Fields |
|-------|--------|-----------|
| `pre_employment_records` | `PreEmploymentRecord` | Probation start/end, evaluation date, SSC registration, status |
| `resignations` | `Resignation` | Resignation date, last working day, notice period days, notice timer start/end, clearance completed |
| `clearance_records` | `ClearanceRecord` | Multi-department clearance checklist, EOSB amount, completion date |
| `disciplinary_actions` | `DisciplinaryAction` | Violation type, violation date, action deadline, issued date, acknowledged flag |
| `salary_advances` | `SalaryAdvance` | Request date, amount, installments, status, approved by |

### Compliance & Assets

| Table | Entity | Key Fields |
|-------|--------|-----------|
| `employee_compliance_statuses` | `EmployeeComplianceStatus` | SSC enrollment date, work permit expiry, residency expiry, health certificate expiry |
| `assets` | `Asset` | Serial number, category, assigned employee, assigned date, expected return |
| `documents` | `Document` | Document type, issue date, expiry date, file reference, alert days before expiry |

### System

| Table | Entity | Key Fields |
|-------|--------|-----------|
| `system_configurations` | `SystemConfiguration` | Key-value config store (disciplinary_window_days, etc.) |
| `activity_logs` | `ActivityLog` | Audit trail: user, action, entity, timestamp |
| `public_holidays` | `PublicHoliday` | Jordan public holiday calendar, year, date, name AR/EN |
| `notifications` | `Notification` | Per-user notification with read status |

**Total: 32 tables**

---

## 5. REST API — All Endpoints

Base URL: `http://localhost:5000` (proxied as `/api` from Angular)  
All responses: `{ "success": true, "data": ... }` envelope

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | None | Login with username + password → access + refresh tokens |
| POST | `/api/auth/refresh` | None | Refresh access token using refresh token |
| POST | `/api/auth/logout` | Bearer | Logout (clears refresh token) |
| GET | `/api/auth/me` | Bearer | Get current user profile |

### Employees — `/api/employees`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/employees` | hradmin, payrolladmin | List all employees with filters |
| GET | `/api/employees/{id}` | hradmin, payrolladmin | Get employee by ID |
| POST | `/api/employees` | hradmin | Create new employee |
| PUT | `/api/employees/{id}` | hradmin | Update employee |
| DELETE | `/api/employees/{id}` | hradmin | Soft-delete employee |
| GET | `/api/employees/{id}/documents` | hradmin | Get employee documents |
| GET | `/api/employees/{id}/assets` | hradmin | Get employee assets |

### Attendance — `/api/attendance`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/attendance` | Authenticated | List records (scoped by role) |
| POST | `/api/attendance/clock-in` | Authenticated | Record clock-in |
| POST | `/api/attendance/clock-out` | Authenticated | Record clock-out |
| GET | `/api/attendance/summary` | Authenticated | Summary stats |

### Leave — `/api/leave`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/leave/types` | Authenticated | All leave types |
| GET | `/api/leave/requests` | Authenticated | Requests (role-scoped) |
| POST | `/api/leave/requests` | Authenticated | Submit leave request |
| POST | `/api/leave/requests/{id}/approve` | hradmin, manager | Approve request |
| POST | `/api/leave/requests/{id}/reject` | hradmin, manager | Reject request |
| POST | `/api/leave/requests/{id}/cancel` | Authenticated | Cancel own request |
| GET | `/api/leave/balances` | Authenticated | Leave balances |

### Overtime — `/api/overtime`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/overtime` | Authenticated | List requests (role-scoped) |
| POST | `/api/overtime` | Authenticated | Submit overtime request |
| POST | `/api/overtime/{id}/approve` | hradmin, manager | Approve |
| POST | `/api/overtime/{id}/reject` | hradmin, manager | Reject |

### Payroll — `/api/payroll`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/payroll/runs` | payrolladmin, hradmin | All payroll runs |
| POST | `/api/payroll/runs` | payrolladmin | Create payroll run |
| GET | `/api/payroll/runs/{id}/payslips` | payrolladmin, hradmin | Payslips in run |
| POST | `/api/payroll/runs/{id}/approve` | payrolladmin | Approve payroll run |
| GET | `/api/payroll/slips/my` | employee, recruiter | My own payslips |
| GET | `/api/payroll/slips/{id}` | Authenticated | Single payslip |

### Pre-Employment — `/api/pre-employment`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/pre-employment` | hradmin, recruiter | List records |
| GET | `/api/pre-employment/{id}` | hradmin, recruiter | Get record |
| POST | `/api/pre-employment` | hradmin, recruiter | Create record |
| PUT | `/api/pre-employment/{id}/evaluate` | hradmin | Submit evaluation |
| PUT | `/api/pre-employment/{id}/ssc-register` | hradmin | Mark SSC registered |

### Resignations — `/api/resignations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/resignations` | hradmin | List (employee sees own) |
| GET | `/api/resignations/{id}` | hradmin | Get by ID |
| POST | `/api/resignations` | Authenticated | Submit resignation |
| PUT | `/api/resignations/{id}/acknowledge` | hradmin | HR acknowledges |
| PUT | `/api/resignations/{id}/complete` | hradmin | Mark completed, set clearance |

### Clearance — `/api/clearance`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/clearance` | hradmin | List clearance records |
| GET | `/api/clearance/{id}` | hradmin | Get record |
| POST | `/api/clearance` | hradmin | Create clearance |
| PUT | `/api/clearance/{id}` | hradmin | Update clearance status |
| GET | `/api/clearance/calculate-eosb/{employeeId}` | hradmin | Calculate EOSB |

### Disciplinary — `/api/disciplinary`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/disciplinary` | hradmin, manager | List actions |
| GET | `/api/disciplinary/{id}` | hradmin, manager | Get action |
| POST | `/api/disciplinary` | hradmin | Issue disciplinary action |
| PUT | `/api/disciplinary/{id}/acknowledge` | hradmin | Mark acknowledged |
| PUT | `/api/disciplinary/{id}/cancel` | hradmin | Cancel action |

### Compliance — `/api/compliance`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/compliance/overview` | hradmin | Compliance dashboard |
| GET | `/api/compliance/work-permits` | hradmin | Work permit status list |
| GET | `/api/compliance/ssc-status` | hradmin | SSC enrollment status |
| PUT | `/api/compliance/employees/{id}/work-permit` | hradmin | Update work permit |
| PUT | `/api/compliance/employees/{id}/health-certificate` | hradmin | Update health cert |
| PUT | `/api/compliance/employees/{id}/ssc` | hradmin | Update SSC status |

### Documents — `/api/documents`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/documents` | hradmin, employee | List documents |
| GET | `/api/documents/{id}` | hradmin, employee | Get document |
| POST | `/api/documents` | hradmin | Upload document |
| PUT | `/api/documents/{id}` | hradmin | Update document |
| DELETE | `/api/documents/{id}` | hradmin | Soft-delete document |
| GET | `/api/documents/expiring` | hradmin | Documents expiring within N days |

### Assets — `/api/assets`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/assets` | hradmin | List assets |
| GET | `/api/assets/{id}` | hradmin | Get asset |
| POST | `/api/assets` | hradmin | Create asset |
| PUT | `/api/assets/{id}` | hradmin | Update asset |
| POST | `/api/assets/{id}/assign` | hradmin | Assign to employee |
| POST | `/api/assets/{id}/return` | hradmin | Record return |
| DELETE | `/api/assets/{id}` | hradmin | Soft-delete |

### Salary Advances — `/api/salary-advances`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/salary-advances` | hradmin, payrolladmin, employee | List (role-scoped) |
| POST | `/api/salary-advances` | Authenticated | Submit request |
| PUT | `/api/salary-advances/{id}/approve` | hradmin, payrolladmin | Approve |
| PUT | `/api/salary-advances/{id}/reject` | hradmin, payrolladmin | Reject |

### Dashboard — `/api/dashboard`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/summary` | Authenticated | KPI summary object |
| GET | `/api/dashboard/headcount-by-department` | Authenticated | Dept headcount array |
| GET | `/api/dashboard/gender-distribution` | Authenticated | Gender breakdown |
| GET | `/api/dashboard/nationality-distribution` | Authenticated | Nationality breakdown |
| GET | `/api/dashboard/recent-activity` | Authenticated | Activity log |
| GET | `/api/dashboard/attendance-trend` | Authenticated | Last 7 days attendance |
| GET | `/api/dashboard/compliance-alerts` | Authenticated | Compliance alerts |

### Reports — `/api/reports`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/reports/headcount` | superadmin, hradmin, payrolladmin | Headcount report |
| GET | `/api/reports/payroll-summary` | superadmin, hradmin, payrolladmin | Payroll summary |
| GET | `/api/reports/leave-summary` | superadmin, hradmin, payrolladmin | Leave summary |
| GET | `/api/reports/attendance-summary` | superadmin, hradmin, payrolladmin | Attendance summary |
| GET | `/api/reports/compliance-summary` | superadmin, hradmin, payrolladmin | Compliance summary |
| GET | `/api/reports/ssc-contributions` | superadmin, hradmin, payrolladmin | SSC contribution report |
| GET | `/api/reports/disciplinary-summary` | superadmin, hradmin, payrolladmin | Disciplinary summary |

### Administration

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | superadmin, hradmin | List users |
| POST | `/api/users` | superadmin, hradmin | Create user |
| PATCH | `/api/users/{id}/toggle-active` | superadmin, hradmin | Enable/disable user |
| PATCH | `/api/users/{id}/reset-password` | superadmin, hradmin | Reset password |
| GET | `/api/departments` | Authenticated | List departments |
| POST | `/api/departments` | hradmin | Create department |
| PUT | `/api/departments/{id}` | hradmin | Update department |
| DELETE | `/api/departments/{id}` | hradmin | Delete department |
| GET | `/api/job-titles` | Authenticated | List job titles |
| POST | `/api/job-titles` | hradmin | Create job title |
| PUT | `/api/job-titles/{id}` | hradmin | Update job title |
| GET | `/api/config` | superadmin, hradmin | List system configs |
| GET | `/api/config/{key}` | superadmin, hradmin | Get config value |
| PUT | `/api/config/{key}` | superadmin, hradmin | Update config value |
| PATCH | `/api/config/bulk` | superadmin, hradmin | Bulk update configs |
| GET | `/api/notifications` | Authenticated | My notifications |
| POST | `/api/notifications/{id}/read` | Authenticated | Mark read |

### Lookups — `/api/lookups`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/lookups/nationalities` | Authenticated | Nationality list |
| GET | `/api/lookups/governorates` | Authenticated | Governorate list |
| GET | `/api/lookups/cities` | Authenticated | Cities list |
| GET | `/api/lookups/violation-types` | Authenticated | Disciplinary violation types |
| GET | `/api/lookups/asset-categories` | Authenticated | Asset categories |
| GET | `/api/lookups/document-types` | Authenticated | Document types |
| GET | `/api/banks` | Authenticated | Jordanian banks list |

**Total: 23 controllers, 75+ endpoints**

---

## 6. Authentication & JWT

**Flow:**
1. Client POSTs `{ username, password }` to `/api/auth/login`
2. Server verifies password with BCrypt (`BCrypt.Net-Next v4.0.3`)
3. Server issues `accessToken` (JWT, 60 minutes) + `refreshToken` (JWT, 7 days)
4. Client stores both in `localStorage`
5. Client attaches `Authorization: Bearer <accessToken>` on every request
6. On 401, client uses `/api/auth/refresh` to get a new access token

**JWT Configuration:**
```json
{
  "Jwt": {
    "Key": "ZenJO-HRMS-2024-Secure-Secret-Key-Minimum32Characters!",
    "AccessTokenExpiryMinutes": 60,
    "RefreshTokenExpiryDays": 7
  }
}
```

**JWT Claims:**
- `userId` — user ID
- `username` — username string
- `role` — role name (superadmin, hradmin, payrolladmin, manager, employee, recruiter)
- `employeeId` — linked employee ID (if applicable)
- Standard: `ClockSkew = TimeSpan.Zero`

**Validation:**
- `ValidateIssuerSigningKey = true`
- `ValidateIssuer = false`
- `ValidateAudience = false`

---

## 7. Role-Based Access Control

### Two-Layer Architecture

```
Platform Layer          Tenant / Company Layer
─────────────          ──────────────────────
superadmin             hradmin · payrolladmin · manager · employee · recruiter
```

### Screen Access Map

| Page/Route | superadmin | hradmin | payrolladmin | manager | employee | recruiter |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|
| dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| employees | — | ✓ | ✓ | — | — | — |
| pre-employment | — | ✓ | — | — | — | ✓ |
| disciplinary | — | ✓ | — | ✓ | — | — |
| resignations | — | ✓ | — | — | — | — |
| clearance | — | ✓ | — | — | — | — |
| compliance | — | ✓ | — | — | — | — |
| assets | — | ✓ | — | — | — | — |
| attendance | — | ✓ | — | ✓ | ✓ | ✓ |
| leave | — | ✓ | — | ✓ | ✓ | ✓ |
| overtime | — | ✓ | — | ✓ | ✓ | ✓ |
| payroll | — | — | ✓ | — | ✓ | ✓ |
| documents | — | ✓ | — | — | ✓ | — |
| advances | — | ✓ | ✓ | — | ✓ | — |
| holidays | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| reports | ✓ | ✓ | ✓ | — | — | — |
| users | ✓ | ✓ | — | — | — | — |
| settings | ✓ | ✓ | — | — | — | — |

### Navigation Trees per Role

**SuperAdmin — Platform:**
- لوحة تحكم النظام / Platform Dashboard
- إدارة المستخدمين / User Management
- الإعدادات العامة / System Settings
- التقارير / Platform Reports

**HR Admin — Full HR Operations (6 groups):**
- Overview: لوحة التحكم
- Employee Management: الموظفون، ما قبل التوظيف، التأديب، الاستقالات، براءة الذمة
- Time & Attendance: الحضور، الإجازات، العمل الإضافي، الإجازات الرسمية
- Compliance & Assets: الامتثال، الوثائق، الأصول
- Finance: السلف
- Administration: التقارير، المستخدمون، الإعدادات

**Payroll Admin:**
- لوحة الرواتب
- مسيرات الرواتب، السلف
- الموظفون (read-only)، الإجازات الرسمية، التقارير

**Manager:**
- لوحة الفريق
- التأديب، حضور الفريق، طلبات إجازة الفريق، عمل إضافي الفريق، الإجازات الرسمية

**Employee (ESS):**
- لوحتي
- حضوري، إجازاتي، ساعاتي الإضافية، مسير راتبي، مستنداتي، الإجازات الرسمية

**Recruiter:**
- لوحة التوظيف
- ما قبل التوظيف
- حضوري، إجازاتي، مسير راتبي، الإجازات الرسمية

### Action Access Map

| Action | superadmin | hradmin | payrolladmin | manager | employee | recruiter |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| employee:create | — | ✓ | — | — | — | — |
| employee:edit | — | ✓ | — | — | — | — |
| employee:viewSalary | — | ✓ | ✓ | — | — | — |
| employee:viewSSC | — | ✓ | ✓ | — | — | — |
| leave:approve | — | ✓ | — | ✓ | — | — |
| overtime:approve | — | ✓ | — | ✓ | — | — |
| payroll:run | — | — | ✓ | — | — | — |
| advance:approve | — | ✓ | ✓ | — | — | — |
| disciplinary:create | — | ✓ | — | — | — | — |
| document:upload | — | ✓ | — | — | — | — |
| asset:assign | — | ✓ | — | — | — | — |
| user:create | ✓ | ✓ | — | — | — | — |
| settings:edit | ✓ | ✓ | — | — | — | — |

### Route Guard Implementation

```typescript
// auth.guard.ts — roleGuard
export const roleGuard: CanActivateFn = (route) => {
  const page: string = route.data?.['page'] ?? '';
  const role = auth.currentUser()?.role ?? '';
  const allowed = SCREEN_ACCESS[page] ?? [];
  if (allowed.includes(role)) return true;
  router.navigate(['/app/dashboard']); // redirect, not 403
  return false;
};
```

Route definition example:
```typescript
{ path: 'disciplinary', canActivate: [roleGuard], data: { page: 'disciplinary' }, ... }
```

---

## 8. Angular Frontend

### Application Structure

```
artifacts/zenjo-ng/src/app/
├── app.config.ts              # provideRouter, provideHttpClient, interceptors
├── app.routes.ts              # All routes with roleGuard
├── core/
│   ├── guards/
│   │   └── auth.guard.ts      # authGuard, guestGuard, roleGuard
│   ├── interceptors/
│   │   └── auth.interceptor.ts # Attaches JWT, handles 401 refresh
│   ├── models/
│   │   └── index.ts           # All TypeScript interfaces + constants
│   └── services/
│       ├── api.service.ts     # HTTP wrapper (get/post/put/patch/delete)
│       ├── auth.service.ts    # Login, logout, token management, signals
│       └── role-access.service.ts # SCREEN_ACCESS, NAV_MAP, ACTION_ACCESS
├── layout/
│   ├── layout.component.ts    # Shell with grouped sidebar from RoleAccessService
│   ├── layout.component.html  # Sidebar nav groups + top bar
│   └── layout.component.scss  # Sidebar styles, nav-group-label
└── features/
    ├── auth/login/            # Login page with quick-login demo buttons
    ├── dashboard/             # 6 role-specific dashboard views
    ├── employees/             # Employee CRUD + 3-section modal
    ├── attendance/            # Attendance grid + clock in/out
    ├── leave/                 # Leave requests + type tabs
    ├── overtime/              # Overtime requests
    ├── payroll/               # Payroll runs + payslips
    ├── pre-employment/        # Probation tracking
    ├── disciplinary/          # Disciplinary actions
    ├── resignations/          # Resignation workflow
    ├── clearance/             # Clearance checklist
    ├── compliance/            # SSC + work permits + health certs
    ├── assets/                # Asset management
    ├── documents/             # Document management
    ├── advances/              # Salary advance requests
    ├── holidays/              # Public holiday calendar
    ├── reports/               # 7 report types
    ├── settings/              # System configuration
    └── users/                 # User management
```

**Total: 18 feature pages (all lazy-loaded)**

### Key Frontend Patterns

**Signals for state:**
```typescript
user = signal<User | null>(null);
loading = signal(true);
summary = signal<DashboardSummary | null>(null);
```

**Computed navigation:**
```typescript
navGroups = this.access.getNavGroups(); // returns NavGroup[] per role
```

**API service:**
```typescript
this.api.get<ApiResponse<T>>('/api/endpoint').subscribe(...)
this.api.post('/api/endpoint', body).subscribe(...)
```

**Auth guard chain on protected routes:**
```typescript
{ path: 'app', canActivate: [authGuard], children: [
  { path: 'employees', canActivate: [roleGuard], data: { page: 'employees' } }
]}
```

**RTL / LTR toggle:**
```typescript
document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
document.body.classList.toggle('ltr', lang !== 'ar');
```

### Global CSS Classes (styles.scss)

Utility classes include: `.kpi-grid`, `.kpi-card`, `.data-table`, `.filter-bar`, `.form-grid`, `.col-span-2`, `.form-actions`, `.tab-bar`, `.tab-btn`, `.section-divider`, `.report-grid`, `.report-btn`, `.badge-*` variants, `.btn-info`, `.btn-warning`, `.text-success/danger/warning`, `.table-row-danger/warning/upcoming`, `.row-2col`, `.modal-box.modal-wide`, `.settings-grid`, `.setting-row`, `.quick-action-btn`, `.stat-card`, `.empty-state`, `.loading-wrap`, `.spinner`.

---

## 9. Backend .NET 9

### Program.cs — Middleware Pipeline

```csharp
1. AddControllers()
2. AddDbContext<AppDbContext>(UseMySql)
3. AddAuthentication(JwtBearer)
4. AddAuthorization()
5. AddCors(AllowAll origins + credentials)
6. AddScoped<JwtService>()
7. EnsureCreated() + DbSeeder.SeedAsync()
8. app.UseCors()
9. app.UseAuthentication()
10. app.UseAuthorization()
11. app.MapControllers()
12. app.Run("http://0.0.0.0:{PORT}")
```

### AppDbContext

- Namespace: `ZenjoApi.Data`
- 32 DbSet properties
- Fluent API: table names (snake_case), unique indexes, soft-delete global query filters on `Employee`
- `EnsureCreated()` on startup (not EF migrations)

### Controllers

| Controller | Route | Roles |
|-----------|-------|-------|
| `AuthController` | `/api/auth` | Public |
| `EmployeesController` | `/api/employees` | hradmin, payrolladmin |
| `AttendanceController` | `/api/attendance` | All authenticated |
| `LeaveController` | `/api/leave` | All authenticated |
| `OvertimeController` | `/api/overtime` | All authenticated |
| `PayrollController` | `/api/payroll` | payrolladmin, employee |
| `PreEmploymentController` | `/api/pre-employment` | hradmin, recruiter |
| `ResignationController` | `/api/resignations` | Authenticated |
| `ClearanceController` | `/api/clearance` | hradmin |
| `DisciplinaryController` | `/api/disciplinary` | hradmin, manager |
| `ComplianceController` | `/api/compliance` | hradmin |
| `DocumentsController` | `/api/documents` | hradmin, employee |
| `AssetsController` | `/api/assets` | hradmin |
| `SalaryAdvancesController` | `/api/salary-advances` | hradmin, payrolladmin, employee |
| `DashboardController` | `/api/dashboard` | All authenticated |
| `ReportsController` | `/api/reports` | superadmin, hradmin, payrolladmin |
| `DepartmentsController` | `/api/departments` | Authenticated / hradmin |
| `JobTitlesController` | `/api/job-titles` | Authenticated / hradmin |
| `UsersController` | `/api/users` | superadmin, hradmin |
| `ConfigController` | `/api/config` | superadmin, hradmin |
| `LookupsController` | `/api/lookups` | Authenticated |
| `BanksController` | `/api/banks` | Authenticated |
| `NotificationsController` | `/api/notifications` | Authenticated |

### DbSeeder — Demo Data

Seeds on every API startup:
- 1 Company (ZenJO Jordan شركة زينجو)
- 5 Departments (IT, HR, Finance, Operations, Sales)
- 6 Users with bcrypt passwords
- 8 Employees (Jordanian names, Arabic-first)
- Leave types, public holidays, violation types, asset categories, document types, nationalities, governorates
- Sample attendance records, leave requests, overtime requests, payroll runs

### Known Technical Notes

1. **`TimeOnly?` fields** — MySQL `time` columns map to `TimeSpan` in Pomelo. `DateOnly.ToDateTime(TimeOnly.MinValue)` must be called **after** `.ToListAsync()`, never inside a LINQ-to-SQL projection.
2. **Soft-delete filter** — `Employee` entity has a global query filter `e => !e.IsDeleted`. EF Core warns about required navigation ends — informational only.
3. **`int.TryParse`** — All user ID claims use `int.TryParse` (not `int.Parse`) to avoid exceptions on malformed tokens.
4. **CORS** — `SetIsOriginAllowed(_ => true)` + `AllowCredentials()` for Replit proxy compatibility.

---

## 10. Jordanian Labor Law Rules

### Social Security Corporation (SSC / الضمان الاجتماعي)

```
Insurable salary = MIN(employee.basicSalary, 3,000 JOD)
Employee contribution  = insurable × 7.5%
Employer contribution  = insurable × 14.25%

Enrollment month:
  Hire day 1–16  → SSC starts same month
  Hire day 17–31 → SSC starts following month
```

### End-of-Service Benefit (EOSB / مكافأة نهاية الخدمة)

```
Years of service < 1:
  EOSB = 0

Resignation:
  Years < 3  → EOSB = 0
  Years ≥ 3  → EOSB = (basicSalary × years) / 12

Termination (by employer):
  EOSB = basicSalary × years
```

### Income Tax (ضريبة الدخل)

| Annual Income Bracket (JOD) | Rate |
|------------------------------|------|
| 0 – 5,000 | 0% |
| 5,001 – 10,000 | 5% |
| 10,001 – 15,000 | 10% |
| 15,001 – 20,000 | 15% |
| > 20,000 | 20% |

### Disciplinary Rules

```
Cannot issue action on:  Friday or Saturday (Jordanian weekend)
Deadline window:         14 days from violation date (configurable via system_configurations)
Config key:              disciplinary_window_days (default: 14)
```

### Leave Types (9 Jordanian types)

| Type | Code | Days/Year | Notes |
|------|------|-----------|-------|
| Annual Leave | ANNUAL | 14 | Pro-rated first year |
| Sick Leave | SICK | 14 | Medical cert required after 3 days |
| Maternity Leave | MATERNITY | 70 | Female employees, once per birth |
| Paternity Leave | PATERNITY | 3 | Male employees |
| Emergency Leave | EMERGENCY | 3 | Per incident |
| Unpaid Leave | UNPAID | — | Requires approval |
| Hajj Leave | HAJJ | 10 | Once in career, Muslim employees |
| Bereavement (immediate) | BEREAVE_CLOSE | 3 | First-degree |
| Bereavement (extended) | BEREAVE_EXT | 1 | Extended family |

### Overtime Rates

| Type | Rate |
|------|------|
| Regular weekday (>8h) | 125% |
| Weekend | 150% |
| Public holiday | 150% |

---

## 11. File Structure

```
workspace/
├── artifacts/
│   ├── zenjo-ng/                       # Angular 18 Frontend
│   │   ├── src/
│   │   │   ├── index.html              # Material Icons, Cairo/Inter fonts
│   │   │   ├── styles.scss             # Global styles (350+ lines)
│   │   │   └── app/
│   │   │       ├── app.config.ts       # Bootstrap config
│   │   │       ├── app.routes.ts       # All routes + guards
│   │   │       ├── core/
│   │   │       │   ├── guards/auth.guard.ts
│   │   │       │   ├── interceptors/auth.interceptor.ts
│   │   │       │   ├── models/index.ts
│   │   │       │   └── services/
│   │   │       │       ├── api.service.ts
│   │   │       │       ├── auth.service.ts
│   │   │       │       └── role-access.service.ts  ← RBAC source of truth
│   │   │       ├── layout/
│   │   │       │   ├── layout.component.ts/html/scss
│   │   │       └── features/ (18 pages)
│   │   ├── proxy.conf.json             # /api → localhost:5000
│   │   ├── angular.json                # Build config, port 20256
│   │   └── package.json
│   │
│   └── zenjo-api/                      # .NET 9 Backend
│       ├── Program.cs                  # App entry, DI, middleware
│       ├── appsettings.json            # JWT key, MySQL connection string
│       ├── start.sh                    # MySQL start + DB recreate + dotnet run
│       ├── zenjo-api.csproj            # NuGet packages
│       ├── Models/
│       │   └── Entities.cs             # 32 entity classes
│       ├── Data/
│       │   ├── AppDbContext.cs         # EF Core context, Fluent API
│       │   └── DbSeeder.cs             # Demo data seeder
│       ├── Services/
│       │   └── JwtService.cs           # Token generation + validation
│       └── Controllers/ (23 files)
│
└── replit.md                           # Project documentation
```

---

## 12. Startup & Environment

### Start Sequence (`start.sh`)

```bash
1. Remove stale MySQL socket files
2. Start mysqld with:
   --datadir=/home/runner/.zenjo-mysql/data
   --socket=/home/runner/.zenjo-mysql/mysql.sock
   --port=3306
   --bind-address=0.0.0.0
   --daemonize
3. Poll MySQL socket until ready (up to 30s)
4. DROP DATABASE IF EXISTS zenjo
5. CREATE DATABASE zenjo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
6. dotnet run --configuration Release --no-build
7. EnsureCreated() → DbSeeder.SeedAsync()
8. API listens on http://0.0.0.0:5000
```

### Environment Variables

| Variable | Value | Used by |
|----------|-------|---------|
| `PORT` | `5000` | .NET API bind port |
| `DATABASE_URL` | PostgreSQL URL (Replit) | Not used by ZenJO |
| `SESSION_SECRET` | Set in Replit secrets | Not used by ZenJO |

### MySQL Connection String (`appsettings.json`)

```
Server=/home/runner/.zenjo-mysql/mysql.sock;
Database=zenjo;
User=zenjo_user;
Password=ZenJO2024!;
CharSet=utf8mb4;
SslMode=None;
```

### Angular Proxy (`proxy.conf.json`)

```json
{
  "/api": {
    "target": "http://localhost:5000",
    "secure": false,
    "changeOrigin": true,
    "logLevel": "info"
  }
}
```

---

## 13. Demo Accounts

| Username | Password | Role | Arabic Label |
|----------|----------|------|-------------|
| `admin` | `Admin@1234` | `superadmin` | مدير النظام |
| `hr` | `Hr@1234` | `hradmin` | مدير الموارد البشرية |
| `payroll` | `Payroll@1234` | `payrolladmin` | مدير الرواتب |
| `manager` | `Manager@1234` | `manager` | مدير القسم |
| `employee` | `Employee@1234` | `employee` | موظف |
| `recruiter` | `Recruiter@1234` | `recruiter` | أخصائي توظيف |

### What Each Account Sees

**admin (SuperAdmin)**
- Platform dashboard with system-wide stats
- User Management, System Settings, Platform Reports
- Does NOT see HR operational screens

**hr (HR Admin)**
- Full HR dashboard (4 KPI rows: workforce / approvals / workflows / compliance)
- All 17 HR pages: employees, pre-employment, disciplinary, resignations, clearance, compliance, attendance, leave, overtime, documents, assets, advances, holidays, reports, users, settings
- Complete operational access for their company

**payroll (Payroll Admin)**
- Payroll dashboard (payroll status KPIs)
- Payroll runs, salary advances, employee read-only view, holidays, reports

**manager (Manager)**
- Team dashboard (team attendance today, pending leave/overtime to approve)
- Team attendance, team leave approvals, team overtime approvals, disciplinary, holidays

**employee (Employee)**
- ESS dashboard (own status, leave balance, last payslip, pending requests)
- Own attendance, own leave requests, own overtime, own payslips, own documents, holidays

**recruiter (Recruiter)**
- Recruitment dashboard (pre-employment records + own ESS)
- Pre-employment, own attendance, own leave, own payslips, holidays

---

*ZenJO v3.1 — Built for Jordan. Compliant with Jordanian Labour Law No. 8 of 1996.*

# ZenJO HRMS — System Specification

> Version 2.0 · Jordanian Human Resources Management System  
> Arabic-first, bilingual, Jordanian Labour Law compliant

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Access Control (RBAC)](#3-access-control-rbac)
4. [Database Schema (22 Tables)](#4-database-schema-22-tables)
5. [API Endpoints](#5-api-endpoints)
6. [Frontend Pages & Routes](#6-frontend-pages--routes)
7. [Compliance Engine (system_configurations)](#7-compliance-engine-system_configurations)
8. [Business Rules & Workflows](#8-business-rules--workflows)
9. [Internationalization (i18n)](#9-internationalization-i18n)
10. [Authentication & Security](#10-authentication--security)
11. [Demo Accounts](#11-demo-accounts)

---

## 1. Architecture Overview

```
┌──────────────────────┐       ┌────────────────────────────┐
│  React + Vite (SPA)  │──────▶│  Express.js API (port 8080)│
│  artifacts/zenjo     │       │  artifacts/api-server      │
│  RTL/LTR, i18n       │       │  RBAC middleware            │
└──────────────────────┘       └──────────┬─────────────────┘
                                           │
                               ┌──────────▼─────────────────┐
                               │  PostgreSQL + Drizzle ORM   │
                               │  22 tables, company_id=1    │
                               └────────────────────────────┘
```

**Monorepo layout (pnpm workspaces):**

| Package | Path | Role |
|---|---|---|
| `@workspace/api-server` | `artifacts/api-server` | Express 5 REST API |
| `@workspace/zenjo` | `artifacts/zenjo` | React 18 + Vite SPA |
| `@workspace/db` | `lib/db` | Drizzle ORM schema + seed |
| `@workspace/api-client-react` | `lib/api-client-react` | Auto-generated React hooks |
| `@workspace/api-spec` | `lib/api-spec` | OpenAPI spec + Zod schemas |
| `@workspace/mockup-sandbox` | `artifacts/mockup-sandbox` | Component preview server |

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Package manager | pnpm |
| Language | TypeScript 5.9 (strict) |
| API framework | Express 5 |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Validation | Zod (zod/v4) + drizzle-zod |
| Frontend framework | React 18 |
| Build tool | Vite 6 |
| UI components | shadcn/ui + Tailwind CSS v4 |
| Charts | Recharts |
| Routing | wouter |
| State | @tanstack/react-query v5 |
| i18n | react-i18next (AR + EN) |
| API build | esbuild |

---

## 3. Access Control (RBAC)

### 3.1 Roles

| Role | Description | Key Permissions |
|---|---|---|
| `superadmin` | Full system access | Everything |
| `hradmin` | HR Admin | Employees, leave approval (step 2), payroll creation, settings |
| `payrolladmin` | Payroll Admin | Payroll runs approval, payslips, read-only employee access |
| `manager` | Department Manager | View/approve direct reports' leave & overtime (step 1), team attendance |
| `employee` | Regular Employee | Own records only — clock in/out, leave & overtime requests, own payslips |
| `recruiter` | Recruiter | Add employees (draft), view departments & job titles only |

### 3.2 Permission Matrix

| Action | superadmin | hradmin | payrolladmin | manager | employee | recruiter |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View all employees | ✓ | ✓ | ✓* | ✓** | — | — |
| See salary fields | ✓ | ✓ | ✓ | — | — | — |
| Create/edit employees | ✓ | ✓ | — | — | — | ✓*** |
| Delete employees | ✓ | ✓ | — | — | — | — |
| Approve leave (step 1) | ✓ | ✓ | — | ✓ | — | — |
| Approve leave (step 2) | ✓ | ✓ | — | — | — | — |
| Approve overtime (step 1) | ✓ | ✓ | — | ✓ | — | — |
| Approve overtime (step 2) | ✓ | ✓ | — | — | — | — |
| Create payroll run | ✓ | ✓ | — | — | — | — |
| Approve payroll run | ✓ | — | ✓ | — | — | — |
| View payslips | ✓ | ✓ | ✓ | — | own only | — |
| Edit system settings | ✓ | ✓ | — | — | — | — |

*payrolladmin: read-only, no salary masking  
**manager: direct reports only (`direct_manager_id`)  
***recruiter: can create, cannot edit/delete

### 3.3 Data Scoping (Backend Enforcement)

- **`employee`**: All queries filtered to `employeeId = self`
- **`manager`**: Employee lists filtered to `direct_manager_id = self.employeeId`
- **`recruiter`**: Employee list blocked (403); can only create via POST
- **Salary masking**: `maskSalary()` in `rbac.middleware.ts` zeroes out `basicSalary`, `housingAllowance`, `transportAllowance`, `mobileAllowance`, `mealAllowance`, `otherAllowances`, `bankAccountNumber`, `iban` for roles without salary access

### 3.4 Frontend Route Guards

`canAccessRoute(role, path)` in `access-control.ts` blocks navigation. Protected by `<ProtectedRoute>` in `App.tsx`. Unauthorized users see a 403 card, not a redirect.

---

## 4. Database Schema (22 Tables)

### 4.1 companies

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name_ar | varchar | Arabic company name |
| name_en | varchar | English company name |
| commercial_reg_no | varchar | |
| tax_number | varchar | |
| ssc_number | varchar | Social Security Council number |
| labor_ministry_no | varchar | |
| address_ar | text | |
| city | varchar | |
| phone / email / website | varchar | |
| industry_type | varchar | default `'other'` |
| currency | varchar | default `'JOD'` |
| is_active | boolean | default `true` |
| created_at / updated_at | timestamptz | |
| is_deleted | boolean | soft delete |

### 4.2 employees

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| company_id | integer FK | |
| employee_code | varchar | unique per company |
| first_name_ar / middle_name_ar / last_name_ar | varchar | Arabic name parts |
| first_name_en / middle_name_en / last_name_en | varchar | English name parts |
| gender | varchar | male / female |
| date_of_birth | date | |
| national_id | varchar | Jordanian National ID |
| nationality | varchar | default `'أردني'` |
| religion / marital_status | varchar | |
| number_of_dependents | integer | default 0 |
| personal_email / work_email | varchar | |
| personal_phone / work_phone | varchar | |
| emergency_contact_name / phone / relation | varchar | |
| address_ar / city | text / varchar | |
| department_id | integer FK → departments | |
| job_title_id | integer FK → job_titles | |
| direct_manager_id | integer FK → employees | self-referencing |
| employment_type | varchar | `fulltime`, `parttime`, `contract` |
| hire_date | date | |
| probation_end_date | date | |
| contract_type | varchar | `permanent`, `fixed_term` |
| contract_end_date | date | |
| employment_status | varchar | `active`, `suspended`, `terminated`, `resigned`, `retired` |
| termination_date / reason | date / text | |
| basic_salary | numeric | **masked for non-finance roles** |
| housing_allowance | numeric | default 0 |
| transport_allowance | numeric | default 0 |
| mobile_allowance | numeric | default 0 |
| meal_allowance | numeric | default 0 |
| other_allowances | numeric | default 0 |
| ssc_number / ssc_enrollment_date | varchar / date | Social Security |
| is_ssc_exempt | boolean | default false |
| income_tax_number / tax_exemption_amount | varchar / numeric | |
| bank_name / bank_account_number / iban | varchar | **masked** |
| passport_number / passport_expiry | varchar / date | |
| work_permit_number / work_permit_expiry | varchar / date | Non-Jordanians |
| residency_number / residency_expiry | varchar / date | |
| profile_photo | varchar | URL/path |
| created_at / updated_at | timestamptz | |
| is_deleted | boolean | soft delete |

### 4.3 users

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| employee_id | integer FK → employees | nullable (system users) |
| company_id | integer FK | |
| username | varchar | unique |
| password_hash | varchar | SHA-256 + "zenjo_salt" |
| email | varchar | |
| role | varchar | one of 6 RBAC roles |
| is_active | boolean | |
| last_login_at | timestamptz | |
| must_change_password | boolean | default false |
| refresh_token | varchar | used as Bearer auth token |
| refresh_token_expiry | timestamptz | |

### 4.4 departments

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| company_id | integer FK | |
| name_ar / name_en | varchar | bilingual |
| code | varchar | short code |
| parent_department_id | integer FK → departments | hierarchy |
| manager_employee_id | integer FK → employees | dept head |
| is_active | boolean | |

**Seeded departments:** Human Resources, Information Technology, Finance, Operations, Sales, Customer Service

### 4.5 job_titles

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| company_id | integer FK | |
| name_ar / name_en | varchar | bilingual |
| code | varchar | |
| grade / level | varchar | |
| is_active | boolean | |

### 4.6 attendance_records

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| employee_id | integer FK | |
| date | date | |
| clock_in | timestamptz | |
| clock_out | timestamptz | |
| status | varchar | `present`, `absent`, `late`, `on_leave`, `half_day` |
| late_minutes | integer | minutes after grace period |
| worked_minutes | integer | computed on clock-out |
| overtime_minutes | integer | minutes beyond standard_work_hours |
| notes | text | |

**Clock-in logic reads from system_configurations:**
- `work_start_time` (default `08:00`) — scheduled start
- `late_threshold_minutes` (default `20`) — grace period before "late"
- `standard_work_hours` (default `8`) — threshold for overtime on clock-out

### 4.7 leave_types

8 types seeded: Annual Leave, Sick Leave, Emergency Leave, Maternity Leave, Paternity Leave, Hajj Leave, Unpaid Leave, Bereavement Leave

### 4.8 leave_policies

Per company/leave type: max days per year, carryover rules, paid/unpaid, gender restrictions.

### 4.9 leave_balances

Per employee per leave type: `total_days`, `used_days`, `pending_days`, `remaining_days`.

### 4.10 leave_requests

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| employee_id | integer FK | |
| leave_type | varchar | |
| start_date / end_date | date | |
| total_days | numeric(5,2) | |
| reason | text | |
| status | varchar | `pending` → `manager_approved` → `approved` / `rejected` |
| approved_by_id | integer FK → users | |
| approved_at | timestamptz | |
| rejection_reason | text | |

### 4.11 overtime_requests

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| employee_id | integer FK | |
| date | date | date of overtime work |
| hours | numeric(5,2) | requested overtime hours |
| reason | text | |
| status | varchar | `pending` → `manager_approved` → `approved` / `rejected` |
| manager_approved_by_id | integer FK → users | step-1 approver |
| manager_approved_at | timestamptz | |
| hr_approved_by_id | integer FK → users | step-2 approver |
| hr_approved_at | timestamptz | |
| rejection_reason | text | |
| linked_payslip_id | integer FK → payslips | populated on payroll run |

### 4.12 payroll_runs

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| company_id | integer FK | |
| run_month / run_year | integer | e.g. 4, 2026 |
| status | varchar | `draft` → `processing` → `paid` |
| total_gross | numeric(14,3) | JOD, 3 decimals |
| total_net | numeric(14,3) | |
| total_deductions | numeric(14,3) | |
| employee_count | integer | |
| processed_at / approved_at | timestamptz | |
| approved_by_id | integer FK → users | payrolladmin |

### 4.13 payslips

Per-employee record inside a payroll run. Contains: basic_salary, all allowances, ssc_deduction, income_tax_deduction, other_deductions, gross_salary, net_salary.

### 4.14 documents

Employee document attachments with type, file_name, expiry_date, status (`valid`, `expiring_soon`, `expired`).

### 4.15 document_types

Lookup: Passport, National ID, Work Permit, Residency, Driving Licence, etc.

### 4.16 assets

IT assets / equipment assigned to employees. Tracks: category, serial number, purchase date/value, current_status (`available`, `assigned`, `maintenance`, `retired`), assigned employee + dates.

### 4.17 asset_categories

Lookup: Laptop, Mobile Phone, Vehicle, Furniture, etc.

### 4.18 system_configurations

See [Section 7](#7-compliance-engine-system_configurations).

### 4.19 activity_logs

Audit trail: type, description, employee_name, company_id, created_at.

### 4.20–4.22 Lookup Tables

| Table | Purpose |
|---|---|
| `banks` | Jordanian banks list |
| `cities` | Jordanian cities |
| `nationalities` | Nationality list (bilingual) |

---

## 5. API Endpoints

Base URL: `http://localhost:8080/api`  
Auth: `Authorization: Bearer <token>` (required on all routes except `/auth/login`, `/health`)

### Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Login → returns `{ token, user }` |
| POST | `/auth/logout` | Clears refresh token |
| GET | `/auth/me` | Returns current user |

### Employees

| Method | Path | Roles |
|---|---|---|
| GET | `/employees` | superadmin, hradmin, payrolladmin, manager |
| POST | `/employees` | superadmin, hradmin, recruiter |
| GET | `/employees/:id` | all (scoped) |
| PATCH | `/employees/:id` | superadmin, hradmin |
| DELETE | `/employees/:id` | superadmin, hradmin |

### Departments & Job Titles

| Method | Path | Roles |
|---|---|---|
| GET | `/departments` | all |
| POST | `/departments` | superadmin, hradmin |
| GET | `/job-titles` | all |
| POST | `/job-titles` | superadmin, hradmin |

### Attendance

| Method | Path | Description |
|---|---|---|
| GET | `/attendance` | List records (scoped by role) |
| POST | `/attendance/clock-in` | Clock in (reads work_start_time + late_threshold_minutes from DB) |
| POST | `/attendance/clock-out` | Clock out (computes worked_minutes + overtime_minutes) |
| GET | `/attendance/summary` | Monthly summary for an employee |

### Leave

| Method | Path | Description |
|---|---|---|
| GET | `/leave/requests` | List leave requests (scoped) |
| POST | `/leave/requests` | Submit leave request |
| POST | `/leave/requests/:id/approve` | Step-1 (manager) or Step-2 (hradmin) approve |
| POST | `/leave/requests/:id/reject` | Reject with reason |
| GET | `/leave/policies` | List leave policies |
| GET | `/leave/types` | List leave types |
| GET | `/leave/balances` | Employee leave balances |

### Overtime

| Method | Path | Description |
|---|---|---|
| GET | `/overtime` | List overtime requests (scoped by role) |
| POST | `/overtime` | Submit overtime request |
| GET | `/overtime/:id` | Get single request |
| PATCH | `/overtime/:id` | Edit own pending request |
| DELETE | `/overtime/:id` | Cancel own pending request |
| POST | `/overtime/:id/approve` | Step-1 (manager) or Step-2 (hradmin) approve |
| POST | `/overtime/:id/reject` | Reject with reason |

### Payroll

| Method | Path | Description |
|---|---|---|
| GET | `/payroll/runs` | List payroll runs |
| POST | `/payroll/runs` | Create payroll run |
| GET | `/payroll/runs/:id` | Run details |
| POST | `/payroll/runs/:id/approve` | Approve run (payrolladmin) |
| GET | `/payroll/slips` | List payslips (own only for employees) |

### Compliance Configuration

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/config` | all authenticated | Returns `{ flat, byCategory, raw }` |
| PATCH | `/config/:key` | superadmin, hradmin | Update single config value |
| PATCH | `/config` | superadmin, hradmin | Batch update `{ key: value }` |

### Other

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/summary` | KPIs: employee counts, pending items |
| GET | `/dashboard/leave-stats` | Leave breakdown by type/status |
| GET | `/dashboard/headcount` | Headcount per department |
| GET | `/dashboard/payroll-trend` | Last 6 months payroll totals |
| GET | `/dashboard/recent-activity` | Latest activity_log entries |
| GET | `/documents` | Employee documents |
| GET | `/assets` | Company assets |
| GET | `/lookups/banks` | Jordanian banks |
| GET | `/lookups/cities` | Jordanian cities |
| GET | `/lookups/nationalities` | Nationalities |
| GET | `/health` | Health check (no auth) |

---

## 6. Frontend Pages & Routes

| Route | Component | Accessible By |
|---|---|---|
| `/login` | `login.tsx` | Public |
| `/` | `dashboard.tsx` | All (role-differentiated view) |
| `/employees` | `employees.tsx` | superadmin, hradmin, payrolladmin, manager |
| `/employees/new` | `employee-form.tsx` | superadmin, hradmin, recruiter |
| `/employees/:id` | `employee-detail.tsx` | superadmin, hradmin, manager (own+reports) |
| `/departments` | `departments.tsx` | superadmin, hradmin, payrolladmin, manager |
| `/job-titles` | `job-titles.tsx` | superadmin, hradmin, payrolladmin, manager |
| `/attendance` | `attendance.tsx` | superadmin, hradmin, manager, employee |
| `/leave/requests` | `leave-requests.tsx` | superadmin, hradmin, manager, employee |
| `/leave/policies` | `leave-policies.tsx` | superadmin, hradmin, manager |
| `/overtime` | `overtime.tsx` | superadmin, hradmin, manager, employee |
| `/payroll/runs` | `payroll-runs.tsx` | superadmin, hradmin, payrolladmin |
| `/payroll/runs/:id` | `payroll-run-detail.tsx` | superadmin, hradmin, payrolladmin |
| `/payroll/slips` | `payslips.tsx` | superadmin, hradmin, payrolladmin, employee |
| `/documents` | `documents.tsx` | superadmin, hradmin, manager |
| `/assets` | `assets.tsx` | superadmin, hradmin, payrolladmin, manager |
| `/settings` | `settings.tsx` | superadmin, hradmin (read-only for others) |

### Dashboard Views (by role)

| Role | Dashboard Contents |
|---|---|
| superadmin / hradmin | KPI cards + headcount chart + leave pie chart + payroll trend + recent activity |
| payrolladmin | Payroll-focused KPIs + payroll trend chart |
| manager | Team attendance today + pending leave/overtime approval queues |
| employee | Clock in/out widget + monthly summary + quick actions + leave status |
| recruiter | Recruitment shortcuts (add employee, departments, job titles) |

### Mobile Bottom Navigation (5 items per role)

| Role | Bottom Nav Items |
|---|---|
| superadmin / hradmin | Dashboard · Employees · Attendance · Leave · Settings |
| payrolladmin | Dashboard · Payroll Runs · Payslips · Departments · Settings |
| manager | Dashboard · Attendance · Leave · Overtime · Employees |
| employee | Dashboard · Attendance · Leave · Overtime · Payslips |
| recruiter | Dashboard · Add Employee · Departments · Job Titles · Settings |

---

## 7. Compliance Engine (system_configurations)

Editable by **superadmin** and **hradmin** via `/settings`. Changes take effect immediately (attendance routes read live from DB).

| Category | Key | Default | Description |
|---|---|---|---|
| `attendance` | `work_start_time` | `08:00` | Scheduled work start (HH:MM) |
| `attendance` | `work_end_time` | `17:00` | Scheduled work end (HH:MM) |
| `attendance` | `late_threshold_minutes` | `20` | Grace period before "late" status |
| `attendance` | `standard_work_hours` | `8` | Standard daily hours (overtime threshold) |
| `attendance` | `working_days_per_week` | `5` | Days per week |
| `payroll` | `ssc_employee_rate` | `7.5` | SSC employee contribution (%) |
| `payroll` | `ssc_employer_rate` | `14.25` | SSC employer contribution (%) |
| `payroll` | `income_tax_exemption` | `3000` | Annual personal tax exemption (JOD) |
| `payroll` | `overtime_rate` | `1.5` | Overtime pay multiplier (1.5× = time-and-a-half) |
| `payroll` | `payroll_day` | `25` | Day of month payroll is processed |
| `hr` | `probation_period_days` | `90` | Default probation period |
| `hr` | `eosb_rate_per_year` | `1` | End of Service Benefit: months' salary per year |
| `leave` | `annual_leave_days` | `14` | Annual leave entitlement (Jordanian law minimum) |
| `leave` | `leave_accrual_type` | `monthly` | Accrual method: `monthly` or `annually` |
| `general` | `company_name_ar` | `شركة ZenJO` | Company name in Arabic |
| `general` | `company_name_en` | `ZenJO Company` | Company name in English |
| `general` | `currency` | `JOD` | Currency code |

---

## 8. Business Rules & Workflows

### 8.1 Leave Approval Workflow

```
Employee submits →  [pending]
                         │
              Manager approves (step 1)
                         │
                  [manager_approved]
                         │
           HR Admin approves (step 2)
                         │
                      [approved]

At any step: HR Admin or Manager can reject → [rejected]
```

### 8.2 Overtime Approval Workflow

Identical 2-step flow to leave requests. Uses `overtime_requests` table.  
After final approval: `linked_payslip_id` is populated when the next payroll run processes the approved overtime.

### 8.3 Payroll Calculation

For each active employee in a payroll run:

```
Gross Salary = basic_salary + housing_allowance + transport_allowance
             + mobile_allowance + meal_allowance + other_allowances

SSC Deduction = basic_salary × ssc_employee_rate / 100
  (skipped if is_ssc_exempt = true)

Taxable Income = Gross Salary × 12 - income_tax_exemption
Income Tax = (Taxable Income × applicable_rate) / 12
  (progressive brackets, Jordanian income tax law)

Net Salary = Gross Salary - SSC Deduction - Income Tax - other_deductions
```

Currency: **JOD** — all amounts stored/displayed with 3 decimal places.

### 8.4 Attendance Status Logic

On **clock-in**:
1. Read `work_start_time` from `system_configurations`
2. Read `late_threshold_minutes` from `system_configurations`
3. `minutesSinceStart = now - scheduledStart`
4. If `minutesSinceStart > late_threshold_minutes` → `status = 'late'`, `late_minutes = minutesSinceStart`
5. Otherwise → `status = 'present'`, `late_minutes = 0`

On **clock-out**:
1. `workedMinutes = clockOut - clockIn`
2. `standardWorkMinutes = standard_work_hours × 60`
3. `overtimeMinutes = max(0, workedMinutes - standardWorkMinutes)`

### 8.5 Jordanian Labour Law Compliance

| Provision | Value | Source |
|---|---|---|
| Annual leave (after 1 year) | 14 days/year | Labour Law Art. 61 |
| Sick leave | 14 days/year (paid) | Labour Law Art. 65 |
| Maternity leave | 70 calendar days | Labour Law Art. 70 |
| Paternity leave | 3 days | Labour Law |
| Hajj leave | 14 days (once in career) | Labour Law |
| Bereavement leave | 3 days | Labour Law |
| Probation period | ≤ 3 months (90 days default) | Labour Law Art. 30 |
| EOSB (End of Service) | 1 month/year | Labour Law Art. 87 |
| SSC employee rate | 7.5% of basic salary | SSC Law |
| SSC employer rate | 14.25% of basic salary | SSC Law |
| Weekly rest day | Friday (not Saturday) | Labour Law |
| Working hours cap | 8h/day, 40h/week | Labour Law Art. 57 |
| Overtime premium | 1.25×–1.5× | Labour Law Art. 59 |

---

## 9. Internationalization (i18n)

### 9.1 Configuration

- **Library**: `react-i18next` + `i18next-browser-languagedetector`
- **Default language**: Arabic (`lng: "ar"`)
- **Persistence**: `localStorage.zenjo_lang`
- **Direction**: `document.documentElement.dir` = `rtl` (AR) or `ltr` (EN)
- **`applyDirection()`** is called in `main.tsx` on startup

### 9.2 Translation Files

| File | Path |
|---|---|
| Arabic | `artifacts/zenjo/src/i18n/ar.json` |
| English | `artifacts/zenjo/src/i18n/en.json` |

Both files contain the same key structure with ~270 entries covering all pages.

### 9.3 Translation Key Namespaces

| Namespace | Contents |
|---|---|
| `app.*` | App name, subtitle, locale |
| `nav.*` | All sidebar/bottom-nav labels |
| `auth.*` | Login page strings |
| `roles.*` | Role label display names |
| `dashboard.*` | Dashboard widget labels |
| `employees.*` | Employee list/form labels |
| `attendance.*` | Attendance page strings |
| `leave.*` | Leave request strings |
| `overtime.*` | Overtime page strings |
| `payroll.*` | Payroll run/payslip strings |
| `documents.*` | Document management |
| `settings.*` | Settings page strings |
| `common.*` | Shared UI strings (save, cancel, loading…) |
| `months.*` | Month names (1–12) |

### 9.4 Language Toggle

Available in:
- **Login page** — top-right globe button
- **Desktop sidebar** — bottom footer
- **Mobile header** — top-right globe button

---

## 10. Authentication & Security

### 10.1 Token Flow

```
POST /api/auth/login { username, password }
  → Server: SHA-256(password + "zenjo_salt") == password_hash
  → Issues: random UUID stored in users.refresh_token
  → Response: { token: <uuid>, user: { id, username, role, employeeId, ... } }

Client stores:
  localStorage.zenjo_token = <token>
  localStorage.zenjo_user = JSON.stringify(user)

All API requests: Authorization: Bearer <token>
  → authenticate() middleware: looks up users.refresh_token == token
```

### 10.2 Password Hashing

```typescript
crypto.createHash("sha256").update(password + "zenjo_salt").digest("hex")
```

> Note: This is a demonstration hash. For production, replace with bcrypt/argon2.

### 10.3 Session Invalidation

`POST /api/auth/logout` clears `refresh_token` and `refresh_token_expiry` in the `users` table. The next request with the old token will receive `401 Unauthorized`.

### 10.4 RBAC Enforcement

Every protected route applies:
1. `authenticate` — validates Bearer token
2. Role-specific guard (e.g., `requireHrAdmin`, `requireManager`, `requireAny([...])`)
3. Data-scoping in query (WHERE clause based on role)

---

## 11. Demo Accounts

All accounts belong to **company_id = 1**.

| Username | Password | Role | Employee | Dept |
|---|---|---|---|---|
| `admin` | `Admin@1234` | superadmin | Ahmed Al-Ali (emp #1) | Human Resources |
| `hr` | `Hr@1234` | hradmin | Sara Mahmoud (emp #2) | Human Resources |
| `payroll` | `Payroll@1234` | payrolladmin | Mohammad Al-Khatib (emp #3) | Finance |
| `manager` | `Manager@1234` | manager | Khaled Al-Nemer (emp #7) | IT |
| `employee` | `Employee@1234` | employee | Layla Haddad (emp #8) | IT |
| `recruiter` | `Recruiter@1234` | recruiter | Yousef Al-Rashid (emp #9) | HR |

**Manager hierarchy:**  
Khaled (emp #7, manager) is the direct manager of Sara (emp #2) and Layla (emp #8).  
This means the manager account can see and approve leave/overtime for these two employees.

---

## Key Commands

```bash
# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/zenjo run dev

# Push DB schema changes
pnpm --filter @workspace/db run push

# Seed demo data
pnpm --filter @workspace/db run seed

# Full typecheck
pnpm run typecheck

# Build everything
pnpm run build
```

---

*ZenJO HRMS — Built on Replit · Express + PostgreSQL + React + Vite*

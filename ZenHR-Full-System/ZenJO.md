# ZenJO — نظام إدارة الموارد البشرية الأردني

**ZenJO HRMS** is a full-stack, enterprise-grade Human Resource Management System built for Jordanian companies. It is bilingual (Arabic/English), RTL-first, and compliant with Jordanian labor law.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 18 (standalone components, signals, lazy loading) |
| Backend | .NET 9 Web API (Entity Framework Core, JWT auth) |
| Database | MySQL 8.0 (Unix socket) |
| Styling | Custom RTL design system (CSS variables, Arabic-first) |

---

## Demo Accounts

| Username | Password | Role (Arabic) | Role (English) |
|----------|----------|---------------|----------------|
| `admin` | `Admin@1234` | مدير النظام | Super Admin |
| `hr` | `Hr@1234` | مدير الموارد البشرية | HR Admin |
| `payroll` | `Payroll@1234` | مدير الرواتب | Payroll Admin |
| `manager` | `Manager@1234` | مدير القسم | Manager |
| `employee` | `Employee@1234` | موظف | Employee |
| `recruiter` | `Recruiter@1234` | أخصائي توظيف | Recruiter |

---

## Modules

### 1. Authentication (المصادقة)
- JWT access tokens (60 min) + refresh tokens (7 days)
- RTL-first login page with language toggle (AR / EN)
- Click-to-fill demo account buttons
- Role-based redirect after login

### 2. Dashboard (لوحة التحكم)
- KPI cards: total employees, present today, pending leaves, pending overtime
- Department headcount bar chart
- Quick action buttons
- Live data from seeded MySQL database

### 3. Employees (الموظفون)
- Full CRUD (create, view, edit, deactivate)
- Arabic & English name fields
- Salary breakdown: basic + housing allowance + transport allowance
- Department, job title, bank, and status assignment
- Global soft-delete filter

### 4. Attendance (الحضور)
- Clock in / clock out with live clock display
- Daily attendance summary
- Monthly attendance history grid
- Present / absent / late status tracking

### 5. Leave Requests (الإجازات)
- 9 Jordanian leave types (annual, sick, maternity, etc.)
- Multi-day leave calculation
- Submit → Pending → Approve / Reject workflow
- Leave balance tracking per employee

### 6. Overtime (العمل الإضافي)
- Weekday, weekend, and public holiday overtime types
- Cash or compensatory leave compensation modes
- Submit → Approve / Reject workflow
- Hours and total compensation display

### 7. Payroll (الرواتب)
- Monthly payroll run
- JOSS (Jordan Social Security) deduction
- Net salary calculation
- Payslip viewer per employee

### 8. Users (المستخدمون)
- User account management
- Role assignment (6 RBAC roles)
- Activate / deactivate accounts
- Linked to employee records

---

## RBAC Roles & Permissions

| Role | Dashboard | Employees | Attendance | Leave | Overtime | Payroll | Users |
|------|-----------|-----------|------------|-------|----------|---------|-------|
| superadmin | ✓ | ✓ Full | ✓ | ✓ Full | ✓ Full | ✓ Full | ✓ |
| hradmin | ✓ | ✓ Full | ✓ | ✓ Full | ✓ Full | View | — |
| payrolladmin | ✓ | View | View | View | View | ✓ Full | — |
| manager | ✓ | View | ✓ | Approve | Approve | — | — |
| employee | ✓ | Self | Self | Self | Self | Self | — |
| recruiter | ✓ | View | — | — | — | — | — |

---

## Architecture

```
Browser
  │
  ▼
Replit Proxy (port 80)
  │
  ├── /          → Angular dev server (port 20256)
  └── /api       → Angular dev server (port 20256)
                        │
                        └── proxy /api → .NET API (port 5000)
                                              │
                                              └── MySQL (Unix socket)
```

### Key Files

```
artifacts/
├── zenjo-ng/                          # Angular 18 frontend
│   ├── src/app/
│   │   ├── app.config.ts              # Hash routing, HTTP interceptor
│   │   ├── app.routes.ts              # Lazy-loaded feature routes
│   │   ├── core/
│   │   │   ├── services/auth.service.ts
│   │   │   ├── guards/auth.guard.ts
│   │   │   ├── interceptors/auth.interceptor.ts
│   │   │   └── models/                # TypeScript interfaces
│   │   ├── features/
│   │   │   ├── auth/login/            # Login page
│   │   │   ├── dashboard/             # Dashboard + charts
│   │   │   ├── employees/             # Employee CRUD
│   │   │   ├── attendance/            # Clock in/out
│   │   │   ├── leave/                 # Leave requests
│   │   │   ├── overtime/              # Overtime requests
│   │   │   ├── payroll/               # Payroll & payslips
│   │   │   └── users/                 # User management
│   │   └── layout/                    # Sidebar + topbar shell
│   └── proxy.conf.json                # /api → localhost:5000
│
└── zenjo-api/                         # .NET 9 API
    ├── Program.cs                     # App entry, DI, middleware
    ├── appsettings.json               # JWT config, connection string
    ├── Models/Entities.cs             # 13+ EF Core entities
    ├── Data/
    │   ├── AppDbContext.cs            # EF Core context + Fluent API
    │   └── DbSeeder.cs                # Demo data seed
    ├── Controllers/                   # Auth, Employees, Leave, etc.
    ├── Services/JwtService.cs         # Token generation & validation
    └── start.sh                       # MySQL start + dotnet run
```

---

## Database Entities

- `Company` — company profile
- `Department` — organisational departments
- `JobTitle` — job title catalogue
- `Bank` — Jordanian bank list
- `Employee` — employee master record
- `User` — system login account (linked to employee)
- `AttendanceRecord` — daily clock in/out
- `LeaveType` — leave type catalogue
- `LeaveRequest` — leave request workflow
- `LeaveBalance` — per-employee leave balances
- `OvertimeRequest` — overtime request workflow
- `PayrollRun` — monthly payroll batch
- `Payslip` — individual payslip per employee per run

---

## Running Locally

Two workflows must be running:

**1. ZenJO API** — starts MySQL then the .NET API
```bash
bash artifacts/zenjo-api/start.sh
```

**2. ZenJO Web** — Angular dev server with proxy
```bash
cd artifacts/zenjo-ng
NG_CLI_ANALYTICS=false npx ng serve --host 0.0.0.0 --port 20256 --proxy-config proxy.conf.json
```

Then open: `http://localhost:20256`

---

## Jordanian Labor Law Compliance

- **Leave types**: Annual (14–21 days), Sick (14 days), Maternity (10 weeks), Paternity (3 days), Hajj (leave once in service), Bereavement, Study, Unpaid
- **Overtime rates**: 125% weekday, 150% weekend/holiday
- **JOSS deduction**: Jordan Social Security applied to gross salary
- **Payslip fields**: Basic + housing + transport allowances, JOSS employee share, net salary

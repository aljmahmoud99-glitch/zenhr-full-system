# ZenJO HRMS - Full System Overview

## Purpose

ZenJO HRMS is a multi-tenant human resources and payroll management system. It includes employee master data, attendance, leave, overtime, payroll, compliance, documents, assets, disciplinary workflows, resignations, clearance, salary advances, forms, settings, users, permissions, and reporting.

This document summarizes the current system structure and the latest verified H2 smoke-test status.

## Repository Structure

```text
artifacts/
  zenjo-api/        ASP.NET Core backend API
  zenjo-ng/         Angular frontend application
  zenjo/            Additional app artifact
  api-server/       Supporting API artifact
  mockup-sandbox/   Sandbox/prototype artifact

Data/               Root-level legacy/supporting data files
Models/             Root-level legacy/supporting model files
Services/           Root-level legacy/supporting service files
Controllers/        Root-level legacy/supporting controller files
scripts/            Utility scripts
```

Primary active code paths:

- Backend: `artifacts/zenjo-api`
- Frontend: `artifacts/zenjo-ng`

## Backend

Technology:

- ASP.NET Core
- Entity Framework Core
- MySQL
- JWT authentication
- Role and permission based authorization

Main backend areas:

- `Program.cs`: service registration, authentication, CORS, startup seed/upgrade routines, controller mapping.
- `Data/AppDbContext.cs`: EF Core database context and model relationships.
- `Data/DbSeeder.cs`: seeded companies, users, employees, lookups, demo data.
- `Data/PhaseBDatabaseUpgrade.cs`: additive architecture upgrade database setup and seed permissions.
- `Models/Entities.cs`: core domain entities.
- `Services/PermissionService.cs`: permission and data-scope enforcement.
- `Services/SalaryCalculationService.cs`: dynamic salary component calculation.
- `Controllers/`: REST API surface.

Important API controllers:

- `AuthController`: login, refresh, logout, change password, current user.
- `EmployeesController`: employee list/detail/create/update, profile-related endpoints, qualifications.
- `AttendanceController`: attendance dashboard, records, employee self-service, requests, locations.
- `LeaveController`: leave types, policies, requests, balances.
- `OvertimeController`: overtime log, requests, reports, rules.
- `PayrollController`: payroll runs and payslips.
- `SalaryAdvancesController`: salary advance requests and approvals.
- `DocumentsController`: employee documents and compliance-required document tracking.
- `AssetsController`: asset inventory, assignment, employee asset self-service.
- `ComplianceController`: social security, permits, health certificates, criminal record checks.
- `DisciplinaryController`: disciplinary cases, investigation, decisions.
- `ResignationController`: resignation workflow.
- `ClearanceController`: clearance and end-of-service flow.
- `OrgNodesController`: organization hierarchy.
- `UsersController`: user administration.
- `PermissionsController`: permissions and role-access data.
- `ReportsController`: reporting endpoints.
- `ConfigController`: system configuration.

## Frontend

Technology:

- Angular standalone components
- Lazy-loaded routes
- Role-aware UI
- API service wrappers

Main frontend areas:

- `src/app/app.routes.ts`: route definitions.
- `src/app/core/services/auth.service.ts`: login/session/current-user role helpers.
- `src/app/core/services/api.service.ts`: API calls.
- `src/app/core/services/role-access.service.ts`: frontend role access checks.
- `src/app/layout/`: authenticated application shell.
- `src/app/features/`: feature screens.

Main application routes:

```text
/login
/change-password
/register
/subscription-expired
/admin/companies
/admin/users

/app/dashboard
/app/employees
/app/employees/:id
/app/pre-employment
/app/pre-employment/evaluation/:employeeId
/app/disciplinary
/app/resignations
/app/clearance
/app/compliance
/app/assets
/app/shifts
/app/attendance
/app/leave
/app/overtime
/app/payroll/runs
/app/payroll/slips
/app/documents
/app/advances
/app/holidays
/app/reports
/app/users
/app/settings
/app/forms
/app/forms/:formId
```

## Roles

Primary roles:

- `superadmin`: platform-level administration.
- `hradmin`: company HR administration.
- `payrolladmin`: payroll administration.
- `manager`: scoped manager access.
- `employee`: self-service access.

Current role-scope behavior:

- Employee users see their own attendance, leave, payroll slips, advances, documents, and assets.
- Employees cannot list all employees.
- Managers now see only direct reports in `/api/employees`; manager self is excluded from the employee list.
- HR admins see company employees and organization data.

## Core Modules

### Employee Management

Maintains employee master records, employment details, salary fields, compliance fields, manager relationships, organization node links, and profile tabs.

Recent additions:

- Employee qualifications endpoints.
- Employee profile qualifications tab.
- Employee action tracking for transfer, promotion, suspension, reactivation, and termination.

### Organization Architecture

Organization nodes support department/team/branch style hierarchy. Employees retain backward-compatible `DepartmentId` while also supporting `OrgNodeId`.

### Attendance

Supports attendance records, clock in/out, attendance summaries, locations, maps, and attendance correction requests. Employee role is scoped to own records.

### Leave

Supports leave types, policies, requests, balances, approvals, employee self-service, and role-scoped request visibility.

### Overtime

Supports overtime dashboard, logs, employee requests, approvals, reports, and rules. Employee role is scoped to own requests/logs.

### Payroll

Supports payroll runs and payslips. Dynamic salary components are available through `SalaryCalculationService`, with fallback to legacy hardcoded salary allowance fields.

### Salary Advances

Supports employee salary advance requests, HR approval/rejection, summaries, and self-service employee visibility.

### Documents

Supports document types, document uploads/records, missing required document checks, expiry tracking, and role-scoped access.

### Assets

Supports asset inventory, assignment, return, retirement, employee receive confirmation, and employee return requests.

### Compliance

Tracks employee compliance data, including social security, work permits, health certificates, criminal records, and compliance overview metrics.

### Disciplinary

Supports disciplinary cases, violation catalogs, investigations, decisions, employee acknowledgment, closing, and cancellation.

### Resignations And Clearance

Supports resignation workflow, clearance records, assigned assets checks, and end-of-service calculations.

### Users And Permissions

Supports company users, role assignment, password reset, active toggle, linked employees, role permissions, and data scopes.

## Database Architecture Upgrade

Phase B additive database work includes:

- `OrganizationNodes`
- `Employees.OrgNodeId`
- `Roles`
- `Permissions`
- `RolePermissions`
- `Users.RoleId`
- `JobDescriptions`
- `CareerPaths`
- `EmployeeActions`
- `SalaryComponents`
- `EmployeeSalaryComponents`

Compatibility rules:

- Existing `DepartmentId` remains for backward compatibility.
- Existing `User.Role` remains for backward compatibility.
- Database changes are additive.
- Existing APIs and UI modules are preserved.

## Current Test Accounts

Seeded or created accounts currently used in smoke tests:

| Username | Role | Password Known |
|---|---|---|
| `hr` | `hradmin` | `Hr@1234` |
| `manager` | `manager` | `Manager@1234` |
| `employee_test` | `employee` | `Employee@1234` |

Notes:

- Seed logic includes `employee / Employee@1234`, but the live database login returned `401`, so `employee_test` was created for reliable employee smoke testing.

## Latest H2 Smoke Test Results

Employee account: `employee_test / Employee@1234`

| Check | Result |
|---|---|
| Employee login | Passed |
| `GET /api/leave/requests` | Passed, own records only |
| `GET /api/attendance` | Passed, own records only |
| `GET /api/payroll/slips` | Passed, own records only |
| `GET /api/employees` | Passed, returns `403` |

Manager account: `manager / Manager@1234`

| Check | Result |
|---|---|
| `GET /api/employees` | Passed, returns only direct reports |
| Manager self excluded | Passed |

HR account: `hr / Hr@1234`

| Check | Result |
|---|---|
| `GET /api/employees` | Passed |
| `GET /api/org-nodes` | Passed |

## Latest Build Status

Backend:

```text
dotnet build
Build succeeded.
0 warnings.
0 errors.
```

Frontend:

```text
npm run build / Angular build
Build succeeded.
Known budget warnings remain for dashboard/layout SCSS.
```

## Current Implementation Notes

- Manager employee scope is enforced in `PermissionService` for the `employees` screen by filtering employees where `DirectManagerId == managerEmployeeId`.
- Employee filter toolbars are hidden in attendance, leave, overtime, and advances screens.
- Employee API access is scoped through permission/data-scope logic or dedicated `/me` endpoints.
- Dynamic salary components are supported while legacy salary fields remain as fallback.

## Operational Notes

The backend normally listens on port `5000`.

For local Windows testing, a reachable MySQL connection string may be needed, for example:

```text
ConnectionStrings__MySQL=Server=127.0.0.1;Port=3306;Database=zenjo;User=zenjo_user;Password=ZenJO2024!;CharSet=utf8mb4;SslMode=None;
```

The checked-in `appsettings.json` may contain an environment-specific Unix socket connection string. Use an environment override for local Windows runs.

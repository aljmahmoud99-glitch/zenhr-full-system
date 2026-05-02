# ZenJO / ZenHR Full System Specification

## 1. Overview
ZenJO is an enterprise HRMS and payroll platform built for multi-company operations. The active implementation stack in this repository is:

- Frontend: `artifacts/zenjo-ng` using Angular 18
- Backend: `artifacts/zenjo-api` using .NET 9 Web API
- Database: MySQL

The system supports the full employee lifecycle, operational HR workflows, payroll processing, compliance tracking, and platform administration.

## 2. Active Architecture
### Frontend
- Angular standalone-component application
- Shared shell with sidebar, topbar, page container, RTL/LTR-aware layout
- Shared design system for cards, forms, buttons, badges, tables, and skeleton loaders
- Role-based navigation and route protection
- Arabic and English localization with root-level direction switching

### Backend
- ASP.NET Core Web API
- JWT-based authentication
- Tenant/company-aware data access
- Role-based authorization
- Controller-based modular business APIs

### Database
- MySQL relational database
- Employee, attendance, leave, overtime, payroll, documents, assets, compliance, user, and company tables
- Seeded baseline system configuration for payroll and compliance rules

## 3. Primary Roles
The active system uses 5 roles only:

- `superadmin`
- `hradmin`
- `payrolladmin`
- `manager`
- `employee`

`recruiter` is removed from the active system scope.

## 4. Role Responsibilities
### Superadmin
- Manages platform-level companies and admin users
- Accesses `/admin/*` platform area
- Cannot operate as an HR business user inside operational modules

### HR Admin
- Manages employees, HR workflows, documents, compliance, approvals, and user creation for manager/employee accounts
- Has broad operational access within company scope

### Payroll Admin
- Manages payroll runs, payroll review, salary advances, and payroll financial outputs
- Uses approved source data from attendance, overtime, leave, and advances

### Manager
- Sees own team only
- Approves scoped leave/overtime flows
- Reviews attendance and team operational data

### Employee
- Accesses self-service features only
- Uses attendance, leave, overtime, payslips, and profile pages for own data

## 5. Core Modules
### Authentication
- Login
- Refresh token flow
- Logout
- Current user endpoint
- Forced password change on first login

### User Management
- Role-based account creation hierarchy
- Temporary password generation
- Employee-linked user accounts
- Activation/deactivation

### Employee Management
- Employee master profile
- Department and job title assignment
- Employment status
- Salary and banking details
- Probation tracking

### Attendance
- Clock-in / clock-out
- Daily attendance records
- Attendance dashboard
- Manual correction requests
- Geo/location checks and suspicious event flags

### Leave
- Leave requests
- Leave balances
- Leave approvals
- Leave policy administration

### Overtime
- Explicit overtime requests only
- Manager/HR approvals
- Compensation type handling
- Payroll-linked approved overtime

### Payroll
- Payroll run creation
- Snapshot salary storage in payslips
- SSC calculation
- Income tax calculation
- Approved advances deduction
- Overtime inclusion
- Draft to approved immutable payroll flow

### Documents
- Employee document management
- Expiry tracking
- Expiring document alerts

### Compliance
- SSC enrollment tracking
- Work permit expiry
- Residency expiry
- Health certificate expiry
- Compliance alert surfacing

### Assets
- Asset assignment
- Asset status tracking
- Clearance integration

### Clearance
- Aggregates status from assets, advances, and exit-related obligations
- Orchestrator only, not source-of-truth owner

### Disciplinary
- Disciplinary cases
- Action lifecycle
- HR operational tracking

### Resignations
- Notice and resignation workflows
- Exit tracking
- Linked clearance visibility

### Pre-Employment
- Candidate-to-employee pre-employment workflow
- Evaluation and onboarding preparation

### Shifts and Holidays
- Shift setup
- Shift assignment
- Public holiday configuration
- Working-day logic used by attendance/payroll

### Reports
- HR and payroll reporting
- Operational summaries
- KPI and filtered reporting views

### Forms
- Configurable forms
- Form viewer experience
- Workflow-friendly internal records

### Settings and Config
- Company configuration
- Payroll configuration values
- Compliance thresholds
- Tenant-aware settings

## 6. Business Ownership Rules
### Attendance owns
- Clock-in / clock-out
- Attendance records
- Attendance correction requests
- Daily attendance status

Source of truth:
- `AttendanceRecords`

### Leave owns
- Leave requests
- Leave balances
- Leave policies and leave types

Source of truth:
- `LeaveRequests`
- `LeaveBalances`

### Overtime owns
- Overtime requests
- Overtime approvals
- Overtime compensation values

Source of truth:
- `OvertimeRequests` or approved overtime records used by payroll

Rule:
- Overtime is not auto-generated from attendance

### Payroll owns
- Payroll runs
- Payslip generation
- Payroll approval state
- Immutable post-approval outputs

Source of truth:
- `PayrollRuns`
- `Payslips`

Rule:
- Approved payroll runs are immutable

### Compliance owns
- Compliance status derived from employee and document records

### Clearance owns
- Clearance status workflow only
- Reads from other modules

## 7. User Creation Hierarchy
### Superadmin can create
- `hradmin`
- `payrolladmin`

### HR Admin can create
- `manager`
- `employee`

### Manager can create
- None

### Employee can create
- None

Additional rules:
- Superadmin cannot create another superadmin through UI
- HR Admin must link manager/employee accounts to existing employee records
- Temporary password is generated and shown once
- `MustChangePassword` is enforced on first login

## 8. Permission Model
Permissions are enforced in 3 layers:

- Backend `[Authorize]` and scoped controller logic
- Frontend `role-access.service.ts`
- Frontend routes via `app.routes.ts`

Important rules:
- Superadmin is excluded from operational HR routes
- Manager scope is limited to direct team
- Employee scope is limited to self
- Salary and banking visibility are restricted to approved roles

## 9. Payroll Engine Rules
Payroll calculation is configuration-driven and tenant-aware.

### Inputs
- Active employees
- Salary snapshots from employee records at run time
- Approved overtime
- Approved salary advances not yet deducted
- Attendance-based absence impact
- Public holidays
- Weekend/working-day rules
- Tax and SSC config from `SystemConfiguration`

### Stored in payslip snapshot
- Basic salary
- Housing allowance
- Transport allowance
- Mobile allowance
- Meal allowance
- Other allowances

### Deductions
- SSC employee share
- Income tax
- Absence deduction
- Advance deduction
- Other configured deductions

### Outputs
- Gross salary
- Total deductions
- Net salary
- SSC employer share
- Immutable approved payslip records

## 10. Dashboard Strategy
The dashboard is role-driven.

### HR Dashboard
- Workforce summary
- Attendance summary
- Pending approvals
- Compliance alerts
- Department headcount

### Payroll Dashboard
- Current/latest run
- Net payroll
- Pending advances
- Payroll-focused quick actions

### Manager Dashboard
- Team attendance
- Pending team approvals
- Team summary cards

### Employee Dashboard
- Today attendance status
- Pending personal requests
- Latest payslip

## 11. Localization and Layout Rules
### Arabic mode
- `lang="ar"`
- `dir="rtl"`
- Arabic-only visible UI
- Sidebar on the right
- RTL-safe layout and spacing

### English mode
- `lang="en"`
- `dir="ltr"`
- English-only visible UI
- Sidebar on the left

Rules:
- No mixed Arabic/English labels in a single UI state
- No raw translation keys in UI
- No icon token names visible as text
- Translation readiness is enforced before app routes render

## 12. Design System
The frontend uses a shared design foundation with:

- Shared shell layout
- Shared spacing scale
- Shared color tokens
- Shared cards
- Shared buttons
- Shared badges
- Shared form fields
- Shared table styling
- Shared skeleton loading components

Goals:
- Consistent enterprise SaaS feel
- Clean dashboard hierarchy
- Responsive behavior
- RTL/LTR correctness

## 13. Active Frontend Areas
Main feature modules in the active Angular app:

- `dashboard`
- `employees`
- `employee-profile`
- `attendance`
- `leave`
- `overtime`
- `payroll`
- `documents`
- `advances`
- `reports`
- `users`
- `settings`
- `forms`
- `compliance`
- `assets`
- `clearance`
- `disciplinary`
- `resignations`
- `pre-employment`
- `holidays`
- `shifts`
- `superadmin`

## 14. Active Backend Areas
Important active API controllers:

- `AuthController`
- `UsersController`
- `EmployeesController`
- `AttendanceController`
- `LeaveController`
- `OvertimeController`
- `PayrollController`
- `DocumentsController`
- `ComplianceController`
- `AssetsController`
- `ClearanceController`
- `DashboardController`
- `ReportsController`
- `SalaryAdvancesController`
- `PublicHolidaysController`
- `ShiftController`
- `ConfigController`
- `AdminController`

## 15. Verification Baseline
Current technical verification target for the active stack:

- Angular frontend build passes
- .NET backend build passes
- MySQL-compatible backend logic is in place
- Role-aware dashboard route exists
- Root localization and direction handling are implemented
- Payroll run creation compiles and uses config-backed logic

## 16. Repository Scope Notes
Active implementation:

- `ZenHR-Full-System/artifacts/zenjo-ng`
- `ZenHR-Full-System/artifacts/zenjo-api`

Legacy or non-primary areas should not be treated as the source of truth for current implementation.

## 17. Summary
ZenJO / ZenHR is a production-style HRMS and payroll platform with:

- 5-role access model
- full employee lifecycle support
- attendance, leave, overtime, payroll, compliance, documents, assets, and reporting
- multi-company architecture
- Arabic/English support with RTL/LTR behavior
- Angular frontend, .NET backend, and MySQL database

This file is intended to serve as the single high-level system Markdown for the active implementation in this repository.

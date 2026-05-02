# ZenJO Full Project Overview

## 1. Executive Summary

ZenJO is a Human Resources and Payroll platform focused on employee lifecycle management, HR operations, payroll workflows, attendance, compliance, documents, forms, and self-service.

This repository contains **two parallel implementations**:

1. **Primary system**
   - Frontend: `Angular 18`
   - Backend: `.NET 9 Web API`
   - Database: `MySQL`
   - Main folders:
     - `artifacts/zenjo-ng`
     - `artifacts/zenjo-api`

2. **Legacy/reference system**
   - Frontend: `React`
   - Backend: `Node/Express`
   - Database: `Postgres/Drizzle`
   - Main folders:
     - `artifacts/zenjo`
     - `artifacts/api-server`
     - `lib/*`

For current development, the **Angular + .NET + MySQL** system is the active primary stack.

---

## 2. Repository Structure

The repository has a nested layout:

- Outer folder:
  - `C:\Users\w10\Downloads\ZenHR-Full-System`
- Actual working project root:
  - `C:\Users\w10\Downloads\ZenHR-Full-System\ZenHR-Full-System`

Important root-level items:

- `artifacts/`
  - Main application code
- `scripts/`
  - Additional tooling and package scripts
- `run-frontend.bat`
  - Starts Angular frontend
- `run-backend.bat`
  - Starts .NET backend with local MySQL bootstrap
- `run-mysql.bat`
  - Initializes and starts local MySQL
- `run-zenjo.bat`
  - Combined launcher
- `database.sql`
  - SQL reference/export
- `ZenJO-System-Documentation.md`
  - Existing project documentation
- `ZENJO_SYSTEM_SPEC.md`
  - System specification
- `replit.md`
  - Earlier environment/setup notes

---

## 3. Primary Architecture

### 3.1 Frontend

Location:

- `artifacts/zenjo-ng`

Technology:

- Angular `18`
- Angular Router
- Angular Forms
- SCSS styling
- Standalone components

Key frontend entry points:

- `src/app/app.routes.ts`
  - Defines all application routes
- `src/app/layout/`
  - Main shell/layout
- `src/app/core/`
  - Shared services, guards, models, auth, access control
- `src/app/features/`
  - Feature modules/screens

Frontend build commands:

```powershell
cd C:\Users\w10\Downloads\ZenHR-Full-System\ZenHR-Full-System\artifacts\zenjo-ng
npm.cmd start
npm.cmd run build
```

### 3.2 Backend

Location:

- `artifacts/zenjo-api`

Technology:

- ASP.NET Core `.NET 9`
- Entity Framework Core
- Pomelo MySQL provider
- JWT authentication
- Tenant-aware middleware

Key backend entry points:

- `Program.cs`
  - DI, auth, CORS, DbContext, middleware, startup
- `Controllers/`
  - REST API endpoints
- `Data/AppDbContext.cs`
  - EF Core model registration
- `Data/DbSeeder.cs`
  - Seeds demo data
- `Models/Entities.cs`
  - Domain entities
- `Services/`
  - JWT and tenant services

### 3.3 Database

Technology:

- MySQL `8.x`

Current local setup:

- Local MySQL instance is initialized under:
  - `.mysql/data`
- Default DB:
  - `zenjo`
- Default user:
  - `zenjo_user`
- Default password:
  - `ZenJO2024!`

The backend receives its connection string via environment variable:

- `ConnectionStrings__MySQL`

---

## 4. Application Startup Flow

### 4.1 Backend startup

`run-backend.bat` does the following:

1. Calls `run-mysql.bat`
2. Ensures MySQL is available on `127.0.0.1:3306`
3. Creates the `zenjo` database and local DB user if needed
4. Detects and stops an older backend process on the configured port
5. Builds the API into:
   - `build/zenjo-api-run`
6. Runs:
   - `build/zenjo-api-run/ZenjoApi.dll`

This avoids file-lock conflicts from old `bin/Release` apphost executables.

### 4.2 Frontend startup

`run-frontend.bat` starts Angular dev server, usually on:

- `http://localhost:4200`

### 4.3 Full stack startup

Run from the inner project root:

```powershell
cd C:\Users\w10\Downloads\ZenHR-Full-System\ZenHR-Full-System
.\run-backend.bat
.\run-frontend.bat
```

---

## 5. Authentication and Authorization

### 5.1 Authentication

The backend uses JWT bearer authentication.

Key file:

- `artifacts/zenjo-api/Controllers/AuthController.cs`

Login endpoint:

- `POST /api/auth/login`

Important frontend auth file:

- `artifacts/zenjo-ng/src/app/core/services/auth.service.ts`

The frontend stores:

- `zenjo_token`
- `zenjo_refresh`
- `zenjo_user`

### 5.2 Supported Roles

Main roles found in the system:

- `superadmin`
- `hradmin`
- `payrolladmin`
- `manager`
- `employee`
- `recruiter`

### 5.3 Frontend Access Control

Key file:

- `artifacts/zenjo-ng/src/app/core/services/role-access.service.ts`

This file controls:

- Route/page access
- Sidebar navigation per role
- Action/button visibility
- Widget visibility

### 5.4 Backend Access Control

The backend uses:

- `[Authorize]`
- `[Authorize(Roles = "...")]`

This means frontend visibility and backend enforcement are separate layers.

---

## 6. Multi-Tenancy

ZenJO is tenant-aware.

Key files:

- `artifacts/zenjo-api/Services/ITenantService.cs`
- `artifacts/zenjo-api/Services/TenantService.cs`
- `artifacts/zenjo-api/Middleware/TenantValidationMiddleware.cs`

Purpose:

- Resolve current company/tenant
- Restrict data by company
- Ensure API requests operate inside the correct tenant scope

In controllers, tenant filtering often appears as:

```csharp
private int Cid => tenant.GetCompanyId();
```

and then:

```csharp
Where(x => x.CompanyId == Cid)
```

---

## 7. Main Functional Domains

The application covers a broad HR lifecycle.

### 7.1 Dashboard

Purpose:

- Central operational summary
- Pending approvals
- Workforce overview
- Quick actions

Frontend:

- `features/dashboard`

Backend:

- `DashboardController.cs`

### 7.2 Employees

Purpose:

- Employee records
- Job and department data
- Personal, organizational, and salary info

Frontend:

- `features/employees`
- `features/employee-profile`

Backend:

- `EmployeesController.cs`
- `DepartmentsController.cs`
- `JobTitlesController.cs`

### 7.3 Pre-Employment

Purpose:

- Recruitment pipeline before employee onboarding

Frontend:

- `features/pre-employment`

Backend:

- `PreEmploymentController.cs`

### 7.4 Attendance and Shifts

Purpose:

- Time tracking
- Attendance records
- Shift assignment and exceptions

Frontend:

- `features/attendance`
- `features/shifts`

Backend:

- `AttendanceController.cs`
- `ShiftController.cs`

### 7.5 Leave

Purpose:

- Employee leave requests
- HR/manager approvals
- Leave balances

Frontend:

- `features/leave`

Backend:

- `LeaveController.cs`

### 7.6 Overtime

Purpose:

- Extra-hours requests
- Approval workflows

Frontend:

- `features/overtime`

Backend:

- `OvertimeController.cs`

### 7.7 Payroll

Purpose:

- Payroll runs
- Payslips
- Salary calculations and outputs

Frontend:

- `features/payroll`

Backend:

- `PayrollController.cs`

### 7.8 Salary Advances

Purpose:

- Employee advance requests
- HR review and approval/rejection
- Repayment and outstanding balance tracking

Frontend:

- `features/advances`

Backend:

- `SalaryAdvancesController.cs`

Recent implementation status:

- Employee can submit a new advance request from the UI
- HR can view requests and approve/reject them
- Frontend is wired to real API endpoints
- Employee navigation now includes the advances tab

### 7.9 Documents and Assets

Purpose:

- Employee documents
- Asset assignment and tracking

Frontend:

- `features/documents`
- `features/assets`

Backend:

- `DocumentsController.cs`
- `AssetsController.cs`

### 7.10 Compliance

Purpose:

- SSC/social security monitoring
- Work permits
- residency/passport/health certificate status

Frontend:

- `features/compliance`

Backend:

- `ComplianceController.cs`

### 7.11 Discipline, Resignation, Clearance

Purpose:

- Employee discipline cases
- Resignation processing
- Exit clearance workflows

Frontend:

- `features/disciplinary`
- `features/resignations`
- `features/clearance`

Backend:

- `DisciplinaryController.cs`
- `ResignationController.cs`
- `ClearanceController.cs`

### 7.12 Forms

Purpose:

- Official HR forms
- Dynamic form rendering
- Employee and admin document workflows

Frontend:

- `features/forms`

Backend:

- `FormsController.cs`

### 7.13 Holidays, Reports, Users, Settings

Frontend:

- `features/holidays`
- `features/reports`
- `features/users`
- `features/settings`

Backend:

- `PublicHolidaysController.cs`
- `ReportsController.cs`
- `UsersController.cs`
- `ConfigController.cs`
- `AdminController.cs`

---

## 8. API Layer

The backend follows a REST controller structure.

Main controller inventory:

- `AdminController.cs`
- `AssetsController.cs`
- `AttendanceController.cs`
- `AuthController.cs`
- `BanksController.cs`
- `ClearanceController.cs`
- `ComplianceController.cs`
- `ConfigController.cs`
- `DashboardController.cs`
- `DepartmentsController.cs`
- `DisciplinaryController.cs`
- `DocumentsController.cs`
- `EmployeesController.cs`
- `FormsController.cs`
- `JobTitlesController.cs`
- `LeaveController.cs`
- `LookupsController.cs`
- `NotificationsController.cs`
- `OvertimeController.cs`
- `PayrollController.cs`
- `PreEmploymentController.cs`
- `ProbationController.cs`
- `PublicHolidaysController.cs`
- `RegisterController.cs`
- `ReportsController.cs`
- `ResignationController.cs`
- `SalaryAdvancesController.cs`
- `ShiftController.cs`
- `UsersController.cs`

API design characteristics:

- JWT-protected endpoints
- Role-based authorization
- Tenant filtering
- JSON response pattern:

```json
{
  "success": true,
  "data": {}
}
```

---

## 9. Data Model

Primary entity definitions live in:

- `artifacts/zenjo-api/Models/Entities.cs`

Primary EF registration lives in:

- `artifacts/zenjo-api/Data/AppDbContext.cs`

Important entity families include:

- Companies
- Users
- Employees
- Departments
- Job titles
- Leave balances and leave requests
- Attendance and shift records
- Overtime records
- Payroll runs and payslips
- Salary advances
- Documents
- Assets
- Pre-employment records
- Compliance records
- Resignations
- Clearance records
- Forms and form records

The system also contains seed data created automatically by:

- `DbSeeder.SeedAsync(db)`

---

## 10. Frontend Features Structure

Location:

- `artifacts/zenjo-ng/src/app/features`

Current feature folders:

- `advances`
- `assets`
- `attendance`
- `auth`
- `clearance`
- `compliance`
- `dashboard`
- `disciplinary`
- `documents`
- `employee-profile`
- `employees`
- `forms`
- `holidays`
- `leave`
- `overtime`
- `payroll`
- `pre-employment`
- `reports`
- `resignations`
- `settings`
- `shifts`
- `subscription-expired`
- `superadmin`
- `users`

Most features follow the Angular standalone component approach and keep:

- component TypeScript
- HTML template
- SCSS styles

---

## 11. Language Support

The UI supports Arabic and English.

Key behavior:

- Arabic uses `RTL`
- English uses `LTR`

Language state is stored by the frontend auth/core layer:

- `zenjo_lang` in local storage

`AuthService.setLang(...)` updates:

- `lang`
- `dir`
- body classes

Some feature screens use local translation maps inside the component, while broader shell/navigation text is defined in role/navigation config.

---

## 12. Salary Advances Module Detail

This module was recently upgraded and connected to the real backend.

### Employee side

Screen:

- `السلف الخاصة بي / My Advances`

Capabilities:

- View previous advance requests
- Submit new advance request
- See request status
- See approved amount
- See repayment plan
- See remaining balance

### HR side

Screen:

- `إدارة السلف / Advances Management`

Capabilities:

- View all requests
- Search and filter
- Open advance details
- Approve or reject
- Set approved amount
- Set repayment plan

### Backend implementation notes

`SalaryAdvancesController.cs` now returns richer fields such as:

- `requestedAmount`
- `approvedAmount`
- `repaymentMethod`
- `repaymentPlan`
- `remainingBalance`
- `requestNotes`
- `decisionNotes`
- `rejectionReason`

Some metadata is stored in serialized JSON inside the existing `Notes` column to avoid schema-breaking migrations.

---

## 13. Legacy Stack in the Same Repo

The repository also includes an older TypeScript workspace.

Important folders:

- `artifacts/zenjo`
- `artifacts/api-server`
- `lib/api-spec`
- `lib/api-client-react`
- `lib/api-zod`
- `lib/db`

This older stack appears to be:

- schema-driven
- pnpm workspace based
- React/Express/Postgres oriented

It is useful as reference, but it is not the current primary runtime target.

---

## 14. Build and Verification Status

Confirmed in current work:

- Angular frontend builds successfully
- .NET backend builds successfully
- Salary advances frontend is wired to the live API
- Employee advances tab has been added to employee navigation
- Backend launcher was adjusted to avoid locked `ZenjoApi.exe` conflicts

Known caveats:

- Some style-budget warnings still exist in Angular
- EF Core emits model validation warnings about global query filters on required relationships
- Local environment can still hit transient Windows port reuse delays after killing an older API process

---

## 15. Demo Accounts

Typical seeded accounts:

- `admin / Admin@1234`
- `hr / Hr@1234`
- `payroll / Payroll@1234`
- `manager / Manager@1234`
- `employee / Employee@1234`
- `recruiter / Recruiter@1234`

These depend on successful DB seeding during backend startup.

---

## 16. Recommended Working Rules for This Repo

For future development, use these assumptions:

1. Treat `artifacts/zenjo-ng` as the active frontend.
2. Treat `artifacts/zenjo-api` as the active backend.
3. Treat MySQL as the active database.
4. Treat the React/Express/Postgres workspace as legacy/reference only unless explicitly requested.
5. Keep role visibility in sync between:
   - `app.routes.ts`
   - `role-access.service.ts`
   - backend `[Authorize(Roles = ...)]`

---

## 17. Suggested Next Documentation Files

If this project continues growing, these follow-up docs would be useful:

- `API_ENDPOINTS.md`
  - endpoint-by-endpoint API catalog
- `DATABASE_MODEL.md`
  - entity and relationship reference
- `ROLE_MATRIX.md`
  - exact route/action visibility per role
- `DEPLOYMENT_GUIDE.md`
  - production hosting, env vars, reverse proxy, SSL, backups
- `MODULES/ADVANCES.md`
  - detailed functional spec for salary advances

---

## 18. Final Summary

ZenJO is a full HR and payroll platform with a modern Angular/.NET/MySQL implementation that supports:

- tenant-aware business logic
- role-based access control
- HR administration
- payroll workflows
- employee self-service
- compliance management
- document and form handling
- salary advances and approvals

This repository is broad and multi-era, but the active path is clear:

- **Frontend:** `artifacts/zenjo-ng`
- **Backend:** `artifacts/zenjo-api`
- **Database:** MySQL

That is the stack that should be extended, maintained, and documented going forward.

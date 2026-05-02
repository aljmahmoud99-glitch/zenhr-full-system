# Phase A Findings - Core Architecture Upgrade

Date: 2026-04-28

Scope reviewed:
- `artifacts/zenjo-api/Models/Entities.cs`
- `artifacts/zenjo-api/Data/AppDbContext.cs`
- `artifacts/zenjo-api/Controllers/*.cs`
- `artifacts/zenjo-ng/src/app/core/services/role-access.service.ts`
- `artifacts/zenjo-ng/src/app/app.routes.ts`

## Summary

Phase A source review is complete.

I found:
- 57 entity classes
- 57 DbSets
- 32 controllers
- 27 `SCREEN_ACCESS` keys
- 28 `ACTION_ACCESS` keys
- 37 Angular route path entries including redirects and wildcard

No existing structured Phase A findings report was found before this file was created.

## A1. Entity Review

Entities found:

Company, CompanySubscription, CompanyRegistration, Department, JobTitle, OrganizationNode, Role, Permission, RolePermission, JobDescription, CareerPath, Bank, Nationality, Governorate, City, Employee, User, AttendanceRecord, AttendanceRequest, WorkLocation, LeaveType, LeavePolicy, LeaveBalance, LeaveRequest, OvertimeRequest, OvertimeRecord, OvertimeRule, PayrollRun, Payslip, EmployeeAction, SalaryComponent, EmployeeSalaryComponent, PreEmploymentRecord, Resignation, ClearanceRecord, ResignationApproval, ExitInterview, ViolationType, DisciplinaryAction, DisciplinaryInvestigation, SalaryAdvance, AssetCategory, Asset, DocumentType, Document, EmployeeComplianceStatus, SystemConfiguration, ActivityLog, PublicHoliday, PublicHolidayDepartment, Notification, ProbationEvaluation, FormRecord, Shift, ShiftAssignment, ShiftRotation, ShiftException.

Entities missing `CompanyId`:

Company, CompanyRegistration, Permission, RolePermission, Bank, Nationality, Governorate, City, AttendanceRecord, LeaveType, LeaveBalance, LeaveRequest, Payslip, EmployeeSalaryComponent, ViolationType, AssetCategory, DocumentType, EmployeeComplianceStatus, PublicHolidayDepartment, Notification.

Entities missing `IsDeleted`:

CompanySubscription, CompanyRegistration, Role, Permission, RolePermission, JobDescription, CareerPath, Bank, Nationality, Governorate, City, AttendanceRecord, AttendanceRequest, WorkLocation, LeaveType, LeavePolicy, LeaveBalance, OvertimeRecord, OvertimeRule, Payslip, EmployeeAction, SalaryComponent, EmployeeSalaryComponent, PreEmploymentRecord, Resignation, ClearanceRecord, ResignationApproval, ExitInterview, ViolationType, DisciplinaryAction, DisciplinaryInvestigation, SalaryAdvance, AssetCategory, DocumentType, EmployeeComplianceStatus, SystemConfiguration, ActivityLog, PublicHoliday, PublicHolidayDepartment, Notification, ProbationEvaluation, FormRecord, Shift, ShiftAssignment, ShiftRotation, ShiftException.

Entities missing `CreatedAt`:

Permission, RolePermission, CareerPath, Bank, Nationality, Governorate, City, LeavePolicy, LeaveBalance, OvertimeRule, ViolationType, AssetCategory, DocumentType, EmployeeComplianceStatus, SystemConfiguration, PublicHolidayDepartment.

Phase B target entities already present in `Entities.cs`:

OrganizationNode, Role, Permission, RolePermission, JobDescription, CareerPath, EmployeeAction, SalaryComponent, EmployeeSalaryComponent.

Backward compatibility fields already present:

- `Employee.DepartmentId`
- `Employee.OrgNodeId`
- `User.Role`
- `User.RoleId`

## A2. DbContext Review

DbSets found:

CompanySubscriptions, CompanyRegistrations, Companies, Departments, JobTitles, OrganizationNodes, Roles, Permissions, RolePermissions, JobDescriptions, CareerPaths, Employees, Users, Banks, Nationalities, Governorates, Cities, AttendanceRecords, AttendanceRequests, WorkLocations, LeaveTypes, LeavePolicies, LeaveBalances, LeaveRequests, OvertimeRequests, OvertimeRecords, OvertimeRules, PayrollRuns, Payslips, EmployeeActions, SalaryComponents, EmployeeSalaryComponents, PreEmploymentRecords, Resignations, ClearanceRecords, ResignationApprovals, ExitInterviews, ViolationTypes, DisciplinaryActions, DisciplinaryInvestigations, SalaryAdvances, AssetCategories, Assets, DocumentTypes, Documents, EmployeeComplianceStatuses, SystemConfigurations, ActivityLogs, PublicHolidays, PublicHolidayDepartments, Notifications, ProbationEvaluations, FormRecords, Shifts, ShiftAssignments, ShiftRotations, ShiftExceptions.

Important indexes and unique constraints found:

- `OrganizationNode`: `CompanyId`, `ParentId`, `NodeType`, composite `(CompanyId, NodeType)`
- `Role`: unique `(CompanyId, Name)`
- `Permission`: unique `(Screen, Action)`
- `RolePermission`: `RoleId`, `PermissionId`, unique `(RoleId, PermissionId)`
- `JobDescription`: `CompanyId`, `OrgNodeId`
- `CareerPath`: `CompanyId`, `FromJobDescriptionId`, `ToJobDescriptionId`, unique `(FromJobDescriptionId, ToJobDescriptionId)`
- `User`: unique `Username`
- `LeaveType`: unique `Code`
- `OvertimeRule`: unique `CompanyId`
- `EmployeeAction`: `EmployeeId`, `ActionType`, `EffectiveDate`, composite `(CompanyId, EmployeeId)`
- `SalaryComponent`: unique `(CompanyId, Code)`
- `EmployeeSalaryComponent`: `EmployeeId`, `SalaryComponentId`, `EffectiveFrom`
- `ClearanceRecord`: unique `ResignationId`
- `ViolationType`: unique `Code`
- `DisciplinaryInvestigation`: unique `CaseId`
- `DocumentType`: unique `Code`
- `SystemConfiguration`: unique `(CompanyId, Key)`

Important FK delete behaviors found:

- Most company and employee relationships use `Restrict`
- `OrganizationNode.ParentId` uses `Restrict`
- `OrganizationNode.ManagerEmployeeId` uses `SetNull`
- `Employee.OrgNodeId` uses `SetNull`
- `User.RoleId` uses `SetNull`
- `RolePermission.RoleId` and `PermissionId` use `Cascade`
- `JobDescription.OrgNodeId` uses `SetNull`
- `CareerPath` source/target job descriptions use `Restrict`
- `EmployeeAction.CreatedByUserId` uses `SetNull`

## A3. Controller Route and Authorization Map

| Controller | Route prefix | Class authorization | Absolute action routes |
|---|---|---|---|
| AdminController | `api/admin` | `Authorize(Roles = "superadmin")` | |
| AssetsController | `api/assets` | `Authorize(Roles = "hradmin,manager,employee,payrolladmin,superadmin")` | `/api/employee/assets`, `/api/employee/assets/summary`, `/api/employee/assets/{id:int}/confirm-receive`, `/api/employee/assets/{id:int}/request-return` |
| AttendanceController | `api/attendance` | `Authorize` | |
| AuthController | `api/auth` | none at class level | |
| BanksController | `api/banks` | `Authorize` | |
| ClearanceController | `api/clearance` | `Authorize` | |
| ComplianceController | `api/compliance` | `Authorize` | |
| ConfigController | `api/config` | `Authorize` | |
| DashboardController | `api/dashboard` | `Authorize` | |
| DepartmentsController | `api/departments` | `Authorize` | |
| DisciplinaryController | `api/disciplinary` | `Authorize` | |
| DocumentsController | `api/documents` | `Authorize(Roles = "hradmin,employee,manager,payrolladmin,superadmin")` | |
| EmployeesController | `api/employees` | `Authorize` | |
| FormsCatalogController | none | `Authorize` | `/forms`, `/api/forms-catalog`, `/forms/{id}`, `/api/forms-catalog/{id}` |
| FormsController | `api/forms` | `Authorize` | |
| FormSubmissionsController | none | `Authorize` | `/form-submissions`, `/api/form-submissions` |
| HolidaysController | none | `Authorize` | `/holidays`, `/api/holidays` |
| JobTitlesController | `api/job-titles` | `Authorize` | |
| LeaveController | `api/leave` | `Authorize` | |
| LookupsController | `api/lookups` | `Authorize` | |
| NotificationsController | `api/notifications` | `Authorize` | |
| OvertimeController | `api/overtime` | `Authorize` | |
| PayrollController | `api/payroll` | `Authorize` | |
| PreEmploymentController | `api/pre-employment` | `Authorize(Roles = "superadmin,hradmin")` | |
| ProbationController | `api/probation` | `Authorize` | |
| PublicHolidaysController | `api/public-holidays` | `Authorize` | |
| RegisterController | `api/register` | none at class level | |
| ReportsController | `api/reports` | `Authorize(Roles = "hradmin,payrolladmin")` | |
| ResignationController | `api/resignations` | `Authorize` | |
| SalaryAdvancesController | `api/salary-advances` | `Authorize` | |
| ShiftController | `api/shifts` | `Authorize` | |
| UsersController | `api/users` | `Authorize(Roles = "superadmin,hradmin")` | |

Routes with no class-level authorization:

- `api/auth`
- `api/register`

Notes:

- `AuthController` has method-level `[Authorize]` on protected account endpoints, while login-like endpoints remain anonymous.
- `RegisterController` is intentionally anonymous for company registration and email availability.

## A4. Frontend Role Access Review

`SCREEN_ACCESS` keys:

`/admin`, `/admin/companies`, `/admin/users`, `/app/dashboard`, `/app/employees`, `/app/employees/new`, `/app/employees/:id`, `/app/pre-employment`, `/app/pre-employment/evaluation/:employeeId`, `/app/disciplinary`, `/app/resignations`, `/app/clearance`, `/app/shifts`, `/app/attendance`, `/app/leave`, `/app/overtime`, `/app/holidays`, `/app/compliance`, `/app/documents`, `/app/assets`, `/app/advances`, `/app/payroll/runs`, `/app/payroll/slips`, `/app/forms`, `/app/reports`, `/app/users`, `/app/settings`.

`ACTION_ACCESS` keys:

`employee:create`, `employee:edit`, `employee:deactivate`, `employee:viewSalary`, `employee:viewBank`, `employee:viewSSC`, `leave:approve:step1`, `leave:approve:step2`, `leave:reject`, `overtime:approve:step1`, `overtime:approve:step2`, `payroll:create`, `payroll:approve`, `payroll:viewAll`, `advance:approve`, `advance:reject`, `advance:viewAll`, `advance:viewTeam`, `advance:create:mine`, `advance:create:tenant`, `disciplinary:create`, `disciplinary:view`, `user:create:hradmin`, `user:create:payrolladmin`, `user:create:manager`, `user:create:employee`, `settings:edit`, `compliance:edit`.

## A5. Angular Route Review

Top-level routes:

- `/` redirects to `/login`
- `/login` uses `guestGuard`
- `/change-password` uses `authGuard`
- `/register` has no guard
- `/subscription-expired` has no guard
- `/admin` uses `authGuard`, with child page routes using `roleGuard` via `pageAccess`
- `/app` uses `authGuard`, with child page routes using `roleGuard` via `pageAccess`
- `**` redirects to `/login`

Admin child routes:

- `/admin` redirects to `/admin/companies`
- `/admin/companies` uses `roleGuard` with `/admin/companies`
- `/admin/users` uses `roleGuard` with `/admin/users`

App child routes:

- `/app` redirects to `/app/dashboard`
- `/app/dashboard`
- `/app/employees`
- `/app/employees/:id`
- `/app/pre-employment`
- `/app/pre-employment/evaluation/:employeeId`
- `/app/disciplinary`
- `/app/resignations`
- `/app/clearance`
- `/app/compliance`
- `/app/assets`
- `/app/shifts`
- `/app/attendance`
- `/app/leave`
- `/app/overtime`
- `/app/payroll` redirects to `/app/payroll/runs`
- `/app/payroll/runs`
- `/app/payroll/slips`
- `/app/documents`
- `/app/advances`
- `/app/holidays`
- `/app/reports`
- `/app/users`
- `/app/settings`
- `/app/forms`
- `/app/forms/:formId`

All listed app/admin page routes use `pageAccess(...)`, which applies `roleGuard`.

## Phase A Completion Status

Complete after creation of this report.

Items already complete before this report:

- Required files existed and were readable.
- Phase B target model classes and DbSets were already present.
- Route and role access files were already present.

Items missing before this report:

- A structured Phase A findings report artifact.

Implemented/fixed in Phase A:

- Created this findings report.

Files changed:

- `PHASE_A_FINDINGS.md`

Build/test result:

- Not run for Phase A because this phase is read/report only.

Next phase status:

- Phase B audit may begin.

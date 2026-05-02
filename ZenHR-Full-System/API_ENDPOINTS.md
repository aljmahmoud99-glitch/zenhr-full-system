# API Endpoints Reference

## Scope

This document describes the current REST API of the **primary ZenJO system**:

- Frontend: `artifacts/zenjo-ng`
- Backend: `artifacts/zenjo-api`
- Base API style: ASP.NET Core controllers under `/api/*`

General response shape used across the API:

```json
{
  "success": true,
  "data": {}
}
```

Authentication:

- JWT Bearer token
- Typical protected routes require:
  - `Authorization: Bearer <token>`

Multi-tenancy:

- Most business controllers are tenant-aware through `ITenantService`
- Data is usually filtered by current `CompanyId`

---

## 1. Auth

Base route:

- `/api/auth`

Endpoints:

- `POST /api/auth/login`
  - Purpose: user login
  - Body: `username`, `password`
  - Returns: `accessToken`, `refreshToken`, current user profile

- `POST /api/auth/refresh`
  - Purpose: renew JWT token
  - Body: `refreshToken`
  - Returns: new `accessToken`, new `refreshToken`

- `POST /api/auth/logout`
  - Purpose: logout current user
  - Auth: required

- `GET /api/auth/me`
  - Purpose: get current authenticated user profile
  - Auth: required

Key file:

- [AuthController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/AuthController.cs:12)

---

## 2. Public Registration

Base route:

- `/api/register`

Endpoints:

- `POST /api/register/company`
  - Purpose: submit a new company registration

- `GET /api/register/check-email`
  - Purpose: check whether an email is already registered

Key file:

- [RegisterController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/RegisterController.cs:9)

---

## 3. Superadmin / Platform Admin

Base route:

- `/api/admin`

Endpoints:

- `GET /api/admin/companies`
  - List companies

- `GET /api/admin/companies/{id}`
  - Company details

- `POST /api/admin/companies/{id}/suspend`
  - Suspend company

- `POST /api/admin/companies/{id}/activate`
  - Activate company

- `PUT /api/admin/companies/{id}/plan`
  - Update subscription/plan settings

- `POST /api/admin/impersonate/{companyId}`
  - Impersonate tenant/company session

- `GET /api/admin/registrations`
  - List pending/processed company registrations

- `POST /api/admin/registrations/{id}/approve`
  - Approve company registration

- `POST /api/admin/registrations/{id}/reject`
  - Reject company registration

- `GET /api/admin/stats`
  - Platform statistics

Key file:

- [AdminController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/AdminController.cs:12)

---

## 4. Dashboard

Base route:

- `/api/dashboard`

Endpoints:

- `GET /api/dashboard/summary`
  - Workforce summary, pending approvals, workflows, compliance counts

- `GET /api/dashboard/headcount-by-department`
  - Department headcount chart data

- `GET /api/dashboard/gender-distribution`
  - Gender chart data

- `GET /api/dashboard/nationality-distribution`
  - Nationality chart data

- `GET /api/dashboard/recent-activity`
  - Activity feed

- `GET /api/dashboard/attendance-trend`
  - Attendance trend data

- `GET /api/dashboard/compliance-alerts`
  - Compliance warnings/alerts

- `GET /api/dashboard/upcoming-probations`
  - Upcoming probation events

Key file:

- [DashboardController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/DashboardController.cs:13)

---

## 5. Users

Base route:

- `/api/users`

Endpoints:

- `GET /api/users`
  - List users in tenant

- `POST /api/users`
  - Create new user

- `PATCH /api/users/{id}/toggle-active`
  - Activate/deactivate user

- `PATCH /api/users/{id}/reset-password`
  - Reset user password

Key file:

- [UsersController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/UsersController.cs:13)

---

## 6. Employees

Base route:

- `/api/employees`

Endpoints:

- `GET /api/employees`
  - List employees
  - Supports employee browsing/searching from HR/payroll side

- `GET /api/employees/{id}`
  - Employee profile

- `POST /api/employees`
  - Create employee

- `PUT /api/employees/{id}`
  - Update employee

- `DELETE /api/employees/{id}`
  - Soft-delete/deactivate employee

- `GET /api/employees/{id}/documents`
  - Employee documents

- `GET /api/employees/{id}/assets`
  - Employee assigned assets

- `GET /api/employees/{id}/disciplinary`
  - Employee disciplinary records

- `GET /api/employees/{id}/payslips`
  - Employee payslips

Key file:

- [EmployeesController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/EmployeesController.cs:14)

Related supporting endpoints:

- `GET /api/departments`
- `POST /api/departments`
- `PUT /api/departments/{id}`
- `DELETE /api/departments/{id}`

- `GET /api/job-titles`
- `POST /api/job-titles`
- `PUT /api/job-titles/{id}`

Files:

- [DepartmentsController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/DepartmentsController.cs:13)
- [JobTitlesController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/JobTitlesController.cs:13)

---

## 7. Lookups and Reference Data

Base route:

- `/api/lookups`

Endpoints:

- `GET /api/lookups/nationalities`
- `GET /api/lookups/governorates`
- `GET /api/lookups/cities`
- `GET /api/lookups/violation-types`
- `GET /api/lookups/asset-categories`
- `GET /api/lookups/document-types`
- `GET /api/lookups/banks`
- `GET /api/lookups/leave-types`

Separate bank controller:

- `GET /api/banks`

Files:

- [LookupsController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/LookupsController.cs:9)
- [BanksController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/BanksController.cs:10)

---

## 8. Attendance

Base route:

- `/api/attendance`

Endpoints:

- `GET /api/attendance/dashboard`
  - Attendance dashboard

- `GET /api/attendance`
  - Attendance list/records

- `POST /api/attendance/clock-in`
  - Employee clock in

- `POST /api/attendance/clock-out`
  - Employee clock out

- `POST /api/attendance/manual`
  - Manual attendance entry

- `GET /api/attendance/summary`
  - Summary data

- `GET /api/attendance/reports`
  - Report dataset

- `GET /api/attendance/map`
  - Map/location-related attendance data

- `GET /api/attendance/requests`
  - Attendance adjustment requests

- `POST /api/attendance/requests`
  - Create attendance request

- `PUT /api/attendance/requests/{id}/approve`
  - Approve attendance request

- `PUT /api/attendance/requests/{id}/reject`
  - Reject attendance request

- `GET /api/attendance/locations`
  - Work locations

- `POST /api/attendance/locations`
  - Create work location

- `DELETE /api/attendance/locations/{id}`
  - Delete work location

Key file:

- [AttendanceController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/AttendanceController.cs:14)

---

## 9. Shifts

Base route:

- `/api/shifts`

Endpoints:

- `GET /api/shifts/templates`
- `GET /api/shifts/resolve/{employeeId}/{dateStr}`
- `GET /api/shifts`
- `GET /api/shifts/{id}`
- `POST /api/shifts`
- `PUT /api/shifts/{id}`
- `DELETE /api/shifts/{id}`

Assignments:

- `GET /api/shifts/assignments`
- `POST /api/shifts/assignments`
- `DELETE /api/shifts/assignments/{id}`

Rotations:

- `GET /api/shifts/rotations`
- `POST /api/shifts/rotations`
- `PUT /api/shifts/rotations/{id}`
- `DELETE /api/shifts/rotations/{id}`

Exceptions:

- `GET /api/shifts/exceptions`
- `POST /api/shifts/exceptions`
- `DELETE /api/shifts/exceptions/{id}`

Schedules:

- `GET /api/shifts/schedule`

Key file:

- [ShiftController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/ShiftController.cs:13)

---

## 10. Leave

Base route:

- `/api/leave`

Endpoints:

- `GET /api/leave/types`
  - Leave types

- `GET /api/leave/requests`
  - Leave requests list

- `POST /api/leave/requests`
  - Create leave request

- `PUT /api/leave/requests/{id}/approve`
  - Approve leave request

- `PUT /api/leave/requests/{id}/reject`
  - Reject leave request

- `POST /api/leave/requests/{id}/cancel`
  - Cancel leave request

- `GET /api/leave/balances`
  - Current user/tenant leave balances

- `GET /api/leave/balances/{employeeId}`
  - Leave balances for a specific employee

Key file:

- [LeaveController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/LeaveController.cs:14)

---

## 11. Overtime

Base route:

- `/api/overtime`

Endpoints:

- `GET /api/overtime/dashboard`
- `GET /api/overtime/log`
- `POST /api/overtime/calculate`
- `POST /api/overtime/manual`

Overtime records:

- `PUT /api/overtime/records/{id}/approve`
- `PUT /api/overtime/records/{id}/reject`

Overtime requests:

- `GET /api/overtime/requests`
- `POST /api/overtime/requests`
- `PUT /api/overtime/requests/{id}/approve`
- `PUT /api/overtime/requests/{id}/reject`

Reports/rules:

- `GET /api/overtime/reports`
- `GET /api/overtime/payroll-summary`
- `GET /api/overtime/rules`
- `PUT /api/overtime/rules`

Key file:

- [OvertimeController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/OvertimeController.cs:14)

---

## 12. Payroll

Base route:

- `/api/payroll`

Endpoints:

- `GET /api/payroll/runs`
  - List payroll runs

- `POST /api/payroll/runs`
  - Create payroll run

- `GET /api/payroll/runs/{id}/payslips`
  - Payslips for a payroll run

- `GET /api/payroll/slips/my`
  - Current employee payslips

- `GET /api/payroll/slips/{id}`
  - Specific payslip details

- `POST /api/payroll/runs/{id}/approve`
  - Approve payroll run

Key file:

- [PayrollController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/PayrollController.cs:14)

---

## 13. Salary Advances

Base route:

- `/api/salary-advances`

Endpoints:

- `GET /api/salary-advances`
  - List salary advances
  - Employee sees own requests
  - HR/payroll/admin sees tenant requests based on role logic
  - Supports query:
    - `status`

- `POST /api/salary-advances`
  - Create new salary advance request
  - Employee submission is supported directly from UI
  - Request body supports:
    - `employeeId`
    - `amount`
    - `reason`
    - `repaymentMethod`
    - `notes`

- `PUT /api/salary-advances/{id}/approve`
  - Approve advance request
  - Body supports:
    - `approvedAmount`
    - `repaymentMethod`
    - `repaymentPlan`
    - `notes`
  - Backend roles: `superadmin`, `hradmin`

- `PUT /api/salary-advances/{id}/reject`
  - Reject advance request
  - Body supports:
    - `reason`
    - `notes`
  - Backend roles: `superadmin`, `hradmin`

Returned data now includes:

- `requestedAmount`
- `approvedAmount`
- `repaymentMethod`
- `repaymentPlan`
- `remainingBalance`
- `requestNotes`
- `decisionNotes`
- `rejectionReason`

Key file:

- [SalaryAdvancesController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/SalaryAdvancesController.cs:13)

---

## 14. Documents

Base route:

- `/api/documents`

Endpoints:

- `GET /api/documents`
- `GET /api/documents/{id}`
- `POST /api/documents`
- `PUT /api/documents/{id}`
- `DELETE /api/documents/{id}`
- `GET /api/documents/expiring`

Key file:

- [DocumentsController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/DocumentsController.cs:12)

---

## 15. Assets

Base route:

- `/api/assets`

Endpoints:

- `GET /api/assets`
- `GET /api/assets/{id}`
- `POST /api/assets`
- `PUT /api/assets/{id}`
- `POST /api/assets/{id}/assign`
- `POST /api/assets/{id}/return`
- `DELETE /api/assets/{id}`

Key file:

- [AssetsController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/AssetsController.cs:12)

---

## 16. Compliance

Base route:

- `/api/compliance`

Endpoints:

- `GET /api/compliance/badge-status`
- `GET /api/compliance/overview`
- `GET /api/compliance/work-permits`
- `GET /api/compliance/ssc-status`
- `PUT /api/compliance/employees/{empId}/work-permit`
- `PUT /api/compliance/employees/{empId}/health-certificate`
- `PUT /api/compliance/employees/{empId}/ssc`

Key file:

- [ComplianceController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/ComplianceController.cs:11)

---

## 17. Pre-Employment

Base route:

- `/api/pre-employment`

Endpoints:

- `GET /api/pre-employment`
- `GET /api/pre-employment/{id}`
- `POST /api/pre-employment`
- `PUT /api/pre-employment/{id}/evaluate`
- `PUT /api/pre-employment/{id}/ssc-register`

Key file:

- [PreEmploymentController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/PreEmploymentController.cs:12)

---

## 18. Disciplinary

Base route:

- `/api/disciplinary`

Endpoints:

- `GET /api/disciplinary`
- `GET /api/disciplinary/{id}`
- `GET /api/disciplinary/stats`
- `POST /api/disciplinary`
- `PUT /api/disciplinary/{id}/status`
- `PUT /api/disciplinary/{id}/investigation`
- `PUT /api/disciplinary/{id}/decision`
- `PUT /api/disciplinary/{id}/close`
- `PUT /api/disciplinary/{id}/acknowledge`
- `PUT /api/disciplinary/{id}/cancel`
- `GET /api/disciplinary/employee/{empId}/history`

Violation type management:

- `GET /api/disciplinary/violations`
- `POST /api/disciplinary/violations`
- `PUT /api/disciplinary/violations/{vid}`
- `PUT /api/disciplinary/violations/{vid}/toggle`

Key file:

- [DisciplinaryController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/DisciplinaryController.cs:12)

---

## 19. Resignations and Clearance

### Resignations

Base route:

- `/api/resignations`

Endpoints:

- `GET /api/resignations/stats`
- `GET /api/resignations`
- `GET /api/resignations/{id}`
- `POST /api/resignations`
- `PUT /api/resignations/{id}/approve`
- `PUT /api/resignations/{id}/reject`
- `PUT /api/resignations/{id}/start-clearance`
- `PUT /api/resignations/{id}/clearance`
- `PUT /api/resignations/{id}/exit-interview`
- `PUT /api/resignations/{id}/settlement`
- `PUT /api/resignations/{id}/complete`
- `PUT /api/resignations/{id}/acknowledge`

Key file:

- [ResignationController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/ResignationController.cs:12)

### Clearance

Base route:

- `/api/clearance`

Endpoints:

- `GET /api/clearance`
- `GET /api/clearance/{id}`
- `POST /api/clearance`
- `PUT /api/clearance/{id}`
- `GET /api/clearance/calculate-eosb/{employeeId}`

Key file:

- [ClearanceController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/ClearanceController.cs:13)

---

## 20. Probation

Base route:

- `/api/probation`

Endpoints:

- `GET /api/probation/evaluations`
- `GET /api/probation/evaluations/{id}`
- `POST /api/probation/evaluations`
- `PUT /api/probation/evaluations/{id}`
- `DELETE /api/probation/evaluations/{id}`
- `GET /api/probation/alerts`

Key file:

- [ProbationController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/ProbationController.cs:13)

---

## 21. Public Holidays

Base route:

- `/api/public-holidays`

Endpoints:

- `GET /api/public-holidays`
- `GET /api/public-holidays/{id}`
- `POST /api/public-holidays`
- `PUT /api/public-holidays/{id}`
- `DELETE /api/public-holidays/{id}`
- `GET /api/public-holidays/upcoming`
- `POST /api/public-holidays/generate-recurring`
- `GET /api/public-holidays/attendance-check`
- `GET /api/public-holidays/reports`

Key file:

- [PublicHolidaysController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/PublicHolidaysController.cs:13)

---

## 22. Forms

Base route:

- `/api/forms`

Endpoints:

- `GET /api/forms`
- `GET /api/forms/{id}`
- `POST /api/forms`
- `PUT /api/forms/{id}`
- `DELETE /api/forms/{id}`

Helper endpoints:

- `GET /api/forms/employee-data/{employeeId}`
- `GET /api/forms/leave-balance/{employeeId}`
- `GET /api/forms/company-info`

Key file:

- [FormsController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/FormsController.cs:12)

---

## 23. Reports

Base route:

- `/api/reports`

Endpoints:

- `GET /api/reports/headcount`
- `GET /api/reports/payroll-summary`
- `GET /api/reports/leave-summary`
- `GET /api/reports/attendance-summary`
- `GET /api/reports/compliance-summary`
- `GET /api/reports/ssc-contributions`
- `GET /api/reports/disciplinary-summary`

Key file:

- [ReportsController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/ReportsController.cs:11)

---

## 24. Configuration

Base route:

- `/api/config`

Endpoints:

- `GET /api/config`
- `GET /api/config/{key}`
- `PUT /api/config/{key}`
- `PATCH /api/config/bulk`

Key file:

- [ConfigController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/ConfigController.cs:12)

---

## 25. Notifications

Base route:

- `/api/notifications`

Endpoints:

- `GET /api/notifications`
- `POST /api/notifications/{id}/read`

Key file:

- [NotificationsController.cs](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-api/Controllers/NotificationsController.cs:11)

---

## 26. Notes and Mismatches to Track

Important implementation notes:

- Frontend page visibility for `advances` includes:
  - `hradmin`
  - `payrolladmin`
  - `employee`
- Backend approval endpoints for salary advances currently allow:
  - `superadmin`
  - `hradmin`

That means:

- `payrolladmin` can access the advances screen
- but cannot approve/reject through backend API

This is a real cross-layer mismatch and should be kept in mind if behavior looks inconsistent.

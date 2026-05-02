# Role Matrix

## Scope

This document describes authorization and visibility for the **primary Angular/.NET/MySQL system**.

Primary sources:

- [app.routes.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/app.routes.ts:1)
- [role-access.service.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/core/services/role-access.service.ts:1)
- backend controller `[Authorize]` attributes

Roles:

- `superadmin`
- `hradmin`
- `payrolladmin`
- `manager`
- `employee`
- `recruiter`

Important note:

- Frontend route access and sidebar visibility come from the Angular access layer.
- Backend action enforcement comes from ASP.NET `[Authorize(Roles = ...)]`.
- These two layers are not perfectly identical in all cases.

---

## 1. Page Access Matrix

Legend:

- `Y` = route/page allowed
- `-` = not allowed

| Page | superadmin | hradmin | payrolladmin | manager | employee | recruiter |
|---|---|---:|---:|---:|---:|---:|
| dashboard | Y | Y | Y | Y | Y | Y |
| superadmin | Y | - | - | - | - | - |
| employees | - | Y | Y | - | - | - |
| pre-employment | - | Y | - | - | - | Y |
| disciplinary | - | Y | - | Y | - | - |
| resignations | - | Y | - | - | - | - |
| clearance | - | Y | - | - | - | - |
| shifts | - | Y | - | Y | - | - |
| attendance | - | Y | - | Y | Y | Y |
| leave | - | Y | - | Y | Y | Y |
| overtime | - | Y | - | Y | Y | Y |
| payroll | - | - | Y | - | Y | Y |
| compliance | - | Y | - | - | - | - |
| documents | - | Y | - | - | Y | - |
| assets | - | Y | - | - | - | - |
| advances | - | Y | Y | - | Y | - |
| holidays | - | Y | Y | Y | Y | Y |
| reports | Y | Y | Y | - | - | - |
| users | Y | Y | - | - | - | - |
| settings | Y | Y | - | - | - | - |
| forms | - | Y | Y | Y | Y | Y |

Source:

- `SCREEN_ACCESS` in [role-access.service.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/core/services/role-access.service.ts:7)

---

## 2. Sidebar Navigation Matrix

This section reflects actual menu visibility in the Angular sidebar/nav definitions.

### 2.1 Superadmin

Visible navigation:

- Dashboard
- Company Management
- User Management
- System Settings
- Platform Reports

Source:

- `PLATFORM_NAV`

### 2.2 HR Admin

Visible groups and pages:

- Overview
  - Dashboard
- Employee Management
  - Employees
  - Pre-Employment
  - Disciplinary
  - Resignations
  - Clearance
- Time & Attendance
  - Shifts
  - Attendance
  - Leave
  - Overtime
  - Holidays
- Compliance & Assets
  - Compliance
  - Documents
  - Assets
- Finance
  - Salary Advances
- Forms & Documents
  - Forms
- Administration
  - Reports
  - Users
  - Settings

### 2.3 Payroll Admin

Visible groups and pages:

- Overview
  - Dashboard
- Payroll & Payments
  - Payroll
  - Salary Advances
- Supporting Data
  - Employees
  - Holidays
  - Reports
- Forms
  - Forms

### 2.4 Manager

Visible groups and pages:

- Overview
  - Dashboard
- Team Management
  - Disciplinary
  - Shifts
  - Attendance
  - Leave
  - Overtime
  - Holidays
- Forms
  - Forms

### 2.5 Employee

Visible groups and pages:

- Overview
  - Dashboard
- Self Service
  - Attendance
  - Leave
  - Overtime
  - Advances
  - Payroll
  - Documents
  - Holidays
- Forms
  - Forms

Important:

- `Advances` was added recently to `EMPLOYEE_NAV`, so employees now see the salary advances tab in navigation.

### 2.6 Recruiter

Visible groups and pages:

- Overview
  - Dashboard
- Recruitment
  - Pre-Employment
- My Services
  - Attendance
  - Leave
  - Payroll
  - Holidays
- Forms
  - Forms

---

## 3. Action Access Matrix

This section reflects frontend button/action visibility from `ACTION_ACCESS`.

Legend:

- `Y` = action available in frontend access layer
- `-` = not available

| Action | superadmin | hradmin | payrolladmin | manager | employee | recruiter |
|---|---:|---:|---:|---:|---:|---:|
| employee:create | - | Y | - | - | - | - |
| employee:edit | - | Y | - | - | - | - |
| employee:deactivate | - | Y | - | - | - | - |
| employee:viewSalary | - | Y | Y | - | - | - |
| employee:viewSSC | - | Y | Y | - | - | - |
| employee:viewBank | - | Y | Y | - | - | - |
| leave:approve | - | Y | - | Y | - | - |
| leave:reject | - | Y | - | Y | - | - |
| overtime:approve | - | Y | - | Y | - | - |
| payroll:run | - | - | Y | - | - | - |
| payroll:close | - | - | Y | - | - | - |
| payroll:viewAll | - | Y | Y | - | - | - |
| advance:approve | - | Y | Y | - | - | - |
| disciplinary:create | - | Y | - | - | - | - |
| disciplinary:approve | - | Y | - | - | - | - |
| resignation:process | - | Y | - | - | - | - |
| clearance:manage | - | Y | - | - | - | - |
| document:upload | - | Y | - | - | - | - |
| document:delete | - | Y | - | - | - | - |
| asset:assign | - | Y | - | - | - | - |
| asset:return | - | Y | - | - | - | - |
| user:create | Y | Y | - | - | - | - |
| user:edit | Y | Y | - | - | - | - |
| settings:edit | Y | Y | - | - | - | - |
| compliance:edit | - | Y | - | - | - | - |

Source:

- `ACTION_ACCESS` in [role-access.service.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/core/services/role-access.service.ts:250)

---

## 4. Widget Visibility Matrix

These are dashboard/widget-level frontend visibility rules.

| Widget | superadmin | hradmin | payrolladmin | manager | employee | recruiter |
|---|---:|---:|---:|---:|---:|---:|
| workforce | Y | Y | - | - | - | - |
| pending-approvals | - | Y | - | Y | - | - |
| hr-workflows | - | Y | - | - | - | - |
| compliance | - | Y | - | - | - | - |
| dept-chart | Y | Y | - | - | - | - |
| quick-actions | - | Y | Y | Y | Y | Y |
| payroll-summary | - | - | Y | - | - | - |
| team-summary | - | - | - | Y | - | - |
| ess-summary | - | - | - | - | Y | Y |
| recruitment-summary | - | - | - | - | - | Y |
| platform-stats | Y | - | - | - | - | - |

Source:

- `canSeeWidget(...)` in [role-access.service.ts](/C:/Users/w10/Downloads/ZenHR-Full-System/ZenHR-Full-System/artifacts/zenjo-ng/src/app/core/services/role-access.service.ts:290)

---

## 5. Screen-by-Screen Detail

### Dashboard

Allowed roles:

- superadmin
- hradmin
- payrolladmin
- manager
- employee
- recruiter

Typical purpose by role:

- superadmin: platform stats and global overview
- hradmin: HR operations overview
- payrolladmin: payroll operational view
- manager: team view
- employee/recruiter: self-service summary

### Employees

Allowed roles:

- hradmin
- payrolladmin

Typical actions:

- HR can create/edit/deactivate
- Payroll can view salary-sensitive data

### Pre-Employment

Allowed roles:

- hradmin
- recruiter

Typical actions:

- recruiter works on incoming recruitment flow
- hradmin manages approval and conversion

### Disciplinary

Allowed roles:

- hradmin
- manager

Action nuance:

- frontend action map gives create/approve to HR only
- managers can still access the page itself

### Resignations

Allowed roles:

- hradmin only

### Clearance

Allowed roles:

- hradmin only

### Shifts

Allowed roles:

- hradmin
- manager

### Attendance

Allowed roles:

- hradmin
- manager
- employee
- recruiter

### Leave

Allowed roles:

- hradmin
- manager
- employee
- recruiter

Approval actions:

- hradmin
- manager

### Overtime

Allowed roles:

- hradmin
- manager
- employee
- recruiter

Approval action:

- hradmin
- manager

### Payroll

Allowed roles:

- payrolladmin
- employee
- recruiter

Action nuance:

- payroll creation/closure actions belong only to payrolladmin
- employee/recruiter generally see their payslip/self-service content

### Compliance

Allowed roles:

- hradmin only

### Documents

Allowed roles:

- hradmin
- employee

Action nuance:

- upload/delete buttons are currently HR-only in action map
- employee access is mainly for viewing own documents

### Assets

Allowed roles:

- hradmin only

### Advances

Allowed roles:

- hradmin
- payrolladmin
- employee

Behavior by role:

- employee: self-service request submission and history
- hradmin: management, details, approve/reject
- payrolladmin: page visible from frontend route/nav

Critical mismatch:

- frontend action map says `advance:approve` is allowed for:
  - hradmin
  - payrolladmin
- backend approval endpoints currently allow only:
  - superadmin
  - hradmin

That means payrolladmin may see approval-related UX unless the component itself suppresses it, but backend will reject the action.

### Holidays

Allowed roles:

- hradmin
- payrolladmin
- manager
- employee
- recruiter

### Reports

Allowed roles:

- superadmin
- hradmin
- payrolladmin

### Users

Allowed roles:

- superadmin
- hradmin

### Settings

Allowed roles:

- superadmin
- hradmin

### Forms

Allowed roles:

- hradmin
- payrolladmin
- manager
- employee
- recruiter

---

## 6. Frontend vs Backend Mismatch Audit

These are the most important mismatches visible from the current codebase.

### Salary Advances Approval

Frontend:

- `advance:approve`
  - `hradmin`
  - `payrolladmin`

Backend:

- `PUT /api/salary-advances/{id}/approve`
  - `superadmin`
  - `hradmin`

- `PUT /api/salary-advances/{id}/reject`
  - `superadmin`
  - `hradmin`

Impact:

- payrolladmin can access the page
- but approval/rejection is backend-blocked

### Employees Page vs Action Split

Frontend route:

- `employees`
  - `hradmin`
  - `payrolladmin`

Actions:

- create/edit/deactivate only for `hradmin`
- salary/SSC/bank viewing for `hradmin` and `payrolladmin`

This split is intentional and makes payroll effectively read-only on employee management.

### Manager Page Access vs Limited Actions

Managers can access several workflow pages:

- disciplinary
- shifts
- attendance
- leave
- overtime

But action permissions remain more limited than page visibility in several cases.

This means some manager pages are intended as oversight/review screens, not full admin consoles.

---

## 7. Practical Summary by Role

### Superadmin

Strongest platform-level privileges:

- platform dashboard
- company management
- users
- settings
- reports
- backend-only sensitive operations such as some impersonation and restricted admin actions

### HR Admin

Main business administrator of the tenant:

- full employee operations
- HR workflows
- discipline
- resignations
- clearance
- compliance
- documents
- assets
- salary advances
- forms
- reports
- users/settings inside tenant scope

### Payroll Admin

Focused finance/payroll role:

- payroll
- reports
- holidays
- employee read access
- advances page access

But not a full HR operations role.

### Manager

Team workflow role:

- team attendance
- team leave
- team overtime
- team shift views
- disciplinary visibility

### Employee

Self-service role:

- dashboard
- attendance
- leave
- overtime
- advances
- payroll
- documents
- holidays
- forms

### Recruiter

Recruitment + limited self-service role:

- dashboard
- pre-employment
- attendance
- leave
- payroll
- holidays
- forms

---

## 8. Recommended Governance Rule

When changing permissions in this project, update all three layers together:

1. `app.routes.ts`
2. `role-access.service.ts`
3. backend controller authorization attributes

If only one or two layers are updated, the UI and API will drift out of sync.

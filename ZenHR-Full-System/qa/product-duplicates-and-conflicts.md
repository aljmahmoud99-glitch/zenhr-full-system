# Product Duplicates And Conflicts

Generated: 2026-05-13

## Duplicate Screens

| Domain | Old screen | New screen | Conflict | Keep | Deprecate or merge |
|---|---|---|---|---|---|
| Leave | `/app/leave` | `/app/leave-management` | Both expose leave requests, approvals, balances, and policies. Old screen has mojibake Arabic. | `/app/leave-management` | Convert `/app/leave` into employee self-service wrapper or redirect. |
| Notifications | Header/legacy notification UI | `/app/notifications` | Both read `notifications` but with different endpoints and shapes. | `/app/notifications` plus compact header unread list | Keep `/api/notifications` as compatibility, route UI to center API. |
| Payroll | `/app/payroll/runs`, `/app/payroll/slips` | `/app/payroll-attendance` | Payroll-attendance has adjustments/violations/audit, but canonical payroll runs do not consume all Bundle A data. | Payroll runs/slips as canonical | Merge Bundle A adjustments and impacts into payroll run service. |
| Salary components | `/app/payroll/salary-components` | `/app/salary-components` | Two routes for similar salary component management. | One payroll-scoped route | Redirect duplicate route. |
| Attendance/shifts | `/app/attendance`, `/app/shifts` | Payroll-attendance shift scheduler | Separate scheduling and attendance intelligence surfaces. | Keep `/app/attendance` for daily operations and `/app/payroll-attendance` for payroll impact | Rename and separate clearly or merge tabs. |
| Compliance | `/app/compliance` | `/app/compliance-contracts` | Compliance records and contract compliance are separate systems. | Both for now, with renamed responsibilities | Integrate alerts into one compliance dashboard. |
| Documents/forms | `/app/documents`, `/app/forms` | `/app/documents-reporting` | Legacy documents/forms and enterprise document/form/reporting tables coexist. | `/app/documents-reporting` | Migrate legacy records or keep read-only compatibility. |
| Reports | `/app/reports` | `/app/documents-reporting` reports/export center | Legacy report endpoints and enterprise report definitions overlap. | Enterprise reporting for saved reports/exports | Keep legacy reports only as raw operational reports until migrated. |
| Workflows | `/app/workflows` | `/app/performance-workflows`, leave-management approvals, recruitment approvals, payroll approvals | Many workflow engines with separate approval tables. | `/app/workflows` for employee actions only, domain-specific approval centers for domain approvals | Build a unified approval inbox later, not multiple unrelated centers. |

## Duplicate APIs

| Domain | Old API | New API | Observed issue |
|---|---|---|---|
| Leave requests | `/api/leave/requests`, `/api/leave/me/requests` | `/api/leave/management/requests` | Both write `leave_requests` but use different leave type tables and approval semantics. |
| Leave types | `/api/leave/types` | `/api/leave/management/types` | Old uses `leave_types`; new uses `enterprise_leave_types`. |
| Leave balances | `/api/leave/balances`, `/api/leave/me/balances` | `/api/leave/management/balances` | Old and new balances are not fully unified. |
| Notifications | `/api/notifications` | `/api/notifications/center` | Same table, different pagination and read/unread/archive semantics. |
| Workflows | `/api/workflow/requests/:id`, `/api/workflows/pending` | `/api/performance/workflow-instances`, leave/recruitment/payroll-specific approval routes | No single workflow source. |
| Documents | `/api/documents` | `/api/document-reporting/documents` | Different tables. |
| Forms | legacy `/api/forms` usage | `/api/document-reporting/form-templates`, `/form-submissions` | Different builders/submissions. |
| Payroll adjustments | salary component APIs and salary advances | `/api/payroll-adjustments/*` | Bundle A adjustments are not consumed by canonical payroll run calculation. |
| Reports/exports | `/api/reports/*`, `/api/export/:reportType` | `/api/document-reporting/exports`, `/api/production/exports/:dataset` | Mixed real binary exports, export job records, and legacy report JSON. |

## Table Conflicts

| Area | Old tables | New tables | Conflict |
|---|---|---|---|
| Leave types/policies | `leave_types`, `leave_policies`, `leave_balances` | `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_payroll_impacts` | One shared `leave_requests` table points at two different leave type systems. |
| Notifications preferences | `notification_preferences` in `admin-v2.sql` | `notification_preferences` in `phase-d-leave-notifications.sql` | Same table name defined twice. `CREATE TABLE IF NOT EXISTS` can leave missing Phase D columns if Admin V2 version was applied first unless later ALTERs exist. |
| Documents | `documents`, `file_objects` | `enterprise_documents`, `enterprise_pdf_templates`, `enterprise_export_jobs` | Attachments are not consistently represented by one document record. |
| Compliance | `compliance_records` | `employee_contracts`, `contract_required_documents` | Compliance dashboard and contracts dashboard are not the same compliance model. |
| Workflows | `employee_actions`, `workflow_actions` | `performance_workflow_*`, `leave_request_approval_steps`, `recruitment_request_approvers`, `payroll_adjustment_approvals` | Multiple approval/history models. |
| Payroll impacts | `payslips`, `overtime_requests`, `salary_advances` | `payroll_adjustments`, `attendance_payroll_impacts`, `leave_payroll_impacts` | Canonical payroll run consumes only some impact tables. |

## Keep/Deprecate Plan

1. Keep `employees`, `users`, `payroll_runs`, `payslips`, `attendance_records`, `job_descriptions`, and `notifications` as canonical base tables.
2. Keep enterprise feature tables added after Phase 1 only when they are connected to a visible source-of-truth screen.
3. Deprecate UI duplicates first through navigation cleanup, then API aliases, then data migration.
4. Do not delete legacy tables until compatibility migration and archival exports exist.

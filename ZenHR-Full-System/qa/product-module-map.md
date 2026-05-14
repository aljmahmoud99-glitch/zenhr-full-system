# Product Module Map

Generated: 2026-05-13

This map is based on code inspection of Angular routes/components, backend route registrations, migrations/schema files, and a narrow live API smoke captured in `qa/product-integrity-results.json`.

## Module Inventory

| Module | Screens | Main APIs | Main Tables | Source of truth | Status |
|---|---|---|---|---|---|
| Authentication | `/login`, `/change-password`, `/register` | `/api/auth/login` | `users`, `roles`, `user_permission_overrides` | `users.role` plus role permissions | Working, needs RBAC cleanup |
| Admin platform | `/admin/*` | `/api/admin/*`, `/api/system-admin/*` style routes in monolith | `platform_plans`, `company_subscriptions`, `company_modules`, `admin_audit_logs` | Admin V2 tables | Working but monolithic |
| Employees | `/app/employees`, `/app/employees/:id` | `/api/employees`, profile routes | `employees`, `users`, `departments`, `org_nodes` | `employees` | Working, many modules depend on it |
| HR Master Data | `/app/hr-master-data` | `/api/{master-module}` | `responsibility_groups`, `responsibilities`, `job_grades`, `skills`, `languages`, etc. | Phase 1 tables | Working |
| Job Profiles | `/app/job-descriptions` | `/api/job-profiles`, `/api/job-descriptions`, `/api/job-titles` | `job_descriptions`, job profile bridge tables | `job_descriptions` extended by Phase 2 | Working but legacy names remain |
| Recruitment | `/app/recruitment` | `/api/recruitment/*` | `recruitment_requests`, `candidates`, `interviews`, `job_offers`, `onboarding_batches` | Phase 3 tables | Partially connected |
| Leave legacy | `/app/leave` | `/api/leave/requests`, `/api/leave/types`, `/api/leave/policies`, `/api/leave/balances`, `/api/leave/me/*` | `leave_requests`, `leave_types`, `leave_policies`, `leave_balances` | Legacy leave tables | Duplicated, Arabic corrupted |
| Leave management | `/app/leave-management` | `/api/leave/management/*` | `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_payroll_impacts`, extended `leave_requests` | Phase D enterprise leave tables plus `leave_requests` | Working but coexists with legacy leave |
| Notifications legacy | Header notification center, `/api/notifications` users | `/api/notifications`, `/api/notifications/preferences` | `notifications`, `notification_preferences` | `notifications` | Working |
| Notifications center | `/app/notifications` | `/api/notifications/center`, `/unread`, `/archive`, `/delivery-logs`, reminders | `notifications`, `notification_preferences`, `notification_delivery_logs` | Same `notifications` table | Duplicated API surface |
| Attendance live | `/app/attendance` | `/api/attendance`, `/api/attendance/clock-in`, `/clock-out`, `/summary`, `/map`, `/locations` | `attendance_records`, `attendance_corrections` | `attendance_records` | Working with biometric enforcement on clock-in/out |
| Biometric devices | `/app/attendance` HR and employee sections | `/api/attendance/biometric/*` | `attendance_trusted_devices`, `attendance_biometric_challenges`, `attendance_biometric_audit_logs` | Phase C tables | Working, but correction approvals can still create attendance records |
| Shifts | `/app/shifts`, `/app/payroll-attendance` | `/api/shifts`, `/api/shift-scheduler/*` | legacy shift data plus `attendance_shift_patterns`, `attendance_schedules` | Split legacy and Bundle A | Duplicated |
| Overtime legacy | `/app/overtime` | `/api/overtime`, `/api/overtime/reports`, `/api/overtime/rules` | `overtime_requests` and rule/config tables | Legacy overtime requests | Used by payroll run calculation |
| Payroll core | `/app/payroll/runs`, `/app/payroll/slips`, `/app/payroll/salary-components` | `/api/payroll/runs`, `/api/payroll/slips`, `/api/payroll/preview/:employeeId` | `payroll_runs`, `payslips`, `salary_components`, `employee_salary_components`, `salary_advances` | `PayrollRunService` | Working but incomplete integration |
| Payroll policies | `/app/payroll-policies` | `/api/payroll-policies/*` | `payroll_policies`, `payroll_employment_type_rules`, policy history tables | Phase 1 policy engine | Connected to payroll run and preview |
| Payroll attendance core | `/app/payroll-attendance` | `/api/payroll-adjustments/*`, `/api/payroll-attendance/dashboard`, `/api/attendance-intelligence/*`, `/api/payroll-audit/history` | `payroll_adjustments`, `attendance_violations`, `attendance_payroll_impacts`, `payroll_audit_events` | Bundle A tables | API/UI working, not canonical payroll source |
| Employee actions | `/app/employee-actions/*`, `/app/workflows` | `/api/employee-actions`, `/api/workflow/requests/:id`, `/api/workflows/pending` | `employee_actions`, `workflow_actions` | `employee_actions` | Real workflow with business side effects |
| Performance workflows | `/app/performance-workflows` | `/api/performance/*` | `performance_*` tables | Bundle B tables | Working in own domain |
| Compliance legacy | `/app/compliance` | `/api/compliance/*` | `compliance_records`, employee compliance fields | Legacy compliance records | Working, separate from contracts |
| Compliance contracts | `/app/compliance-contracts` | `/api/compliance-contracts/*` | `contract_types`, `employee_contracts`, `contract_required_documents`, `contract_attachments`, `contract_audit_logs` | Phase B tables | Working, only HR/superadmin |
| Documents legacy | `/app/documents` | `/api/documents` | `documents`, `file_objects` | Legacy documents | Working, separate from enterprise docs |
| Forms legacy | `/app/forms`, `/app/forms/:formId` | legacy form APIs | legacy/dynamic form records | Legacy forms | Duplicated with Bundle C |
| Documents/reporting | `/app/documents-reporting` | `/api/document-reporting/*`, `/api/production/exports/:dataset` | `enterprise_documents`, `enterprise_form_templates`, `enterprise_report_definitions`, export/print tables | Bundle C tables | Working, some PDF generation is HTML preview only |
| Public holidays | `/app/holidays` | holiday APIs | holiday tables/config | Legacy holiday module | Needs verification |
| Reports legacy | `/app/reports` | `/api/reports/*`, `/api/export/:reportType` | mixed source tables | Legacy reports | Duplicated with Bundle C |

## API Families By Age

| Age | API families |
|---|---|
| Legacy/base | `/api/employees`, `/api/attendance`, `/api/leave/*`, `/api/payroll/*`, `/api/overtime/*`, `/api/documents`, `/api/forms`, `/api/compliance`, `/api/reports/*` |
| Admin V2 | `/api/admin/*`, automation/background/email/file related APIs |
| Phase 1-3 | `/api/hr-master-data` style module routes, `/api/job-profiles`, `/api/recruitment/*` |
| Bundle A-C | `/api/payroll-adjustments/*`, `/api/payroll-attendance/*`, `/api/attendance-intelligence/*`, `/api/performance/*`, `/api/document-reporting/*` |
| Post-release | `/api/payroll-policies/*`, `/api/compliance-contracts/*`, `/api/attendance/biometric/*`, `/api/leave/management/*`, `/api/notifications/center` |

## Table Families By Age

| Age | Tables |
|---|---|
| Legacy/base | `employees`, `users`, `attendance_records`, `leave_requests`, `leave_types`, `leave_policies`, `leave_balances`, `payroll_runs`, `payslips`, `salary_components`, `documents`, `compliance_records`, `employee_actions` |
| Admin V2 | `notification_preferences`, `workflow_definitions`, `workflow_steps`, `workflow_actions`, `background_jobs`, `email_logs`, `file_objects` |
| Phase 1 HR master | `responsibility_groups`, `responsibilities`, `job_grades`, `skills`, `languages`, `experience_levels`, etc. |
| Phase 2 job profiles | `job_descriptions` extended fields, `job_profile_*` bridge tables |
| Phase 3 recruitment | `recruitment_requests`, `candidates`, `candidate_*`, `interviews`, `job_offers`, `onboarding_batches` |
| Bundle A | `payroll_adjustments`, `payroll_adjustment_types`, `attendance_shift_patterns`, `attendance_schedules`, `attendance_violations`, `attendance_payroll_impacts`, `payroll_audit_events` |
| Bundle B | `performance_rating_policies`, `performance_goals`, `performance_evaluations`, `performance_workflow_*`, `performance_promotion_recommendations` |
| Bundle C | `enterprise_documents`, `enterprise_form_templates`, `enterprise_form_submissions`, `enterprise_pdf_templates`, `enterprise_report_definitions`, `enterprise_export_jobs` |
| Post-release | `payroll_policies`, `contract_types`, `employee_contracts`, `attendance_trusted_devices`, `enterprise_leave_types`, `leave_request_approval_steps`, `notification_delivery_logs` |

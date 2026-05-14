# Full Duplicates / Source-of-Truth Map

Generated: 2026-05-13

## Leave

- Old screen/API/table: `/app/leave`, `/api/leave/*`, `leave_types`, `leave_policies`, `leave_balances`, `leave_requests`.
- New screen/API/table: `/app/leave-management`, `/api/leave/management/*`, `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_payroll_impacts`.
- Writes data: both write `leave_requests`; enterprise creates dedicated payroll impact rows.
- Payroll/reports use: payroll uses enterprise join path; legacy leave is unreliable.
- Users see: likely both on different UI routes.
- Canonical: `/app/leave-management` and enterprise leave should become canonical.
- Risk level: Critical.

## Payroll

- Old screen/API/table: `/app/payroll/runs`, `/app/payroll/slips`, `/api/payroll/*`, `payslips`, `payroll_runs`.
- New screen/API/table: `/app/payroll-attendance`, `/api/payroll-adjustments/*`, `payroll_adjustments`, `attendance_payroll_impacts`, `payroll_audit_events`.
- Writes data: payroll adjustments write their own tables; payroll runs do not consume them.
- Payroll/reports use: canonical payroll run uses `overtime_requests`, `salary_advances`; adjustments are report-only.
- Users see: both payroll and payroll-attendance screens.
- Canonical: resume payroll run service as payroll truth, and align payroll-attendance as supporting intelligence.
- Risk level: High.

## Salary Components

- Old route/API: `/app/payroll/salary-components`, legacy salary component endpoints.
- New route/API: `/app/salary-components`, possibly `/api/salary-components`.
- Writes data: both can create/modify salary component metadata.
- Payroll/reports use: `salary_components` and `employee_salary_components` are canonical.
- Users see: duplicate UI surface.
- Canonical: one payroll component management route.
- Risk level: Medium.

## Attendance / Shifts / Overtime

- Old structures: `/app/attendance`, `/api/attendance/*`, `attendance_records`, `overtime_requests`.
- New structures: `/app/payroll-attendance`, `/api/attendance-intelligence/*`, `/api/shift-scheduler/*`, `attendance_shift_patterns`, `attendance_schedules`, `attendance_violations`, `attendance_payroll_impacts`.
- Writes data: live clocking writes `attendance_records`; Bundles A intelligence writes `attendance_payroll_impacts`.
- Payroll/reports use: payroll uses `overtime_requests`; attendance reports use `attendance_*` intelligence tables.
- Users see: separate daily attendance and payroll attendance surfaces.
- Canonical: `attendance_records` for attendance, payroll run service for actual pay.
- Risk level: High.

## Notifications

- Old API: `/api/notifications` and header list.
- New API: `/api/notifications/center`, `/api/notifications/preferences`, `/api/notifications/delivery-logs`.
- Writes data: same core `notifications` table.
- Payroll/reports use: not payroll, but notifications are used by workflow and leave.
- Users see: both header and center.
- Canonical: `/api/notifications/center` plus a single preferences shape.
- Risk level: Medium.

## Compliance / Contracts

- Old table/system: `/app/compliance`, `/api/compliance/*`, `compliance_records`.
- New table/system: `/app/compliance-contracts`, `/api/compliance-contracts/*`, `contract_types`, `employee_contracts`, `contract_required_documents`, `contract_attachments`.
- Writes data: both record compliance state, but not unified.
- Payroll/reports use: contracts may affect employment type, compliance reports use contract data.
- Users see: separate compliance and contract dashboards.
- Canonical: `employee_contracts` for contract lifecycle and `contract_required_documents` for compliance requirements.
- Risk level: Medium.

## Documents / Forms

- Old screens/APIs: `/app/documents`, `/app/forms`, `/api/documents`, legacy form endpoints.
- New screens/APIs: `/app/documents-reporting`, `/api/document-reporting/*`, `enterprise_documents`, `enterprise_form_templates`, `enterprise_form_submissions`.
- Writes data: both persist document records in separate tables.
- Payroll/reports use: enterprise reporting for exports; legacy documents may still feed some HR screens.
- Users see: possibly separate legacy and enterprise surfaces.
- Canonical: `enterprise_documents` and enterprise reporting.
- Risk level: Medium.

## Workflows

- Old engine: `/api/workflow/requests`, `employee_actions`, `workflow_actions`.
- New engines: `/api/workflows/pending`, `/api/performance/*`, `/api/payroll-adjustments/*`, `/api/leave/management/*`, `/api/recruitment/*`.
- Writes data: multiple workflow tables.
- Payroll/reports use: employee actions affect payroll; performance and leave workflows affect only domain records.
- Users see: separate approvals inbox, performance workflows, leave management approvals.
- Canonical: `employee_actions` for HR business changes; domain-specific flows remain separate but need a unified inbox.
- Risk level: High.

## Reports / Exports

- Old APIs: `/api/reports/*`, `/api/export/:reportType`.
- New APIs: `/api/document-reporting/exports`, `/api/production/exports/:dataset`.
- Writes data: new export jobs and report definitions.
- Payroll/reports use: enterprise exports should be canonical.
- Users see: legacy reports routes and new reporting center.
- Canonical: enterprise report definitions if they are complete.
- Risk level: Low/Medium.

## Recruitment vs Employee Handoff

- Old recruitment: `recruitment_requests`, `candidates`, `job_offers`.
- New handoff: conversion to `employees`, `users`, `onboarding_batches`.
- Writes data: recruitment conversion creates employee records but not contract/compliance records.
- Payroll/reports use: employee record is canonical, but contract/payroll metadata is incomplete.
- Users see: candidate pipeline and employee profile separately.
- Canonical: employee conversion should be the source-of-truth for hire completion.
- Risk level: Medium.

## Summary

This product has multiple duplicate domains. The highest-risk duplicates are leave, payroll attendance/adjustments, and workflow approval surfaces. The safest cleanup path is to declare a canonical API/table/screen for each domain and then migrate or deprecate duplicates.

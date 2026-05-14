# Full Product Conflict Audit Report

Generated: 2026-05-13

## Executive Summary

Product consistency status: **NO-GO**.

This system is not currently consistent enough for continued feature work without a dedicated cleanup phase. Multiple overlapping domains are live, but their source-of-truth data, approval models, and payroll integrations are not fully connected.

Top critical risks:
- Dual active leave systems with shared `leave_requests` and split leave type/policy models.
- Payroll run engine ignores Bundle A payroll adjustments and attendance-payroll impact tables.
- Attendance correction workflow can create `attendance_records` without biometric proof.
- Multiple workflow engines exist without a unified approval product; several approval paths bypass each other.
- Notifications and documents are split between legacy and enterprise APIs while sharing core persistence tables.

Top cleanup priorities:
1. Stabilize payroll run calculation and unify payroll impact sources.
2. Canonicalize enterprise leave lifecycle and stop direct legacy leave mutations.
3. Treat attendance corrections as audited exceptions and prevent silent biometric bypass.
4. Consolidate approval workflows into a single inbox/approval source, or explicitly isolate domain-specific approval products.
5. Align notification/document paths to one canonical API/table family.

---

## Critical Blockers

1. Payroll ignores Bundle A business inputs.
- Expected: payroll run consumes payroll adjustments, attendance payroll impacts, and installments.
- Actual: `PayrollRunService` uses only `overtime_requests`, `salary_advances`, and approved unpaid leave impact from `enterprise_leave_types`.
- Affected screens: `/app/payroll-attendance`, `/app/payroll/runs`, `/app/payroll/slips`.
- Affected APIs: `/api/payroll-adjustments/*`, `/api/attendance-intelligence/*`, `/api/payroll-attendance/*`.
- Affected tables: `payroll_adjustments`, `payroll_adjustment_installments`, `attendance_payroll_impacts`.
- Severity: Critical.
- Recommended fix: either integrate these tables into `PayrollRunService` or mark them as non-payroll data with a fail-safe warning.
- Corrupt payroll/business state: yes, because payroll totals can silently skip approved adjustments.

2. Dual leave flows with a single `leave_requests` table.
- Expected: one leave request model, one leave type/policy source, one payroll integration path.
- Actual: `/api/leave/*` legacy and `/api/leave/management/*` enterprise both create `leave_requests`; legacy uses `leave_types` and `leave_policies`, enterprise uses `enterprise_leave_types` and `leave_accrual_policies`.
- Affected screens: `/app/leave`, `/app/leave-management`.
- Affected APIs: `/api/leave/requests`, `/api/leave/me/requests`, `/api/leave/management/requests`.
- Affected tables: `leave_requests`, `leave_types`, `leave_policies`, `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_request_audit_logs`, `leave_payroll_impacts`.
- Severity: Critical.
- Recommended fix: make `/app/leave-management` canonical and block legacy leave creation or migrate requests immediately.
- Corrupt payroll/business state: yes, because unpaid leave deduction only tracks enterprise leave types.

3. Attendance correction path bypasses biometric proof.
- Expected: all attendance records should carry proof or be tagged as audited exceptions.
- Actual: approved correction requests can write `attendance_records` without biometric validation, while live clock-in/out enforces biometric.
- Affected screens: `/app/attendance`, correction request UI.
- Affected APIs: `/api/attendance/me/requests`, `/api/attendance/requests`, `/api/attendance/clock-in`, `/api/attendance/clock-out`.
- Affected tables: `attendance_records`, `attendance_corrections`, `attendance_trusted_devices`.
- Severity: High.
- Recommended fix: add proof metadata/audit flags for correction-created attendance and treat them as exception records.
- Corrupt payroll/business state: yes, for attendance-based payroll and compliance.

4. Performance promotion and recruitment conversion do not complete operational handoff.
- Expected: approved promotions create employee salary/job changes; candidate conversion creates contracts and compliance documents.
- Actual: performance approval updates only `performance_evaluations`/recommendations; candidate conversion creates `employees`/`users` but not `employee_contracts` or required compliance documents.
- Affected screens: `/app/performance-workflows`, `/app/recruitment`.
- Affected APIs: `/api/performance/*`, `/api/recruitment/candidates/:id/convert-to-employee`.
- Affected tables: `performance_promotion_recommendations`, `employee_actions`, `employee_contracts`, `contract_required_documents`, `enterprise_documents`.
- Severity: Medium.
- Recommended fix: link approved recommendations and conversion actions to canonical employee/payroll change workflows.
- Corrupt payroll/business state: moderate—can create divergence between HR action and payroll assignment.

5. Duplicate notification APIs with split semantics.
- Expected: one notification API surface backed by `notifications` and one preferences table.
- Actual: `/api/notifications`, `/api/notifications/center`, and `/api/notifications/preferences` coexist; preferences schema is defined by multiple migrations.
- Affected screens: header notification menu, `/app/notifications`.
- Affected APIs: `/api/notifications`, `/api/notifications/center`, `/api/notifications/preferences`, `/api/notifications/delivery-logs`.
- Affected tables: `notifications`, `notification_preferences`, `notification_delivery_logs`.
- Severity: Medium.
- Recommended fix: converge on `/api/notifications/center` and standardize preference shape.
- Corrupt payroll/business state: no direct corruption, but user trust and audit are impacted.

---

## Workflow Matrix

| Workflow | Trigger Screen | API | DB Tables | Approvers | Statuses | Final Effect | Notifications | Audit | Status |
|---|---|---|---|---|---|---|---|---|---|
| Leave request | `/app/leave`, `/app/leave-management` | `/api/leave/requests`, `/api/leave/management/requests` | `leave_requests`, `leave_request_approval_steps`, `leave_request_audit_logs`, `leave_payroll_impacts` | Manager, HRadmin, Superadmin | pending, manager_approved, approved, rejected, cancelled | Leave granted, payroll impact created, balance updated | yes | yes for enterprise, partial for legacy | duplicate/broken |
| Employee actions | `/app/employee-actions`, `/app/workflows` | `/api/workflow/requests`, `/api/workflow/requests/:id/approve` | `employee_actions`, `workflow_actions` | HRadmin, Payrolladmin, Manager | pending, approved, rejected, cancelled | employee status/salary/contract changes | yes | yes | working but siloed |
| Payroll adjustment | `/app/payroll-attendance` | `/api/payroll-adjustments`, `/api/payroll-adjustments/approvals` | `payroll_adjustments`, `payroll_adjustment_approvals`, `payroll_adjustment_types` | HRadmin, Payrolladmin | pending, approved, rejected, applied | adjustment created | yes | yes | working but not consumed |
| Attendance correction | `/app/attendance` | `/api/attendance/me/requests`, `/api/attendance/requests` | `attendance_corrections`, `attendance_records` | HRadmin, Manager | pending, approved, rejected | record correction applied | yes | limited | broken |
| Recruitment approval | `/app/recruitment` | `/api/recruitment/*`, `/api/recruitment/candidates/:id/convert-to-employee` | `recruitment_requests`, `candidates`, `job_offers`, `onboarding_batches` | Hiring manager, HRadmin | open, shortlisted, offer, accepted, converted | employee/user created | yes | yes | disconnected |
| Performance recommendation | `/app/performance-workflows` | `/api/performance/promotion-recommendations`, `/api/performance/workflows` | `performance_evaluations`, `performance_promotion_recommendations`, `performance_workflow_instances` | Manager, HRadmin | draft, submitted, pending, approved, rejected | evaluation approved, recommendation created | yes | yes | disconnected |
| Compliance/contracts | `/app/compliance-contracts`, `/app/compliance` | `/api/compliance-contracts/*`, `/api/compliance/*` | `employee_contracts`, `contract_required_documents`, `contract_attachments`, `compliance_records` | HRadmin, Superadmin | draft, active, expired, completed | contract/requirement record created | yes | yes | split |
| Documents/forms | `/app/documents`, `/app/documents-reporting` | `/api/documents`, `/api/document-reporting/*` | `documents`, `enterprise_documents`, `file_objects` | HRadmin, Employee | draft, submitted, approved | document saved | yes | partial | duplicate |

---

## Source-of-Truth Matrix

| Domain | Canonical recommended | Legacy duplicates | Conflict | Action required |
|---|---|---|---|---|
| Leave | `/api/leave/management/*`, `enterprise_leave_types`, `leave_request_approval_steps` | `/api/leave/*`, `leave_types`, `leave_policies` | high | migrate legacy requests, redirect UI, unify balances |
| Payroll | `PayrollRunService`, `/api/payroll/runs`, `/api/payroll/slips` | `/api/payroll-attendance`, `payroll_adjustments`, `attendance_payroll_impacts` | high | integrate Bundle A tables or deprecate/payroll read-only flag |
| Attendance | `/api/attendance/clock-in`, `attendance_records` | `/api/attendance-intelligence/*`, `/api/shift-scheduler/*` | medium | explicitly classify correction records and integrate payroll impacts |
| Workflow | `/api/workflow/requests`, `employee_actions` | `/api/workflows/pending`, `/api/performance/*`, `/api/payroll-adjustments/*`, `/api/leave/management/*` | high | build unified approval inbox or deprecate duplicates |
| Notifications | `/api/notifications/center` | `/api/notifications` | medium | reconcile endpoint semantics and preferences |
| Documents | `/api/document-reporting/*`, `enterprise_documents` | `/api/documents` | medium | migrate attachments and standardize docs API |
| Compliance/contracts | `/api/compliance-contracts/*`, `employee_contracts` | `/api/compliance/*`, `compliance_records` | medium | decide contract vs compliance canonical source |

---

## Integration Map

- Payroll: affected by salary components, overtime requests, advances, leave unpaid deductions, payroll policies.
- Attendance: biometric clock-in/out, correction requests, shifts, attendance violations, attendance payroll impacts.
- Leave: legacy and enterprise leave request systems, leave balances, payroll impact, calendar reporting.
- Notifications: `notifications` table plus duplicate endpoints and secondary delivery log tables.
- Audit: approval rows in leave, workflow, payroll adjustment, contract attachments, performance workflows.
- Reports: legacy `/api/reports` plus `/api/document-reporting/exports` and enterprise report definitions.
- Employee profile: recruitment conversion, performance promotion, contract type, salary components.
- Documents: legacy `documents`, `file_objects` and `enterprise_documents`, `enterprise_form_templates`.

---

## Test Evidence

- Code inspected: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/payroll-run.service.ts`, `artifacts/api-server/src/leave-notifications.service.ts`, `artifacts/api-server/src/compliance-contracts.service.ts`, `artifacts/api-server/src/payroll-policy.service.ts`, selected migration files.
- APIs tested: implied by existing QA reports and smoke tests in `qa/bundle-a-payroll-attendance-report.md`, `qa/bundle-b-performance-workflows-report.md`, `qa/phase-d-leave-notifications-report.md`.
- Browser flows tested: prior QA docs indicate route checks and some manual smoke; no new browser tests performed.
- DB checks performed: code-path and schema evidence; no fresh DB query executed in this audit run.
- Not tested / needs manual test: cross-tenant isolation with second company, payslip rendering for Bundle A adjustments, actual UI navigation of duplicate screens, contract compliance automatic document linkage.

---

## Cleanup Roadmap

### Must fix before more features
- Stop legacy leave mutations or redirect `/app/leave` to enterprise engine.
- Integrate Bundle A payroll adjustment and attendance impact sources into `PayrollRunService`.
- Define attendance correction records as audited exceptions and capture proof metadata.
- Consolidate workflow approval inbox semantics.
- Reconcile notification APIs and preferences.

### Should fix before demo/customer
- Clean up duplicate payroll/salary component routes.
- Align recruitment conversion with contract and compliance object creation.
- Link performance promotion approvals to employee actions/payroll.
- Migrate or unify document attachments with enterprise documents.
- Validate tenant isolation for cross-company mutation paths.

### Can fix later
- Remove legacy reports once enterprise export/reporting is proven.
- Archive legacy compliance records after contract system is canonical.
- Clean up Arabic mojibake text after immediate source-of-truth fixes.

### UI cleanup only
- Remove or redirect duplicate nav entries for leave, payroll, documents, workflows.
- Rename `/app/payroll-attendance` and related shift surfaces for clarity.
- Add explicit labels for legacy vs enterprise leave and approvals.
- Fix unreadable dark-mode areas on notification and report UI.

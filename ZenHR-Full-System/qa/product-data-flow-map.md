# Product Data Flow Map

Generated: 2026-05-13

## Leave Request To Approval To Payroll

Expected enterprise flow:

1. Employee creates leave request.
2. Manager approves or rejects.
3. HR approves final step or overrides.
4. Leave balance updates.
5. Notification and audit are written.
6. Payroll deducts only approved unpaid leave.

Actual flow:

- `/app/leave` creates requests through legacy `/api/leave/requests` or `/api/leave/me/requests`.
- `/app/leave-management` creates requests through `/api/leave/management/requests`.
- Both write into `leave_requests`, but they use different type sources:
  - Legacy uses `leave_types` / `leave_policies`.
  - New engine uses `enterprise_leave_types` / `leave_accrual_policies`.
- Payroll run deduction uses `approvedUnpaidLeaveImpactForEmployee`, which joins `leave_requests.leave_type` to `enterprise_leave_types.id`. This means new enterprise unpaid leave is used by payroll. Legacy leave requests with a legacy code or `leave_types.id` may not be deducted unless their value also matches an enterprise leave type id.
- Legacy approval writes status directly and best-effort updates `leave_balances`.
- New approval writes `leave_request_approval_steps`, `leave_request_audit_logs`, notifications, and optional payroll impact rows.

Source-of-truth recommendation:

- Keep `/app/leave-management` and `/api/leave/management/*` as the enterprise source.
- Deprecate `/app/leave` after adding compatibility redirects or making it a self-service view backed by enterprise APIs.

## Attendance To Payroll

Expected enterprise flow:

1. Employee checks in/out with biometric plus geofence.
2. Attendance records hold biometric/geofence proof.
3. Shift rules produce lateness, absence, overtime, violations.
4. Attendance impacts payroll preview and runs.

Actual flow:

- `/api/attendance/clock-in` and `/api/attendance/clock-out` enforce geofence and biometric assertion.
- `attendance_records` are updated with biometric metadata by `markAttendanceBiometric`.
- `/api/attendance/requests/:id/approve` can insert or update `attendance_records` from correction requests without biometric proof. This is a legitimate correction path but it means "no biometric = no attendance" is not universally true at the data layer.
- Payroll run calculation reads approved legacy overtime requests (`overtime_requests`) and worked hours for hourly employees via payroll policy service.
- Payroll run calculation does not read `attendance_payroll_impacts` or `attendance_violations` directly.

Source-of-truth recommendation:

- Keep `attendance_records` as source of truth.
- Explicitly classify correction-approved records as audited exceptions.
- Connect `attendance_payroll_impacts` into `PayrollRunService` or deprecate that table from payroll claims.

## Recruitment To Employee

Expected enterprise flow:

1. Recruitment request inherits job profile requirements.
2. Candidate moves through pipeline.
3. Offer is approved and accepted.
4. Candidate converts to employee and user.
5. Onboarding, documents, contracts, and compliance are initialized.

Actual flow:

- Recruitment requests, candidates, interviews, offers, approvals, and pipeline are stored in Phase 3 tables.
- Conversion endpoint `/api/recruitment/candidates/:id/convert-to-employee` creates:
  - `employees` row.
  - `users` row with role `employee`.
  - `onboarding_batches` row.
  - Candidate conversion links.
  - Activity log and email log.
- Conversion does not currently create an `employee_contracts` record, `enterprise_documents` folder/document entries, or compliance required document records.

Source-of-truth recommendation:

- Keep recruitment conversion but add a post-hire orchestrator later to create contracts, compliance requirements, and onboarding document tasks.

## Performance To Promotion/Payroll

Expected enterprise flow:

1. Evaluation is created and scored.
2. Workflow approval is routed.
3. Promotion/increment recommendation is approved.
4. Employee profile/job/salary data changes.
5. Future payroll reflects the approved change.

Actual flow:

- Performance evaluations and workflow instances are real in Bundle B.
- Approval of a performance evaluation updates `performance_evaluations.status`.
- Promotion recommendations are stored in `performance_promotion_recommendations` and can create a Bundle B workflow.
- The inspected code does not apply approved performance promotion recommendations into `employee_actions`, `employees.basic_salary`, `employee_salary_components`, or payroll.
- Separate legacy employee action workflows can apply salary/job/status changes to employees and salary components.

Source-of-truth recommendation:

- Keep legacy `employee_actions` as the business-effect workflow for employee/payroll changes.
- Treat performance promotion records as recommendations until they create or link to employee actions.

## Compliance To Documents

Expected enterprise flow:

1. Compliance rules determine required documents.
2. Contracts and employee attributes determine requirements.
3. Uploaded documents satisfy requirements.
4. Alerts and reports use real document/compliance state.

Actual flow:

- Legacy compliance uses `compliance_records` and employee compliance fields.
- Compliance contracts use `employee_contracts`, `contract_required_documents`, and `contract_attachments`.
- Documents & Reporting uses `enterprise_documents`.
- Contract attachments are metadata in `contract_attachments`; they are not automatically the same as `enterprise_documents`.
- Contract required documents are connected to contracts, not a global nationality/employment-type compliance policy engine.

Source-of-truth recommendation:

- Keep `employee_contracts` for contract lifecycle.
- Use `enterprise_documents` as canonical document records.
- Bridge `contract_attachments` and required documents into enterprise document categories/status.

## Contracts To Employee/Payroll

Expected enterprise flow:

1. Employee contract stores employment type, dates, probation, compensation metadata.
2. Employee profile and payroll policy use contract/employment type.

Actual flow:

- `employee_contracts` are scoped to employees and track lifecycle, expiry, probation, compliance status, and required documents.
- Payroll policy uses `employees.employment_type`, not contract type/status.
- Recruitment conversion writes employee `contract_type` text field but does not create `employee_contracts`.

Source-of-truth recommendation:

- Decide whether `employees.contract_type` remains a simple field or whether `employee_contracts` becomes canonical.
- If `employee_contracts` is canonical, update recruitment conversion and payroll policy resolver to account for current active contract.

# Full Workflow Audit Map

Generated: 2026-05-13

## 1. Leave Approval Workflow

- Trigger screen: `/app/leave`, `/app/leave-management`
- Trigger API: `/api/leave/requests`, `/api/leave/me/requests`, `/api/leave/management/requests`
- DB tables used: `leave_requests`, `leave_types`, `leave_policies`, `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_request_audit_logs`, `leave_payroll_impacts`, `leave_balances`
- Approval steps: manager → HRadmin/superadmin, with enterprise approval step rows; legacy path may change status directly.
- Status transitions: `pending` → `manager_approved` / `approved` / `rejected` / `cancelled`; enterprise also writes `pending` `approved` `rejected` and may use `manager_approved`.
- Who can approve: manager, HRadmin, superadmin; recruiters blocked.
- Final business effect: leave granted/denied; enterprise unpaid leave can generate payroll deduction records.
- Notifications generated: yes for enterprise path; likely older notifications for legacy leave.
- Audit logs generated: yes for enterprise path via `leave_request_audit_logs`; legacy path has weaker auditing.
- Updates real source-of-truth: partial. Enterprise path writes audit and payroll impact, legacy path writes into `leave_requests` and may update balances, but payroll only reliably consumes enterprise types.
- Can get stuck: yes, if `leave_request_approval_steps` row remains pending or if manager approval is not propagated to HR path.
- Can bypass RBAC: legacy path has older endpoint semantics; manager approval logic is not centralized.
- Conflicts: duplicates with legacy leave system, inconsistent payroll impact, dual UI surfaces.

## 2. Employee Action Workflow

- Trigger screen: `/app/employee-actions`, `/app/workflows`
- Trigger API: `/api/workflow/requests`, `/api/workflow/requests/:id/approve`, `/api/workflow/requests/:id/reject`, `/api/workflow/requests/:id/cancel`
- DB tables used: `employee_actions`, `workflow_actions`, `employees`, `employee_salary_components`
- Approval steps: defined in `employee_actions.approval_steps_json`, may be multi-step with assigned roles.
- Status transitions: `pending` → `approved` / `rejected` / `cancelled`.
- Who can approve: HRadmin, payrolladmin, manager depending on workflow configuration.
- Final business effect: employee status change, salary promotion/demotion, contract renewal, suspension, termination, resignation, transfer.
- Notifications generated: yes through existing notification helpers.
- Audit logs generated: yes through `workflow_actions` and historical API.
- Updates real source-of-truth: yes, this is the most direct workflow affecting employee payroll and profile state.
- Can get stuck: yes if approvals are not completed or if approval steps are skipped by missing backend enforcement.
- Can bypass RBAC: possible if generic workflow APIs are not aligned with domain-specific role limits.
- Conflicts: this workflow overlaps with performance promotion recommendations and recruitment handoff.

## 3. Payroll Adjustment Workflow

- Trigger screen: `/app/payroll-attendance`, `/app/payroll-adjustments`
- Trigger API: `/api/payroll-adjustments`, `/api/payroll-adjustment-types`, `/api/payroll-adjustments/:id/status`, `/api/payroll-adjustment-approvals`
- DB tables used: `payroll_adjustments`, `payroll_adjustment_types`, `payroll_adjustment_approvals`
- Approval steps: pending approval rows routed by role, then accepted/rejected/applied.
- Status transitions: `pending` → `approved` / `rejected` → `applied`.
- Who can approve: HRadmin, payrolladmin; manager/employee blocked.
- Final business effect: planned adjustment record created; actual payroll application is currently inconsistent.
- Notifications generated: yes, likely via notifications helper.
- Audit logs generated: approval rows exist; per-run linkage not fully guaranteed.
- Updates real source-of-truth: partial. The record exists, but canonical payroll run does not consume it.
- Can get stuck: yes if approved but never applied to a payroll run.
- Can bypass RBAC: not on current approval APIs, but older salary component screens may allow direct mutation.
- Conflicts: duplicate routes for salary components and payroll adjustment management.

## 4. Attendance Correction Workflow

- Trigger screen: `/app/attendance`, correction request UI under employee manager.
- Trigger API: `/api/attendance/me/requests`, `/api/attendance/requests`, `/api/attendance/requests/:id/approve`, `/api/attendance/requests/:id/reject`
- DB tables used: `attendance_corrections`, `attendance_records`, `attendance_trusted_devices`, `attendance_biometric_audit_logs`
- Approval steps: request → pending → approved/rejected.
- Status transitions: `pending` → `approved` / `rejected`.
- Who can approve: HRadmin, manager depending on route.
- Final business effect: attendance records can be inserted/updated to reflect corrected punches.
- Notifications generated: yes for correction changes.
- Audit logs generated: not clearly unified; correction approvals may or may not create separate audit records.
- Updates real source-of-truth: yes, in `attendance_records`, but proof metadata is not guaranteed.
- Can get stuck: yes if corrections are not reviewed; if approved, they quietly mutate attendance history.
- Can bypass RBAC: employees can submit requests; approval path seems enforced.
- Conflicts: with biometric enforcement and payroll impact expectations.

## 5. Recruitment Approval Workflow

- Trigger screen: `/app/recruitment`
- Trigger API: `/api/recruitment/*`, `/api/recruitment/candidates/:id/convert-to-employee`
- DB tables used: `recruitment_requests`, `candidates`, `job_offers`, `onboarding_batches`, `employees`, `users`
- Approval steps: standard ATS pipeline plus offer acceptance.
- Status transitions: `open` → `shortlisted` → `offered` → `accepted` → `converted`.
- Who can approve: recruiter, hiring manager, HRadmin.
- Final business effect: employee/user created; onboarding batch started.
- Notifications generated: yes, via candidate and offer workflows.
- Audit logs generated: yes for conversion actions; not necessarily for compliance handoff.
- Updates real source-of-truth: yes for employee/user creation, but not for contract/compliance data.
- Can get stuck: yes if candidate conversion does not transition to contract onboarding.
- Can bypass RBAC: not evident in API, but missing contract creation causes silent handoff gap.
- Conflicts: disconnects between recruitment and compliance/contract workflow.

## 6. Performance Workflow

- Trigger screen: `/app/performance-workflows`
- Trigger API: `/api/performance/evaluations`, `/api/performance/promotion-recommendations`, `/api/performance/workflows`
- DB tables used: `performance_rating_policies`, `performance_goals`, `performance_evaluations`, `performance_workflow_instances`, `performance_promotion_recommendations`
- Approval steps: evaluation submission and multi-step workflow approval.
- Status transitions: `draft`/`submitted` → `pending` → `approved` / `rejected`.
- Who can approve: manager, HRadmin, payrolladmin as configured.
- Final business effect: performance status and promotion recommendation saved.
- Notifications generated: yes.
- Audit logs generated: via workflow action history.
- Updates real source-of-truth: only in performance domain; does not automatically change employee payroll/job.
- Can get stuck: yes if recommendation is not acted upon by employee actions.
- Can bypass RBAC: not visibly, but business effect is incomplete.
- Conflicts: with employee actions and salary change workflows.

## 7. Compliance/Contract Workflow

- Trigger screen: `/app/compliance-contracts`, `/app/compliance`
- Trigger API: `/api/compliance-contracts/*`, `/api/compliance/*`
- DB tables used: `contract_types`, `employee_contracts`, `contract_required_documents`, `contract_attachments`, `contract_audit_logs`, `compliance_records`, `enterprise_documents`
- Approval steps: contract create/renew/expire; compliance requirement tracking.
- Status transitions: `draft` → `active` / `expired` / `completed`.
- Who can approve: HRadmin, superadmin.
- Final business effect: contract metadata and required documents tracked.
- Notifications generated: yes for expiring contracts and missing documents.
- Audit logs generated: yes for contract CRUD.
- Updates real source-of-truth: yes for contracts, but not unified with legacy compliance.
- Can get stuck: yes if contract attachments are not linked to enterprise documents.
- Can bypass RBAC: not evident; primary risk is split models.
- Conflicts: between legacy compliance records and new contract-based compliance.

## 8. Documents/Form Workflow

- Trigger screen: `/app/documents`, `/app/forms`, `/app/documents-reporting`
- Trigger API: `/api/documents`, `/api/forms`, `/api/document-reporting/*`
- DB tables used: `documents`, `file_objects`, `enterprise_documents`, `enterprise_form_templates`, `enterprise_form_submissions`, `enterprise_report_definitions`
- Approval steps: document upload/approval, form submission, report generation.
- Status transitions: `draft` → `submitted` / `approved` / `archived`.
- Who can approve: HRadmin, superadmin, sometimes employee.
- Final business effect: document stored and visible; reports generated.
- Notifications generated: yes for document requests.
- Audit logs generated: partial; standard upload history exists but cross-domain audit is weak.
- Updates real source-of-truth: split; enterprise documents are canonical only in new reporting surfaces.
- Can get stuck: yes if document attachments remain in old `documents` without enterprise migration.
- Can bypass RBAC: possible through legacy document direct upload endpoints.
- Conflicts: legacy document system vs enterprise document/reporting system.

## 9. Termination/Resignation Workflow

- Trigger screen: `/app/employee-actions`, `/app/workflows`
- Trigger API: `/api/workflow/requests`, `employee_action` mutation APIs.
- DB tables used: `employee_actions`, `workflow_actions`, `employees`
- Approval steps: manager/HR review, then final approval.
- Status transitions: `pending` → `approved` / `rejected`.
- Who can approve: HRadmin, manager, superadmin.
- Final business effect: employee status update, possible payroll finalization.
- Notifications generated: yes.
- Audit logs generated: yes via workflow actions.
- Updates real source-of-truth: yes for employee status, but payroll finality depends on run lock behavior.
- Can get stuck: yes if termination is approved but payroll run still includes employee.
- Can bypass RBAC: possible if payroll or employee APIs allow later manual reactivation.
- Conflicts: with employee termination state in payroll and attendance domains.

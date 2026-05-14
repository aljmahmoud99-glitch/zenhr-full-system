# Product Integrity Audit Report

Generated: 2026-05-13

## Executive Summary

Product consistency status: **NO-GO for product consolidation**.

This is not a statement that the app cannot run. Live smoke showed backend health, role logins, and many endpoint families responding. The issue is product integrity: the system now contains multiple working modules that overlap, use different source-of-truth tables, and are not always connected to downstream business effects.

The clearest pattern is: newer enterprise modules often work in isolation, while older screens and canonical engines still exist beside them. The risk is not just UI clutter. It can produce inconsistent payroll, duplicated approvals, corrupted Arabic labels, and unclear HR operations.

## Evidence Used

- Angular route inventory from `frontend/src/app/app.routes.ts`.
- Frontend feature inventory under `frontend/src/app/features`.
- Backend route inspection in `artifacts/api-server/src/index.ts`, `leave-notifications.service.ts`, and `compliance-contracts.service.ts`.
- Migration/schema inspection across `fix-database.sql`, Admin V2, Phases 1-3, Bundles A-C, and post-release migrations.
- Live API smoke written to `qa/product-integrity-results.json`.
- Selected service inspection, especially `artifacts/api-server/src/payroll-run.service.ts`.

Runtime note: a plain Node DB inspection could not load `pg` from the root smoke script, so DB runtime counts were not captured. Table ownership was reconciled from migrations and Drizzle schema files instead.

## Top 10 Risks

1. Payroll runs do not consume Bundle A `payroll_adjustments`, installments, or `attendance_payroll_impacts`.
2. Leave has two active screens and two type/policy systems writing to the same `leave_requests` table.
3. Payroll unpaid leave deduction only recognizes enterprise leave types, not necessarily legacy leave requests.
4. Legacy leave and some SQL/backend literals still contain mojibake Arabic text.
5. Attendance clock-in/out enforces biometric, but approved correction requests can still create attendance records without biometric proof.
6. Performance promotion recommendations do not apply employee/job/salary changes to payroll.
7. Recruitment conversion creates employee/user/onboarding but not contracts, compliance requirements, or enterprise document tasks.
8. Multiple approval systems exist with no unified source of truth or inbox.
9. Notifications share a table but have duplicate endpoint semantics and duplicate migration ownership for preferences.
10. Documents, compliance, contracts, forms, and reports are split between legacy and enterprise table families.

## Top 10 Cleanup Priorities

1. Canonicalize payroll calculation in `PayrollRunService`.
2. Make enterprise leave the only leave lifecycle.
3. Fix Arabic encoding in source and seeded data.
4. Define attendance correction as an audited biometric exception.
5. Create a unified approval inbox projection.
6. Connect performance recommendations to employee actions.
7. Connect recruitment conversion to contracts/compliance/documents.
8. Make `enterprise_documents` canonical for uploaded/generated documents.
9. Reconcile notification preferences schema and API shape.
10. Clean navigation so users see one source-of-truth screen per domain.

## Domain Findings

### 1. Leave

Existing screens:

- `/app/leave`
- `/app/leave-management`

Existing APIs:

- Legacy: `/api/leave/requests`, `/api/leave/me/requests`, `/api/leave/types`, `/api/leave/policies`, `/api/leave/balances`.
- Enterprise: `/api/leave/management/dashboard`, `/types`, `/requests`, `/balances`, `/payroll-impact`, `/audit`.

Tables:

- Legacy: `leave_requests`, `leave_types`, `leave_policies`, `leave_balances`.
- Enterprise additions: `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_request_audit_logs`, `leave_payroll_impacts`, `leave_cancellations`.

Source of truth:

- Intended source appears to be `/app/leave-management` plus enterprise APIs.
- Actual source is split because `/app/leave` still creates/approves requests.

Payroll connection:

- Payroll uses `approvedUnpaidLeaveImpactForEmployee`, which joins `leave_requests.leave_type` to `enterprise_leave_types.id`.
- This confirms enterprise unpaid leave can affect payroll.
- It also means legacy leave requests using old leave type codes/ids are not guaranteed to affect payroll.

Status: **Duplicated and partially connected**.

### 2. Payroll

Screens:

- `/app/payroll/runs`
- `/app/payroll/slips`
- `/app/payroll/salary-components`
- `/app/salary-components`
- `/app/payroll-attendance`
- `/app/payroll-policies`

Canonical engine:

- `artifacts/api-server/src/payroll-run.service.ts`

Actually used in payroll run calculation:

- Payroll policy period context.
- Employee salary components and fallback basic allowances.
- Approved legacy overtime requests.
- Approved salary advances.
- Approved enterprise unpaid leave impact.
- Tax/SSC configuration.

Not used in payroll run calculation:

- Bundle A `payroll_adjustments`.
- `payroll_adjustment_installments`.
- `attendance_payroll_impacts`.
- `payroll_audit_events` as calculation input.

Status: **Canonical run engine works but Bundle A is not fully integrated**.

### 3. Attendance

Screens:

- `/app/attendance`
- `/app/shifts`
- `/app/payroll-attendance`

APIs:

- Live attendance: `/api/attendance`, `/clock-in`, `/clock-out`, `/summary`, `/dashboard`, `/map`, `/locations`.
- Correction requests: `/api/attendance/me/requests`, `/api/attendance/requests`.
- Biometric: `/api/attendance/biometric/*`.
- Bundle A: `/api/attendance-intelligence/*`, `/api/shift-scheduler/*`.

Biometric enforcement:

- Live smoke POST to `/api/attendance/clock-in` without biometric returned 400: "Biometric or Face ID verification is required".
- Code confirms clock-in/out call `validateAttendanceGeofence` and `verifyAttendanceBiometricAssertion`.

Bypass/exception:

- Attendance correction approval can insert attendance records into `attendance_records` without biometric verification.

Payroll connection:

- Payroll uses old overtime requests and worked hours for hourly employees.
- It does not consume `attendance_payroll_impacts` directly.

Status: **Working live biometric path, but attendance-payroll integration is incomplete**.

### 4. Workflows

Workflow families:

- Employee actions: `employee_actions` plus `/api/workflow/requests/:id` and `/api/workflows/pending`.
- Leave: `leave_request_approval_steps`.
- Recruitment: `recruitment_request_approvers`.
- Payroll adjustments: `payroll_adjustment_approvals`.
- Performance: `performance_workflow_instances` and `performance_workflow_actions`.
- Admin V2 generic workflow tables: `workflow_definitions`, `workflow_steps`, `workflow_actions`.

Real business side effects:

- Employee action workflow applies transfer, promotion/demotion, salary change, suspension, termination, resignation, and contract renewal changes to employees and salary components.
- Performance workflow approval updates performance evaluation status.
- Leave workflow updates leave request status and payroll impact for enterprise unpaid leave.
- Recruitment approval updates recruitment request/offer states.

Disconnected or limited:

- Performance promotion recommendations do not apply employee salary/job changes.
- There is no unified workflow list endpoint; live smoke showed `GET /api/workflow/requests` returns 404 while `/api/workflow/requests/:id` exists.
- `/api/workflows/pending` represents employee actions, not all workflows.

Status: **Several real workflows, no unified workflow product**.

### 5. Notifications

APIs:

- `/api/notifications`
- `/api/notifications/center`
- `/api/notifications/preferences`
- `/api/notifications/delivery-logs`

Tables:

- `notifications`
- `notification_preferences`
- `notification_delivery_logs`

Findings:

- Live smoke showed both `/api/notifications` and `/api/notifications/center` respond.
- Most modules call notification helpers writing to `notifications`.
- Preferences table is declared in multiple migrations, creating schema drift risk if applied in different order.

Status: **Central table, duplicated API semantics**.

### 6. Compliance And Contracts

Screens:

- `/app/compliance`
- `/app/compliance-contracts`
- `/app/documents-reporting`
- employee profile/document surfaces.

Tables:

- Legacy compliance: `compliance_records`.
- Contracts: `contract_types`, `employee_contracts`, `contract_required_documents`, `contract_attachments`, `contract_audit_logs`.
- Enterprise documents: `enterprise_documents`.

Findings:

- Compliance contracts are tenant-scoped and have real CRUD/dashboard endpoints.
- Contract attachments are not automatically enterprise documents.
- Legacy compliance alerts are not fully derived from contract required documents.

Status: **Working but split between compliance records, contracts, and documents**.

### 7. Recruitment

Screens:

- `/app/recruitment`

Tables:

- `recruitment_requests`, `candidates`, `candidate_*`, `interviews`, `job_offers`, `hiring_decisions`, `onboarding_batches`.

Findings:

- Job profile dropdown integration exists.
- Candidate conversion creates employee, user, onboarding batch, activity log, notification/email log.
- It does not create a contract record or required compliance documents.

Status: **Functional ATS core, incomplete post-hire handoff**.

### 8. Performance

Screens:

- `/app/performance-workflows`

Tables:

- `performance_rating_policies`, `performance_goals`, `performance_evaluations`, `performance_workflow_*`, `performance_promotion_recommendations`.

Findings:

- Evaluations and workflow approvals are real.
- KPI/goal scoring exists.
- Promotion recommendations are stored and can start workflow.
- Approved recommendation does not update employee salary/job or payroll unless separately represented as an employee action.

Status: **Performance engine works, payroll/employee action integration incomplete**.

### 9. Documents And Reporting

Screens:

- Legacy: `/app/documents`, `/app/forms`, `/app/reports`.
- Enterprise: `/app/documents-reporting`.

APIs:

- Legacy: `/api/documents`, `/api/reports/*`, `/api/export/:reportType`.
- Enterprise: `/api/document-reporting/*`, `/api/production/exports/:dataset`.

Findings:

- Enterprise document/reporting APIs respond.
- Some export endpoints generate binary CSV/XLSX/PDF.
- PDF template preview returns HTML preview with `pdfGeneration: "not_configured"`.
- Documents are not consistently linked across contracts/recruitment/legacy documents.

Status: **Useful but split and partially placeholder for PDF templates**.

### 10. RBAC And Tenant Isolation

Live smoke:

- All core test roles logged in successfully.
- Recruiter was blocked from payroll adjustments GET with 403.
- Employee document-reporting GET returned scoped success.
- Manager payroll adjustment POST with empty body returned 400, because managers are permitted to create scoped adjustment requests in current code. This is a business decision that must be documented because earlier requirements sometimes expected manager limited request/approval scope, not full payroll mutation.

Risks:

- Static frontend role map and backend RBAC are not guaranteed to match.
- Superadmin tenant mutation policy is inconsistent across modules.
- Deprecated endpoints need the same RBAC coverage as canonical endpoints.

Status: **Mostly role-gated, needs regression and policy cleanup**.

## Product Consistency Verdict

The system is **not ready for product consolidation signoff** until the duplicated source-of-truth modules are resolved. The strongest immediate blockers are payroll integration, leave unification, Arabic encoding cleanup, and workflow/approval consolidation.

The codebase has enough working pieces to stabilize into a reliable enterprise HRMS, but the next work should be cleanup and integration only, not more feature expansion.

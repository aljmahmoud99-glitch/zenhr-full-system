# Product Broken Or Disconnected Flows

Generated: 2026-05-13

Severity scale:

- Critical: can produce wrong payroll, unauthorized access, or inconsistent business state.
- High: duplicated source of truth or user-visible broken/confusing flow.
- Medium: functional but incomplete integration.
- Low: polish, naming, or reporting issue.

## Critical

### Payroll adjustments do not feed canonical payroll runs

- Expected: Approved `payroll_adjustments` affect payroll runs, payslips, totals, exports, and reports.
- Actual: `PayrollRunService` loads salary components, overtime requests, salary advances, payroll policy, and enterprise unpaid leave impact. It does not load `payroll_adjustments`, `payroll_adjustment_installments`, or `attendance_payroll_impacts`.
- Affected files: `artifacts/api-server/src/payroll-run.service.ts`, Bundle A APIs in `artifacts/api-server/src/index.ts`.
- Recommended fix: Make `PayrollRunService` the only calculation gateway and explicitly apply approved adjustments, installments, and attendance payroll impacts with duplicate protection.

### Leave source of truth is split

- Expected: One leave request lifecycle across employee, manager, HR, notifications, balances, and payroll.
- Actual: `/app/leave` and `/app/leave-management` both exist. Legacy leave uses `leave_types` and `leave_policies`; enterprise leave uses `enterprise_leave_types` and `leave_accrual_policies`. Payroll unpaid leave deduction only joins to `enterprise_leave_types`.
- Affected files: `frontend/src/app/features/leave/*`, `frontend/src/app/features/leave-management/*`, `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/leave-notifications.service.ts`.
- Recommended fix: Keep enterprise leave as source; convert old leave route to a thin self-service view backed by `/api/leave/management/*`.

### Arabic text corruption remains in legacy leave and migration seeds

- Expected: Arabic UI and seeded labels render clean UTF-8.
- Actual: Old leave component contains mojibake Arabic strings. Phase D SQL seed values for enterprise leave types also show mojibake in the checked file. Backend notification titles in older routes also contain mojibake literals.
- Affected files: `frontend/src/app/features/leave/leave.component.ts`, `migrations/phase-d-leave-notifications.sql`, older notification text in `artifacts/api-server/src/index.ts`.
- Recommended fix: Centralize translations and create a safe data cleanup migration for corrupted seeded Arabic values.

## High

### Attendance biometric can be bypassed by approved correction records

- Expected: No biometric means no attendance.
- Actual: Live `/api/attendance/clock-in` and `/clock-out` enforce biometric and geofence. However `/api/attendance/requests/:id/approve` can insert attendance records from approved corrections without biometric proof.
- Affected files: `artifacts/api-server/src/index.ts`.
- Recommended fix: Treat correction-created attendance as an explicit audited exception with distinct status/proof fields, or require HR override reason and separate payroll handling.

### Performance promotion recommendations do not apply employee/payroll changes

- Expected: Approved promotion/increment recommendation updates employee job/salary or creates an employee action.
- Actual: Performance recommendations are stored and can create Bundle B workflow instances, but inspected approval logic applies only evaluation status. Legacy `employee_actions` workflow is the path that applies salary/job/status changes.
- Affected files: Performance routes in `artifacts/api-server/src/index.ts`.
- Recommended fix: Final approved performance promotion should create/link an `employee_actions` request or call the same application service.

### Recruitment conversion does not initialize contracts/compliance/documents

- Expected: Hiring conversion creates employee, user, onboarding, contract, required docs, and compliance state.
- Actual: Conversion creates employee, user, onboarding batch, logs, and email dry-run. It does not create `employee_contracts`, `enterprise_documents`, or compliance required document records.
- Affected files: `POST /api/recruitment/candidates/:id/convert-to-employee` in `artifacts/api-server/src/index.ts`.
- Recommended fix: Add post-hire orchestration to create a draft contract and document checklist.

### Multiple workflow engines have no shared inbox/source

- Expected: One approval model or at least one unified inbox.
- Actual: Employee actions, leave, recruitment, payroll adjustments, performance, and compliance use separate approval tables/endpoints. `/api/workflow/requests` has no list endpoint and `/api/workflows/pending` only represents employee actions.
- Affected APIs: `/api/workflows/pending`, `/api/workflow/requests/:id`, `/api/leave/management/*`, `/api/recruitment/approvals`, `/api/performance/approvals/pending`, `/api/payroll-adjustments/approvals`.
- Recommended fix: Build a read-only unified approval projection first, then standardize writes.

## Medium

### Notification system is centralized by table but duplicated by API shape

- Expected: One notification center API with consistent preferences.
- Actual: `/api/notifications` and `/api/notifications/center` both read `notifications`. Preferences table is defined in more than one migration.
- Recommended fix: Keep `/api/notifications/center` as canonical and make old endpoints compatibility wrappers.

### Documents and contracts are not fully connected

- Expected: Contract attachments and required documents are enterprise documents with shared file metadata.
- Actual: Contract attachments are stored in `contract_attachments`; enterprise documents are in `enterprise_documents`; legacy documents remain in `documents`.
- Recommended fix: Make every uploaded document produce or link to `enterprise_documents`.

### PDF generation remains partial

- Expected: PDF templates generate binary, print-ready PDFs.
- Actual: Bundle C template preview returns HTML preview with `pdfGeneration: "not_configured"`. Bundle D simple export PDFs produce basic PDFs, not full branded templates.
- Recommended fix: Add a single server-side PDF renderer and connect templates/exports to it.

### Superadmin behavior is inconsistent

- Expected: Superadmin platform oversight without tenant mutation unless explicitly impersonating/operating in tenant scope.
- Actual: Some post-release modules allow `superadmin` mutations (`compliance-contracts`, leave type mutation helpers), while others restrict to HR/payroll tenant roles.
- Recommended fix: Define a single superadmin tenant-operation policy.

## Low

### Route naming is inconsistent

- Examples: `/app/job-descriptions` is now job profiles; `/app/payroll-attendance` contains payroll adjustments, shifts, attendance intelligence, and audit.
- Recommended fix: Rename nav labels and keep old routes as redirects.

### Legacy comments and some source comments show mojibake

- This is not runtime-critical unless comments are copied into UI, but it signals encoding discipline issues.

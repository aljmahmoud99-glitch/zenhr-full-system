# Product Cleanup Plan

Generated: 2026-05-13

## Critical Fixes

1. Make payroll calculation canonical.
   - Add approved `payroll_adjustments`, installments, post-net adjustments, and `attendance_payroll_impacts` into `PayrollRunService`.
   - Add idempotency so recalculation cannot duplicate impacts.
   - Keep policy snapshot and locked run protection.

2. Unify leave.
   - Mark `/app/leave-management` and `/api/leave/management/*` as source of truth.
   - Convert `/app/leave` into a compatibility/self-service route using enterprise APIs.
   - Migrate legacy `leave_types` and `leave_policies` into enterprise leave tables or create a clear adapter.

3. Fix Arabic corruption at source.
   - Replace mojibake in legacy leave component and backend notification literals.
   - Create a safe SQL cleanup migration for corrupted seeded leave type names if DB rows are affected.
   - Add UTF-8 static checks for Arabic files and seed SQL.

4. Clarify attendance exceptions.
   - Keep biometric enforcement for normal check-in/out.
   - Mark correction-created attendance with an explicit `source='correction'` or proof exception field.
   - Require approval notes and expose the exception in audit/payroll views.

5. Unify approval visibility.
   - Create a read-only approval inbox projection across employee actions, leave, recruitment, performance, and payroll adjustments.
   - Do not replace domain approval tables until the projection is stable.

## Data Model Cleanup

1. Normalize leave type references.
   - Decide whether `leave_requests.leave_type` stores enterprise leave type id or stable code.
   - Add a new explicit `enterprise_leave_type_id` if needed.

2. Normalize notifications preferences.
   - Reconcile `notification_preferences` from Admin V2 and Phase D.
   - Add missing columns through `ALTER TABLE IF NOT EXISTS`, not duplicate `CREATE TABLE`.

3. Normalize documents.
   - Make `enterprise_documents` canonical.
   - Add bridges from legacy `documents`, `contract_attachments`, recruitment documents, and candidate documents.

4. Normalize workflows.
   - Preserve domain-specific business tables.
   - Create common workflow event table or projection for inbox/history/reporting.

5. Normalize contracts.
   - Decide whether active `employee_contracts` controls employee contract fields and payroll employment type.

## UI Navigation Cleanup

1. Hide duplicates from default HR navigation.
   - Keep one leave entry.
   - Keep one documents/forms/reporting entry or separate them by clear business use.
   - Keep one salary components entry.

2. Rename routes in navigation labels without breaking URLs.
   - `/app/job-descriptions` label should be Job Profiles.
   - `/app/payroll-attendance` should be Payroll Operations or Payroll & Attendance Control.
   - `/app/compliance-contracts` should be Contracts & Compliance.

3. Add deprecation banners only for internal admin roles on old screens.

## API Deprecation

1. Keep old APIs temporarily but make them wrappers.
   - `/api/leave/*` should call enterprise leave service.
   - `/api/notifications` should call notification center service.
   - `/api/documents` should bridge to enterprise documents or be read-only.

2. Publish an internal API map.
   - Mark canonical, compatibility, deprecated, and internal-only endpoints.

3. Add route-level RBAC tests for every compatibility endpoint.

## Workflow Unification

1. Use employee actions for business-effect changes to employee/job/salary/status.
2. Let performance promotions create employee action requests after recommendation approval.
3. Let recruitment conversion create compliance/contract/document onboarding tasks.
4. Let leave, payroll, recruitment, and performance write notification events with the same notification helper.

## Reporting Cleanup

1. Separate operational reports from configurable reports.
2. Make Bundle C saved reports wrap real report data sources.
3. Connect binary exports to the same source queries used by screens.
4. Mark HTML-only PDF preview as incomplete until a renderer is configured.

## Suggested Roadmap

### Sprint 1 - Stabilize Business Truth

- Payroll calculation integration.
- Leave unification.
- Arabic cleanup.
- Attendance correction exception policy.

### Sprint 2 - Unify Approval And Notification Experience

- Unified approval inbox projection.
- Notification center canonicalization.
- RBAC route regression for old/new APIs.

### Sprint 3 - Documents, Compliance, And Recruitment Handoff

- Recruitment post-hire contract/document/checklist creation.
- Enterprise documents as canonical attachment model.
- Compliance contracts linked to document requirements.

### Sprint 4 - UI De-duplication

- Navigation cleanup.
- Route redirects and labels.
- Deprecated screen banners.

### Sprint 5 - Reporting And Export Hardening

- Real PDF renderer.
- Saved report data source mapping.
- Export authorization matrix and regression tests.

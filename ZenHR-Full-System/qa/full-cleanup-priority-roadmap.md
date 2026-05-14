# Full Cleanup Priority Roadmap

Generated: 2026-05-13

## Goal

Create a prioritized path to stabilize the product and remove the most dangerous duplication/conflict issues before resuming feature work.

---

## Phase 1: Critical Cleanup (Stop new feature work)

1. Stop legacy leave creation.
- Redirect `/app/leave` to enterprise leave management or make it read-only.
- Migrate active legacy `leave_requests` to enterprise types or archive them.
- Add warning banners that legacy leave is deprecated.

2. Fix payroll run integration.
- Integrate `payroll_adjustments` / `payroll_adjustment_installments` into `PayrollRunService` or explicitly exclude them from payroll calculations with a warning.
- Integrate or retire `attendance_payroll_impacts`.
- Add audit logging when approved adjustments are not included in payroll.

3. Protect attendance correction audit.
- Add proof metadata for correction-created `attendance_records`.
- Treat corrections as exception records in reports.
- Prevent silent bugged punch creation without audit.

4. Consolidate workflow approvals.
- Decide on a unified approval inbox or clear domain-specific inbox boundaries.
- Ensure all leave, payroll adjustment, recruitment, and employee action flows are visible to approvers.
- Standardize `workflow_actions` and `leave_request_approval_steps` semantics.

5. Reconcile notification APIs.
- Pick one canonical notifications endpoint.
- Normalize preference shape and prevent duplicate delivery.
- Ensure all workflow and leave notifications use the same persistence model.

---

## Phase 2: High-Priority Stabilization

1. Align recruitment conversion with contract/compliance.
- Ensure candidate conversion creates `employee_contracts` and required attachments.
- Add verification steps for contract documentation.

2. Link performance promotions to payroll/employee actions.
- Automate salary change creation when a promotion recommendation is approved.
- Prevent promotion workflows from ending in recommendation-only state.

3. Unify document storage/reporting.
- Migrate critical documents from legacy `documents` to `enterprise_documents`.
- Make enterprise document reporting the canonical export surface.
- Deprecate old document upload endpoints.

4. Audit and document source-of-truth boundaries.
- Publish a formal domain map for developers and QA.
- Label legacy vs enterprise routes in UI.

5. Validate tenant isolation.
- Run explicit cross-tenant tests for leave, payroll, attendance, documents, and compliance.
- Confirm role scoping on both legacy and new APIs.

---

## Phase 3: Medium-Priority Cleanup

1. Remove duplicate salary component surfaces.
- Consolidate component management into one API.
- Clean up the old payroll salary component path.

2. Migrate legacy reports.
- Retire older report endpoints once enterprise reporting is complete.
- Ensure report definitions are centralized.

3. Harden audit logs for approvals.
- Ensure every approval action writes audit history.
- Add missing audit rows to leave and attendance correction flows.

4. Improve UI clarity.
- Label duplicate routes as legacy or enterprise.
- Hide or remove deprecated nav items.
- Add visible warnings on inconsistent surfaces.

---

## Phase 4: Low-Priority / Cleanup Only

1. Refine language and UI copy.
- Fix translation issues and inconsistent terminology.
- Use consistent labels for payroll, leave, attendance, and workflows.

2. Consolidate policy metadata.
- Merge payroll policy and leave policy configuration where overlapping.
- Archive old policy rows after migration.

3. Optimize performance only after canonical flows are stable.
- Tune reports once the source-of-truth is consistent.
- Remove duplicate query paths after cleanup.

---

## Recommended Execution Model

- Create a dedicated cleanup sprint with engineering, QA, and product representation.
- Freeze feature work on the affected domains until Phase 1 is complete.
- Deliver explicit deprecation warnings for legacy routes during migration.
- Add smoke tests for the canonical path of each domain before deprecating duplicates.

# Full Broken Workflows List

Generated: 2026-05-13

## 1. Leave Workflow Broken by Dual Systems

- Issue: legacy `/api/leave/*` and enterprise `/api/leave/management/*` both create `leave_requests`.
- Result: inconsistent leave approvals, duplicate UI, payroll deduction mismatch.
- Why it matters: payroll only reliably deducts approved enterprise leave; legacy leave can appear approved but not reduce salary.

## 2. Payroll Adjustment Workflow Not Applied

- Issue: `payroll_adjustments` are created and approved, but `PayrollRunService` ignores them.
- Result: approved adjustments do not influence net salary.
- Why it matters: employee payslips and payroll totals are inaccurate.

## 3. Attendance Correction Workflow Bypasses Biometric Proof

- Issue: approved attendance corrections insert `attendance_records` without biometric/geo proof.
- Result: audit gap for corrected punches.
- Why it matters: attendance-based payroll and contract compliance can be compromised.

## 4. Recruitment Conversion Workflow Disconnect

- Issue: candidate conversion creates employee/user records but does not complete contract/compliance handoff.
- Result: hired employees can be missing contracts and required documents.
- Why it matters: onboarding may be incomplete and compliance risk increases.

## 5. Performance Promotion Recommendation Workflow Does Not Execute Pay Changes

- Issue: approved promotion recommendations do not automatically update employee salary or payroll records.
- Result: approved performance actions remain only as recommendations.
- Why it matters: HR and payroll can become misaligned.

## 6. Notification Workflow Duplication

- Issue: notifications are emitted through legacy `notifications` endpoints and new center endpoints.
- Result: users may receive duplicate alerts or miss configured notification preferences.
- Why it matters: user experience is inconsistent and audit of notification delivery is unreliable.

## 7. Document / Form Workflow Split

- Issue: legacy document uploads and enterprise document/reporting are not unified.
- Result: documents can be orphaned in legacy tables or unavailable in enterprise reporting.
- Why it matters: compliance and audit trails depend on one source of document truth.

## 8. Compliance / Contract Workflow Split

- Issue: contract lifecycle and compliance requirement tracking are implemented in parallel models.
- Result: contract-based obligations may not be enforced in legacy compliance reports.
- Why it matters: regulatory compliance and contract expiry notifications can fail.

## 9. Workflow Inbox Incompleteness

- Issue: pending approvals appear in multiple inboxes and may not aggregate all workflow types.
- Result: approvers can miss leave, payroll, recruitment, or performance actions.
- Why it matters: approval latency increases and decisions are inconsistent.

## 10. Payroll Attendance Analytics vs Payroll Calculation Disconnect

- Issue: attendance intelligence and payroll attendance analytic tables do not feed the payroll engine.
- Result: data observed in attendance reports does not reconcile with payslip totals.
- Why it matters: finance cannot trust attendance analytics for payroll projection.

## 11. Tenant Scoped Flow Uncertainty

- Issue: role and company scoping exists, but cross-tenant isolation has not been fully validated for all flows.
- Result: workflow actions may execute under the wrong tenant when duplicate APIs are used.
- Why it matters: tenant data leakage and incorrect approvals.

## Overall Assessment

These broken workflows are not isolated UI issues. They reflect fundamental integration failures across leave, payroll, attendance, recruitment, and document compliance. Remediation should focus on source-of-truth alignment before adding any new business functionality.

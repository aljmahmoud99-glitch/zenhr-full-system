# Full RBAC + Tenant Audit

Generated: 2026-05-13

## Overview

RBAC and tenant enforcement are inconsistent across legacy and enterprise endpoints. The system has multiple API families with overlapping role rules, and older endpoints may not match newer UI role access.

---

## 1. Leave APIs

- Legacy endpoints `/api/leave/*` are older and permit HRadmin/superadmin plus conditional manager behavior.
- Enterprise endpoints `/api/leave/management/*` explicitly block `recruiter` and restrict managers on employee scope.
- Backend code in `leave-notifications.service.ts` uses `isHrAdmin(role)` for mutations, meaning `payrolladmin` may be restricted even if UI expects access.
- Mismatch: some frontend leave features may still use legacy endpoints while newer leave management screens use enterprise APIs.
- Superadmin behavior: allowed on enterprise leave management, but legacy endpoints are less clear.
- Manager/employee over-permission: employee can view their own leave; manager can view direct report leave. `payrolladmin` is blocked from mutation but allowed viewing.
- Tenant isolation: leave APIs use `company_id` filters on DB queries.

## 2. Payroll and Payroll Policy APIs

- Payroll policy management roles are checked by `canManagePayrollPolicy` in `index.ts` and restrict to payroll components.
- Payroll adjustment APIs deny `manager`, `employee`, and `recruiter` for creation, preserving HR/payroll roles.
- Payroll run UI and payroll-attendance UI may expose routes to `manager` or `employee` depending on frontend guard.
- Superadmin is platform-level and should not operate as tenant payroll operator; code still returns 403 for certain superadmin payroll adjustment routes.
- Tenant isolation: payroll APIs are scoped by `company_id` and `user.companyId`.

## 3. Attendance APIs

- Live attendance clocking requires auth and employee scope; manager can view direct reports.
- Biometric device APIs are likely restricted to HRadmin or superadmin.
- Correction request APIs allow employee submission and manager/HR review.
- Mismatch: frontend may expose `/app/attendance` to manager and employee, but backend enforces different scope for mutation.
- Tenant isolation: attendance queries filter by `company_id`.

## 4. Workflow APIs

- `/api/workflow/requests` and `/api/workflow/requests/:id/*` are generic employee action workflow APIs.
- `/api/workflows/pending` exists as an alias for pending employee actions, not all workflows.
- Role enforcement in generic workflow APIs may not align with domain-specific workflow permissions.
- Mismatch: the UI pending approvals page may list only employee actions but label it generically.
- Superadmin may see more workflows than HRadmin, depending on alias routing.

## 5. Recruitment APIs

- Recruiter role is explicitly blocked from leave management and likely limited to recruitment endpoints.
- Backend uses company scope and candidate ownership, but no explicit cross-tenant tests were executed.
- Mismatch: some recruitment screens might show data from the current company while backend only limits by `company_id`.

## 6. Compliance / Contract APIs

- Compliance-contract endpoints are tenant-scoped for HRadmin and superadmin.
- Legacy compliance endpoints may have a different role mix and could potentially allow manager access if not aligned.
- Mismatch: legacy compliance screens and new contract screens may show different RBAC behavior.

## 7. Notifications APIs

- Notification center endpoints are available to authenticated users with role checks in route handlers.
- Preference APIs use the same `user_id` and `company_id` but duplicates across migrations create schema risk rather than direct RBAC risk.
- Mismatch: both `/api/notifications` and `/api/notifications/center` respond, creating confusion over permission expectations.

## 8. Documents / Reporting APIs

- Enterprise document reporting likely restricts to HRadmin/manager, while legacy documents may allow broader file access.
- Old document upload endpoints may not enforce the same RBAC as new `file_objects` paths.
- Tenant isolation: document access should be tenant-scoped, but archive and download links require verification.

## 9. Superadmin Inconsistent Behavior

- Superadmin is treated as a company-level HR role in many flows, but package-level platform admin checks still exist.
- Some APIs return 403 for superadmin payroll create actions to preserve tenant ownership, which is correct. Other endpoints may allow superadmin to act as if they belong to any company.
- Audit: no full cross-company tenant isolation test was performed, meaning superadmin RBAC is not fully verified.

## 10. Manager / Employee Over-Permission

- Manager can approve direct reports and view team leave/attendance.
- Employee can submit leave and attendance corrections.
- Payroll and recruiter roles are appropriately limited for most admin flows.
- The biggest risk is not over-permission, but inconsistent permission models across old/new APIs.

## 11. Tenant Isolation

- Most APIs are scoped by `company_id` and `user.companyId`.
- No fresh cross-tenant mutation test was executed in this audit.
- Existing QA reports note tenant isolation was only lightly validated for the primary seeded tenant.
- Recommendation: run explicit tenant isolation tests for leave, payroll, compliance, documents, and recruitment.

## 12. Summary

RBAC is not uniformly enforced across legacy and enterprise modules. Tenant scoping is generally present in DB filters, but the older route families and duplicate APIs mean there are likely hidden bypasses. The safe path is to clearly mark legacy endpoints as deprecated and focus new development on enterprise endpoints with consistent role semantics.

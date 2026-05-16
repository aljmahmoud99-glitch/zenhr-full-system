# RBAC + Navigation Security Refactor Report

Generated: 2026-05-15

## Status

**PASS with one compatibility note.**

The RBAC/navigation refactor now prevents unauthorized module exposure in the primary sidebar, quick actions, global search results, and guarded routes. Sensitive governance screens route to a clean access denied page instead of rendering partial pages with forbidden widgets.

## Fixes Applied

- Centralized frontend route visibility through `RoleAccessService.canSeePage()`.
- Filtered sidebar navigation by both role and route permission.
- Filtered global search results and quick actions before display.
- Added a clean `/access-denied` route for blocked protected pages.
- Hardened route guard behavior for employee profile access.
- Added manager employee-profile preflight access validation before rendering profile pages.
- Suppressed noisy 403 toasts for route preflight authorization checks.
- Removed manager exposure to disciplinary governance in frontend navigation and backend permission grants.
- Added backend permission deny-list overlays for high-risk governance exposure from old DB grants.
- Restricted payroll admin exposure to recruitment/compliance governance.
- Restricted employee exposure to employees, reports, compliance, disciplinary, users, and settings screens.
- Kept HR administrative access unchanged.

## Secured Modules

- Employee profiles and employee detail routes.
- Disciplinary management.
- Payroll governance and payroll policies.
- Payroll operations.
- Recruitment.
- Performance workflows.
- Documents and reporting.
- Compliance/contracts.
- Employee actions.
- Legacy workflow navigation.
- Global search result navigation.
- Quick action navigation.

## Employee Restrictions Confirmed

Employees no longer see the following in default navigation or global quick access:

- Payroll operations.
- Payroll governance and policy settings.
- Documents & Reporting administration.
- Performance workflow management.
- Employees directory.
- Reports administration.
- Compliance administration.
- Disciplinary management.
- User/role/company settings.
- Unified approvals center.

Employees retain self-service surfaces such as profile, attendance, leave, forms, own documents, payslips, notifications, overtime, advances, assets, and holidays.

## Manager Restrictions Confirmed

Managers no longer see or receive permission grants for:

- Disciplinary case creation/management.
- Career movement governance.
- Employment status governance.
- Payroll governance/export surfaces outside scoped payroll visibility.
- HR settings and company settings.
- Compliance administration.
- System-wide reports/analytics.

Managers retain team-focused visibility for employees, leave, attendance, overtime, recruitment requests, team performance, forms/documents/assets where scoped, and unified approvals.

## Validation Evidence

- `pnpm.cmd run typecheck`: PASS.
- Angular production build: PASS.
- Backend `/api/healthz`: PASS during RBAC smoke.
- `qa/rbac-navigation-security-smoke.cjs`: PASS.

Smoke evidence file:

- `qa/rbac-navigation-security-results.json`

Key smoke assertions:

- Manager disciplinary create/update/view permissions are false.
- Manager `GET /api/disciplinary` returns 403.
- Manager `POST /api/disciplinary` returns 403.
- HR disciplinary list remains 200.
- Recruiter payroll runs are forbidden.
- Employee payroll policy access is forbidden.
- Payroll admin recruitment/compliance governance permissions are false.

## Compatibility Note

The backend still permits an employee to read their own disciplinary case list (`GET /api/disciplinary` returned 200 for employee). This is retained as a compatibility/self-notification behavior, but disciplinary management is no longer exposed through employee navigation or route access.

If product policy requires employees to have no disciplinary self-view at all, the next minimal patch should block the employee read endpoint or move it behind a separate self-service case acknowledgment endpoint.

## Remaining Architectural Concerns

- RBAC is now materially stricter, but the system still uses a mix of database grants, legacy fallback checks, and frontend route maps. Long-term cleanup should converge them into one canonical permission catalog.
- Some compatibility APIs may still allow self-service reads for historical workflows; these should be reviewed domain by domain before final enterprise hardening.
- Browser-level visual validation for the new access denied transition was not rerun in this small pass; API/build/typecheck validation passed.

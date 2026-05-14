# Cleanup Sprint 7 — Security + Tenant Isolation Hardening

Status: GO

Generated: 2026-05-14

## Executive Summary

Cleanup Sprint 7 focused on proving and hardening tenant isolation, RBAC boundaries, export/download authorization, legacy route wrappers, notification isolation, and browser-level security behavior.

Confirmed result: no tested cross-company leak, employee escalation, manager overreach, generic file/download bypass, notification visibility leak, or payroll/export bypass remains in the validated surfaces.

## Code Changes

- Hardened employee-scoped legacy endpoints in `artifacts/api-server/src/index.ts`.
- Added shared `canAccessEmployeeScoped(...)` guard for employee-owned resources.
- Restricted employee profile read/update/delete by company and role scope.
- Restricted employee document, qualification, and leave balance legacy endpoints by employee scope.
- Restricted qualification update/delete to the parent employee id, preventing child-row mismatch mutations.
- Restricted `POST /api/employees` to HR tenant mutation only.
- Hardened generic file upload/list/download endpoints:
  - employees: own files only
  - managers: direct-report files only
  - HR: company files
  - payroll/recruiter: no generic HR file visibility
  - superadmin: no private company file download
- Added API smoke harness `qa/cleanup-sprint-7-smoke.cjs`.
- Added Chrome/CDP browser security harness `qa/cleanup-sprint-7-browser.cjs`.

## API Security Evidence

Evidence file: `qa/cleanup-sprint-7-results.json`

Result: GO

Validated:

- `/api/healthz` returned 200.
- hr, payroll, manager, employee, recruiter, and admin logins returned 200.
- Employee own profile returned 200.
- Employee access to another employee profile returned 404.
- Employee access to another employee documents returned 404.
- Employee access to another employee leave balances returned 404.
- Employee access to unified approvals returned 403.
- Employee payroll preview returned 403.
- Manager access to non-team employee returned 404.
- Manager unified approvals returned 200.
- Recruiter payroll adjustments returned 403.
- Payroll recruitment mutation returned 403.
- Payroll HR document creation returned 403.
- Recruiter payroll document creation returned 403.

## Tenant Isolation Evidence

Evidence file: `qa/cleanup-sprint-7-tenant-results.json`

Result: GO

Validated:

- Cross-scope employee document create with invalid employee id returned 400.
- Employee profile/document/leave-balance access for another employee returned 404.
- Cross-employee file download attempt returned 403 against real file fixture id `21`.

## Export And Download Security Evidence

Evidence file: `qa/cleanup-sprint-7-export-security-results.json`

Result: GO

Validated:

- Employee payroll export returned 403.
- Manager payroll export returned 403.
- Recruiter payroll export returned 403.
- Recruiter recruitment CSV export returned 200 with downloadable content.
- Employee foreign file download returned 403.
- Employee generic files list was scoped to own employee id.
- Manager generic files list was scoped to direct reports.
- Payroll and recruiter generic file lists returned empty datasets.

## Notification Isolation Evidence

Evidence file: `qa/cleanup-sprint-7-notification-results.json`

Result: GO

Validated:

- HR test notification created successfully.
- Employee did not see HR notification in notification center.
- Employee attempt to mark HR notification as read returned 200 with `updated: 0`, preserving non-leaking compatibility behavior.
- Employee unread count returned 200.
- Legacy `/api/notifications` wrapper returned 200 and remained scoped to the caller.

## Browser Security UAT

Evidence file: `qa/cleanup-sprint-7-browser-results.json`

Result: GO

Validated with Chrome/CDP against the production Angular bundle:

- Employee direct navigation to `/app/approvals` did not expose approval actions.
- Employee documents/reporting self-service route loaded without horizontal overflow.
- Recruiter direct navigation to payroll did not expose sensitive payroll data.
- Recruiter recruitment route loaded.
- Manager and HR unified approvals loaded.
- No critical console errors.
- No unexpected API 500s.
- Dark mode text/background sampling returned readable style values.
- Mobile-width document route had no horizontal overflow.

## Regression Evidence

Evidence file: `qa/cleanup-sprint-7-regression-results.json`

Result: GO

Rerun suites:

- Cleanup Sprint 2 unified approvals/notifications: GO
- Cleanup Sprint 3 leave canonicalization: GO
- Cleanup Sprint 5 payroll truth: GO
- Cleanup Sprint 6 documents/compliance/recruitment handoff: GO

No regression was detected in payroll truth, leave canonicalization, unified approvals/notifications, or document/compliance/recruitment handoff.

## Build And Runtime Evidence

- `pnpm.cmd run typecheck`: passed.
- Angular development build: passed.
- Angular production build: passed with the existing stylesheet budget warning for `layout.component.scss`.
- Backend restarted on `http://localhost:3001`.
- `/api/healthz`: healthy.

## Remaining Limitations

- Browser UAT is security-focused and does not exhaustively click every action button in every module.
- Superadmin behavior remains intentionally conservative: platform admin can read tenant-scoped records through authenticated context where allowed by existing architecture, but private company file download and employee mutation are blocked by the hardened paths.
- Generic `/api/files` now intentionally denies payroll/recruiter visibility. Payroll exports remain available through payroll export endpoints, not the generic HR file route.

## Final Status

Cleanup Sprint 7 is GO.

No confirmed cross-company leak, manager overreach, employee escalation, export/download bypass, notification isolation failure, or regression blocker remains in the tested scope.

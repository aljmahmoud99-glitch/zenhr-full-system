# Phase 11.1 - Final RC Blocker Patch + Security Revalidation

Generated: 2026-05-15

## Decision

**SECURITY PATCH PASS / FULL-UAT API GO / BROWSER SPOT CHECK NOT COMPLETED**

The confirmed release blocker is fixed at the application/API layer:

- Manager own profile: `200`
- Manager direct-report profile: `200`
- Manager unrelated HR employee profile: `404`
- HR same-company employee profile: `200`
- Employee own profile: `200`
- Employee other profile: `404`
- Payroll read behavior: `200`
- Recruiter employee profile access: `404`

Focused evidence: `qa/phase-11-1-results.json`, `qa/phase-11-1-rbac-results.json`.

The full operational UAT API/regression harness was rerun after clearing the in-memory rate limiter and returned **FULL-UAT GO**. Evidence: `qa/full-operational-uat-results.json`.

The Phase 11.1 Chrome/CDP spot harness did **not** complete because the local Chrome process failed to expose its remote debugging port in this Windows environment. This is recorded honestly in `qa/phase-11-1-browser-results.json`. The prior broad browser UAT remains `GO` in `qa/full-operational-uat-browser-results.json`, but the requested Phase 11.1 browser spot rerun itself is not counted as passed.

## Patch Summary

### Employee Profile Scope

File changed: `artifacts/api-server/src/index.ts`

The shared `canAccessEmployeeScoped` helper now:

- Keeps HR full company access.
- Keeps payroll read-only access.
- Keeps recruiter denied.
- Allows managers to read their own employee profile.
- Allows managers to read direct reports only when the target employee is not linked to a privileged/non-employee user role.
- Keeps employees limited to their own profile.

This prevents legacy fixture or data-quality cases where an HR/admin/payroll user is listed as a manager direct report from exposing privileged profiles to managers.

### Enterprise Leave Balance Scope

File changed: `artifacts/api-server/src/leave-notifications.service.ts`

The manager-scoped enterprise leave-balance query now excludes direct-report rows linked to non-employee active user roles. This fixed the same class of employee-scope leakage found during Phase 11.1 related probes.

## Validation Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Typecheck | PASS | `pnpm.cmd run typecheck` |
| Backend health | PASS | `/api/healthz` returned 200 |
| Focused Phase 11.1 security smoke | PASS | `qa/phase-11-1-results.json` |
| Cleanup Sprint 7 security regression | GO | `qa/cleanup-sprint-7-results.json` |
| Full operational UAT API/regression | FULL-UAT GO | `qa/full-operational-uat-results.json` |
| Browser/CDP Phase 11.1 spot check | NOT COMPLETED | `qa/phase-11-1-browser-results.json` |

## Related Scope Probes

Manager probing unrelated HR employee `employeeId=2`:

- `/api/employees/2/qualifications`: `404`
- `/api/employees/2/documents`: `404`
- `/api/employees/2/leave-balances`: `404`
- `/api/leave/management/balances?employeeId=2`: `200`, but returned no rows for employee `2`
- `/api/attendance?employeeId=2`: `200`, but returned no rows for employee `2`

## Full-UAT Status

The refreshed full operational UAT result is **FULL-UAT GO** at the API/regression level:

- Manager unrelated employee profile: `404`
- Employee other profile: `404`
- Payroll, leave, approvals, notifications, recruitment handoff, exports, and infra checks passed.
- Remaining product warning: documents export dataset still returns unsupported/404 and remains classified as `MEDIUM`.

## Remaining Limitation

Chrome/CDP spot validation for this patch could not be completed because local Chrome exited before exposing `/json` on the remote debugging port. Multiple isolated user-data and crashpad-disabling options were attempted. No product API 500 or RBAC failure was observed during this blocked browser harness; it failed before page navigation.

## Final Recommendation

The application-layer RC blocker is fixed and the full operational API UAT is back to **FULL-UAT GO**.

For strict Phase 11.1 signoff, rerun `qa/phase-11-1-browser.cjs` or `qa/full-operational-uat-browser.cjs` in an environment where Chrome/CDP can start successfully. Until that browser spot check is rerun, the Phase 11.1 browser gate remains incomplete rather than passed.

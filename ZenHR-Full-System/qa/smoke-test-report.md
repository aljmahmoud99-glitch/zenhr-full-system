# ZenHR / ZenJO QA Smoke Test Report

Updated: 2026-05-05T15:12:44.604Z
Database URL tested: `postgresql://postgres:123@localhost:5432/zenhr`
Final API/backend status: GO.

The remaining RBAC release blocker was fixed and verified. `/api/reports/payroll-summary` now returns `200` only for `hradmin` and `payrolladmin`, and returns `403` for `superadmin`, `manager`, `employee`, and `recruiter`. No API 500s, request errors, schema errors, or login failures were observed after the change.

Browser UI automation remains unavailable in this Codex session, so this GO status is for API/backend smoke coverage only.

## Code Changes Verified

- `artifacts/api-server/src/index.ts`: restricted `GET /api/reports/payroll-summary` to `hradmin` and `payrolladmin`.
- `artifacts/api-server/src/index.ts`: restricted `GET/POST/PATCH/DELETE /api/salary-components/catalog` to `hradmin` and `payrolladmin`.
- `artifacts/api-server/src/index.ts`: restricted `GET /api/salary-components` to `hradmin` and `payrolladmin` because it exposes the same compensation policy table plus `isReferenced`.
- No database schema, migration, or seed data changes were made.

## Tested Environment

| Item | Result |
|---|---|
| Backend stack | Node.js / Express |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Frontend | Angular |
| Backend path | `artifacts/api-server` |
| Frontend path | `frontend` |
| Backend URL | `http://localhost:3001` |
| Backend listener PID | `28380` |
| Frontend URL from previous run | `http://localhost:5000` |
| Node | `v22.11.0` |
| npm | `10.9.0` via `npm.cmd` |
| pnpm | `10.33.3` |

## Commands Used

```powershell
pnpm.cmd run typecheck
$env:DATABASE_URL='postgresql://postgres:123@localhost:5432/zenhr'; npm.cmd start
Invoke-WebRequest http://localhost:3001/api/healthz
# Inline Node smoke runner against http://localhost:3001
```

Typecheck note: workspace typecheck still fails before reaching this backend patch because of pre-existing duplicate export errors in `lib/api-zod/src/index.ts` (`TS2308`). The backend restarted and the patched routes were exercised successfully.

## Service Startup

| Service | Result |
|---|---|
| Backend | Healthy on `http://localhost:3001`; `/api/healthz` returned 200 |
| Backend errors | No required runtime error signatures found |
| Frontend | Not rerun for this backend-only RBAC fix; previous reachability was `http://localhost:5000` |
| UI automation | Not available in this session |

## Accounts Tested

All accounts used the same seeded password as admin.

| Account | Resolved role | Login |
|---|---|---|
| `admin` | `superadmin` | OK |
| `hr` | `hradmin` | OK |
| `payroll` | `payrolladmin` | OK |
| `manager` | `manager` | OK |
| `employee` | `employee` | OK |
| `recruiter` | `recruiter` | OK |

## API Summary

| Classification | Count |
|---|---:|
| OK | 227 |
| NOT_FOUND | 66 |
| UNAUTHORIZED | 0 |
| FORBIDDEN | 62 |
| SERVER_ERROR | 0 |
| REQUEST_ERROR | 0 |
| OTHER | 5 |
| REDIRECT | 0 |

Failed logins: 0
Server errors: 0
Request errors: 0
Permission concerns: 0

## Results By Role

| Role account | Resolved role | OK | NOT_FOUND | FORBIDDEN | OTHER | SERVER_ERROR |
|---|---|---:|---:|---:|---:|---:|
| `admin` | `superadmin` | 41 | 11 | 7 | 1 | 0 |
| `hr` | `hradmin` | 47 | 11 | 1 | 1 | 0 |
| `payroll` | `payrolladmin` | 39 | 11 | 9 | 1 | 0 |
| `manager` | `manager` | 33 | 11 | 15 | 1 | 0 |
| `employee` | `employee` | 35 | 11 | 14 | 0 | 0 |
| `recruiter` | `recruiter` | 32 | 11 | 16 | 1 | 0 |

## RBAC Assertions

| Account | Role | Endpoint | Expected | Actual | Result |
|---|---|---|---:|---:|---|
| `admin` | `superadmin` | `/api/reports/payroll-summary` | 403 | 403 | PASS |
| `admin` | `superadmin` | `/api/salary-components/catalog` | 403 | 403 | PASS |
| `admin` | `superadmin` | `/api/salary-components` | 403 | 403 | PASS |
| `hr` | `hradmin` | `/api/reports/payroll-summary` | 200 | 200 | PASS |
| `hr` | `hradmin` | `/api/salary-components/catalog` | 200 | 200 | PASS |
| `hr` | `hradmin` | `/api/salary-components` | 200 | 200 | PASS |
| `payroll` | `payrolladmin` | `/api/reports/payroll-summary` | 200 | 200 | PASS |
| `payroll` | `payrolladmin` | `/api/salary-components/catalog` | 200 | 200 | PASS |
| `payroll` | `payrolladmin` | `/api/salary-components` | 200 | 200 | PASS |
| `manager` | `manager` | `/api/reports/payroll-summary` | 403 | 403 | PASS |
| `manager` | `manager` | `/api/salary-components/catalog` | 403 | 403 | PASS |
| `manager` | `manager` | `/api/salary-components` | 403 | 403 | PASS |
| `employee` | `employee` | `/api/reports/payroll-summary` | 403 | 403 | PASS |
| `employee` | `employee` | `/api/salary-components/catalog` | 403 | 403 | PASS |
| `employee` | `employee` | `/api/salary-components` | 403 | 403 | PASS |
| `recruiter` | `recruiter` | `/api/reports/payroll-summary` | 403 | 403 | PASS |
| `recruiter` | `recruiter` | `/api/salary-components/catalog` | 403 | 403 | PASS |
| `recruiter` | `recruiter` | `/api/salary-components` | 403 | 403 | PASS |

All RBAC assertions passed.

## Salary Catalog Review

`/api/salary-components/catalog` is now restricted to `hradmin` and `payrolladmin`. It is not safe public metadata because the backing table can expose compensation policy fields such as `defaultValue`, `formulaExpression`, `calculationType`, `isTaxable`, and `isSscApplicable`. The canonical `/api/salary-components` route was restricted for the same reason.

## Endpoint Matrix

`NOT_FOUND` means the route was not implemented or not mounted at the requested alias. Per the original test instruction, these are recorded as not found rather than API failures.

| Endpoint | Path | admin | hr | payroll | manager | employee | recruiter |
|---|---|---:|---:|---:|---:|---:|---:|
| current-user-active | `/api/auth/me` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| current-user-requested | `/api/me` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| dashboard-summary | `/api/dashboard/summary` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| dashboard-recent-activity | `/api/dashboard/recent-activity` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| admin-companies | `/api/admin/companies` | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| users | `/api/users` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| user-roles | `/api/user-roles` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| roles | `/api/roles` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| permissions | `/api/permissions` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| employees | `/api/employees` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| departments | `/api/departments` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| job-titles | `/api/job-titles` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| org-structure-requested | `/api/org-structure` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| org-nodes-active | `/api/org-nodes` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| job-descriptions | `/api/job-descriptions` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| attendance | `/api/attendance` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| shifts | `/api/shifts` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| leaves-requested | `/api/leaves` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| leave-requests-active | `/api/leave-requests` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| overtime | `/api/overtime` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| holidays-requested | `/api/holidays` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| public-holidays-active | `/api/public-holidays` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| payroll | `/api/payroll` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| payslips | `/api/payslips` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| salary-components | `/api/salary-components` | 403 FORBIDDEN | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| advances-requested | `/api/advances` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| salary-advances-active | `/api/salary-advances` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| documents | `/api/documents` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| assets | `/api/assets` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| compliance-overview | `/api/compliance/overview` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| disciplinary | `/api/disciplinary` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 200 OK | 403 FORBIDDEN |
| resignations | `/api/resignations` | 403 FORBIDDEN | 200 OK | 200 OK | 200 OK | 200 OK | 403 FORBIDDEN |
| clearance | `/api/clearance` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| workflow-career-movements | `/api/workflow/career-movements` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| workflow-salary-changes | `/api/workflow/salary-changes` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| workflow-status-changes | `/api/workflow/status-changes` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| forms-catalog | `/api/forms-catalog` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| reports | `/api/reports` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| config-catalog | `/api/config/catalog` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| config | `/api/config` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| notifications | `/api/notifications` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| notifications-unread-count | `/api/notifications/unread-count` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| activity-logs | `/api/activity-logs` | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND | 404 NOT_FOUND |
| permissions-my-active | `/api/permissions/my` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| companies-active | `/api/companies` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| leave-requests-active-v2 | `/api/leave/requests` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| leave-policies-active | `/api/leave/policies` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| payroll-runs-active | `/api/payroll/runs` | 403 FORBIDDEN | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| payroll-slips-active | `/api/payroll/slips` | 403 FORBIDDEN | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| payroll-my-slips-active | `/api/payroll/slips/my` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| salary-components-catalog-active | `/api/salary-components/catalog` | 403 FORBIDDEN | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| salary-component-definitions-active | `/api/salary-components/definitions` | 403 FORBIDDEN | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| overtime-requests-active | `/api/overtime/requests` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| reports-headcount-active | `/api/reports/headcount` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| reports-payroll-summary-active | `/api/reports/payroll-summary` | 403 FORBIDDEN | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| forms-active | `/api/forms` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| employee-actions-active | `/api/employee-actions` | 400 OTHER | 400 OTHER | 400 OTHER | 400 OTHER | 200 OK | 400 OTHER |
| compliance-items-active | `/api/compliance/items` | 200 OK | 200 OK | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN | 403 FORBIDDEN |
| attendance-dashboard-active | `/api/attendance/dashboard` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |
| overtime-dashboard-active | `/api/overtime/dashboard` | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK | 200 OK |

## Failed And Non-OK Endpoint Notes

### 500 Errors

None observed.

### Request Errors

None observed.

### NOT_FOUND Routes

These requested aliases remain unmounted and returned 404 for every authenticated role:

- `/api/me`
- `/api/permissions`
- `/api/org-structure`
- `/api/leaves`
- `/api/leave-requests`
- `/api/holidays`
- `/api/payroll`
- `/api/payslips`
- `/api/advances`
- `/api/reports`
- `/api/activity-logs`

### OTHER Responses

`/api/employee-actions` still returns 400 for non-employee callers without an `employeeId` query parameter. This is validation behavior and not a release blocker for the payroll-summary RBAC fix.

## Backend Error Monitoring

The smoke runner and log scan checked for: missing columns, missing relations, not-null violations, duplicate key violations, `cannot read properties of undefined`, `Internal server error`, and `DrizzleQueryError`. No matches were found.

## Recommended Follow-Up

1. Resolve the pre-existing `lib/api-zod` duplicate export typecheck errors so workspace typecheck can be used as a clean gate.
2. Run browser UI automation when a browser driver/tool is available to confirm role menus and screens reflect the backend RBAC.
3. Consider auditing other sensitive payroll/HR routes for `superadmin` access now that the platform-admin model is clarified.

## Deliverables

| File | Purpose |
|---|---|
| `qa/api-results.json` | Fresh full API result matrix and RBAC assertions after the fix |
| `qa/backend-errors.log` | Backend/API error signature summary after the fix |
| `qa/frontend-errors.log` | Frontend automation limitation from prior QA pass |
| `qa/smoke-test-report.md` | This report |

No database schema was changed. No migrations were modified. No data was deleted or dropped.

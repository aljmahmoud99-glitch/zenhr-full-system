# Phase D - Leave + Notifications Engine

Status: **GO**

The migration `migrations/phase-d-leave-notifications.sql` was manually applied by the user, then Phase D was validated against the persisted local database and fresh backend runtime.

## Files Changed

- `migrations/phase-d-leave-notifications.sql`
- `artifacts/api-server/src/leave-notifications.service.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/payroll-run.service.ts`
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/core/services/role-access.service.ts`
- `frontend/src/app/features/leave-management/*`
- `frontend/src/app/features/notifications/*`
- `qa/phase-d-leave-notifications-smoke.cjs`
- `qa/phase-d-leave-notifications-browser.cjs`
- `qa/phase-d-leave-notifications-api-results.json`
- `qa/phase-d-leave-notifications-ui-results.json`

## Runtime Fixes During Validation

- Removed an invalid `employees.user_id` assumption from leave employee scoping.
- Fixed approval persistence by casting the leave request status/current approval step update parameters.
- Hardened the audit endpoint so invalid `leaveRequestId` returns `400` instead of a database error.
- Added notification `mark unread` support and wired it into the notification center UI.
- Repaired corrupted Arabic literals in the new Leave Management and Notifications frontend files.
- Added a Chrome/CDP UAT harness that serves the production build with explicit UTF-8 content types.

## API Validation

`qa/phase-d-leave-notifications-smoke.cjs` result: **GO**

Validated:

- Health check and role logins: hr, employee, manager, payroll, recruiter, admin.
- Leave types: annual, sick, emergency, unpaid, and custom type creation.
- Legacy and enterprise leave balances.
- Annual half-day leave request creation.
- Sick hourly leave request creation.
- Emergency and unpaid leave request creation.
- Conflict validation.
- Manager approval, HR approval, rejection, request changes, cancellation.
- Leave request listing and audit history.
- Notifications list, test notification, read/unread, preferences, approval reminders.
- RBAC: employee own scope, recruiter forbidden, payroll mutation forbidden, payroll impact visible.
- Payroll preview unpaid leave deduction.
- Payroll run calculation, payslip leave snapshot, and locked-run recalculation protection.

## Payroll Integration

Approved unpaid leave affected payroll preview and payroll run output:

- Preview `leaveDeduction`: `29.032`
- Payslip `otherDeductions`: includes the leave deduction
- Payslip snapshot includes `leaveImpact`
- Locked payroll run recalculation returned `409`

Paid annual leave was approved in the same month and did not create an extra deduction beyond approved unpaid leave impact.

## Browser UAT

`qa/phase-d-leave-notifications-browser.cjs` result: **PASS**

Validated:

- `/app/leave-management` renders for employee and HR.
- `/app/notifications` renders for employee.
- Arabic RTL labels are clean UTF-8 with no mojibake detected by the harness.
- No raw workflow enum leakage detected.
- Dark-mode sampled panels are readable.
- Leave request form controls render.
- Notification test, mark-read, and mark-unread actions execute from the browser.
- Mobile leave page and tablet notifications page have no horizontal overflow.
- No critical console errors.

## Build Validation

- `pnpm.cmd run typecheck`: **PASS**
- Angular development build: **PASS**
- Angular production build: **PASS**
- Backend fresh runtime: **PASS**
- `/api/healthz`: **PASS**

Production build retains the pre-existing `layout.component.scss` budget warning; it is non-blocking and not introduced by Phase D.

## RBAC And Tenant Notes

RBAC smoke passed for the available seeded users:

- Employee can access own leave requests only.
- Manager approval path validated for seeded manager/team relationship.
- HR can complete approvals and manage leave types.
- Payroll can view payroll impact and cannot create leave requests.
- Recruiter is forbidden from leave management APIs.
- Superadmin behavior remains platform-scoped as designed by the existing architecture.

Company scoping is enforced in the Phase D queries through `company_id` on leave types, requests, balances, impacts, notifications, preferences, and audit logs. No cross-company leakage was observed in the local seeded-company smoke.

## Final Status

**Phase D Leave + Notifications Engine is GO.**

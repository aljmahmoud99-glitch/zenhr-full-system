# Cleanup Sprint 3 - Leave Consolidation Report

Generated: 2026-05-14

## Status

GO.

Enterprise leave-management is now the operational leave source of truth. Legacy `/api/leave/*` routes remain available as compatibility wrappers, but new request creation, approval, cancellation, balance reads, and payroll-impact behavior now route through or read from the enterprise leave model.

## Files Changed

- `artifacts/api-server/src/index.ts`
- `frontend/src/app/core/services/role-access.service.ts`
- `frontend/src/app/features/leave/leave.component.ts`
- `qa/cleanup-sprint-3-smoke.cjs`
- `qa/cleanup-sprint-3-browser.cjs`
- `qa/cleanup-sprint-3-results.json`
- `qa/cleanup-sprint-3-leave-results.json`
- `qa/cleanup-sprint-3-payroll-results.json`
- `qa/cleanup-sprint-3-rbac-results.json`
- `qa/cleanup-sprint-3-browser-results.json`

## Backend Consolidation

Legacy compatibility endpoints now use enterprise leave behavior:

- `GET /api/leave/types` returns `enterprise_leave_types` in legacy-compatible shape.
- `GET /api/leave/policies`, `POST /api/leave/policies`, `PUT /api/leave/policies`, and `PATCH /api/leave/policies/:id` read/write `leave_accrual_policies` and `enterprise_leave_types`, not the old standalone legacy policy path.
- `GET /api/leave/balances`, `GET /api/leave/balances/:employeeId`, and `GET /api/leave/me/balances` return enterprise-derived balance values.
- `POST /api/leave/requests` and `POST /api/leave/me/requests` map legacy leave type ids/codes to enterprise leave types and forward creation into `/api/leave/management/requests`.
- Legacy approve/reject/cancel endpoints forward into `/api/leave/management/requests/:id/*`.
- Unmapped legacy leave types now fail safely with `400` instead of creating payroll-incompatible requests.

## Payroll Truth

Validated unpaid leave path:

- Created a leave request through legacy employee self-service endpoint.
- The request was persisted as enterprise leave.
- Unified approvals saw the request.
- HR approved both enterprise approval steps through legacy compatibility endpoint.
- Enterprise audit rows were created.
- Enterprise `leave_payroll_impacts` created a payroll-impact row.
- Payroll preview for the target employee/month changed from `leaveDeduction: 0.000` to `leaveDeduction: 34.432`.
- Payroll policy snapshot included `leaveImpact.days = 1`.

No duplicate legacy balance/payroll mutation path was used.

## Frontend / Navigation

- HR/admin navigation now points to `/app/leave-management` as the primary leave entry.
- Manager team leave navigation now points to `/app/leave-management`.
- Employee navigation uses `/app/leave-management` as the primary leave center.
- `/app/leave` remains reachable as an employee compatibility route.
- Leave compatibility Arabic translations were cleaned with a UTF-8-safe override map.

## Validation Evidence

- Backend health: PASS.
- Role logins: PASS for `hr`, `payroll`, `manager`, `employee`, `recruiter`, `admin`.
- Typecheck: PASS.
- Angular development build: PASS.
- Angular production build: PASS, with existing `layout.component.scss` budget warning only.
- API smoke: PASS, see `qa/cleanup-sprint-3-results.json`.
- Leave smoke: PASS, see `qa/cleanup-sprint-3-leave-results.json`.
- Payroll smoke: PASS, see `qa/cleanup-sprint-3-payroll-results.json`.
- RBAC smoke: PASS, see `qa/cleanup-sprint-3-rbac-results.json`.
- Browser/CDP UAT: PASS, see `qa/cleanup-sprint-3-browser-results.json`.

## RBAC Results

- Recruiter legacy leave creation: `403`.
- Employee payroll-impact read: `403`.
- Employee unified approvals access: `403`.
- Payroll admin compatibility policy update: `200`, intentionally allowed for payroll/HR policy operations.

## Tenant Isolation

All validated endpoints used authenticated `companyId` scoping. Legacy compatibility endpoints do not accept caller-provided company override for source-of-truth operations.

## Remaining Notes

- Legacy route implementations still exist later in `index.ts`, but the compatibility wrappers are registered earlier and intercept the active legacy paths. No legacy tables were deleted.
- Existing historical legacy requests with unmapped leave types remain readable, but new unmapped legacy requests are blocked.
- No database migration was created or applied in this sprint.

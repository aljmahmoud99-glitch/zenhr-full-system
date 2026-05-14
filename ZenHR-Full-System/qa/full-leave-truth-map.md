# Full Leave Truth Map

Generated: 2026-05-13

## Overview

The system contains two active leave lifecycles:
- Legacy leave: `/api/leave/*`, `leave_types`, `leave_policies`, `leave_balances`, `leave_requests`.
- Enterprise leave: `/api/leave/management/*`, `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_payroll_impacts`, `leave_request_audit_logs`.

Both write into the shared `leave_requests` table, but they use different type and policy ownership.

---

## 1. Legacy Leave Request

- Created where: `/app/leave`, `/api/leave/requests`, `/api/leave/me/requests`.
- Approval path: direct status update via `/api/leave/requests/:id/approve` or `/reject`.
- Stored where: `leave_requests`, `leave_balances`, `leave_types`, `leave_policies`.
- Payroll impact: unreliable. Payroll only deducts leave when `leave_requests.leave_type` matches `enterprise_leave_types.id` and `affects_payroll=true`.
- Notifications: likely legacy notification helpers; not tied to enterprise leave audit.
- Audit: weak; no standardized `leave_request_audit_logs` entry unless enterprise flow is used.
- Calendar/reports: visible in legacy leave list; may not appear in enterprise leave dashboard.

### Risks
- Duplicate leave types and policies can cause mismatched balances.
- Legacy requests may not be deducted from payroll even when approved.
- Legacy route still supports creation and approval, making deprecation risky.

## 2. Enterprise Leave Request

- Created where: `/app/leave-management`, `/api/leave/management/requests`.
- Approval path: `leave_request_approval_steps` with manager and HR roles, plus `leave_request_audit_logs`.
- Stored where: `leave_requests`, `enterprise_leave_types`, `leave_accrual_policies`, `leave_request_approval_steps`, `leave_request_audit_logs`, `leave_payroll_impacts`.
- Payroll impact: yes, approved enterprise unpaid leave is aggregated by `approvedUnpaidLeaveImpactForEmployee`.
- Notifications: generated through leave management notification helpers.
- Audit: yes, enterprise flow writes audit log rows.
- Calendar/reports: enterprise dashboard claims payroll impact and audit data.

### Risks
- Shared `leave_requests` means legacy and enterprise requests can collide on status and type interpretation.
- `leave_balances` updates may cross wrong policy via mapping by leave code.

## 3. Leave Balance

- Updated where: `refreshBalanceForRequest` in `leave-notifications.service.ts` and legacy policy balance logic.
- Stored where: `leave_balances`.
- Behavior: attempts to map enterprise leave types to legacy `leave_policies` by code and update `used_days` or `pending_days`.
- Risk: inaccurate balance if legacy `leave_policies` do not match enterprise codes or if multiple policy rows exist.

## 4. Leave Payroll Impact

- Created where: enterprise leave approval path in `leave-notifications.service.ts` via `createLeavePayrollImpact`.
- Stored where: `leave_payroll_impacts`.
- Consumed where: `PayrollRunService` does not read this table directly; instead it recomputes impact from `leave_requests` joined to `enterprise_leave_types`.
- Appears on payslip: yes if payroll deduction is computed.
- Appears in reports: yes in leave management payroll-impact dashboard.

### Risk
- The deduplicated payroll path means `leave_payroll_impacts` is a side table, not the canonical amount source.

## 5. Leave Notifications

- Triggered where: enterprise leave management routes, legacy leave mutation routes.
- APIs: `/api/leave/management/dashboard`, `/api/leave/management/audit`, `/api/leave/management/payroll-impact`.
- Notification backends: `notifyDirectManager`, `notifyEmployee`, `notifyRole` from `notification.service.js`.
- Conflict: legacy leave notifications are likely separate from enterprise management dashboard semantics.

## 6. Duplicate Leave Types / Policies

- Old screen: `/app/leave`, `/api/leave/types`, `/api/leave/policies`.
- New screen: `/app/leave-management`, `/api/leave/management/types`, `/api/leave/management/requests`.
- Canonical: enterprise leave should be canonical.
- Legacy duplicate: old APIs still active and write same `leave_requests` rows.
- Risk level: high.

## 7. Approved Leave That Payroll Ignores

- Any approved legacy leave request whose `leave_type` is not an `enterprise_leave_types.id`.
- Any enterprise leave type without `affects_payroll=true`.
- Any leave request that updates `leave_balances` but has a non-matching code.

## 8. Approvals Without Audit

- Legacy leave approvals do not consistently insert rows into `leave_request_audit_logs`.
- Enterprise leave approvals do create audit rows, but there is no guarantee all old request updates are covered.

## 9. Screens Showing Different Data

- `/app/leave` may show legacy leave data and old balances.
- `/app/leave-management` shows enterprise data and payroll impact.
- Users can be confused by two active leave dashboards representing different policies.
- The system has no explicit migration or warning banner on the legacy screen.

## 10. Recommendation

- Keep `/app/leave-management` and `enterprise_leave_types` as canonical.
- Redirect `/app/leave` to a read-only self-service view or retire it.
- Add a compatibility layer to map legacy leave types to enterprise leave types during transition.
- Ensure payroll consumes only one agreed leave source-of-truth.

# Cleanup Sprint 2 - Unified Approvals + Notification Canonicalization

Status: GO for Sprint 2 scope.

Generated: 2026-05-14

## Summary

Cleanup Sprint 2 added a canonical approval projection and normalized notification-center behavior without replacing existing domain workflow tables. Legacy notification endpoints remain available as compatibility wrappers.

## Files Changed

- `artifacts/api-server/src/index.ts`
  - Added `/api/approvals/pending`, `/api/approvals/history`, and `/api/approvals/:domain/:id/action`.
  - Added notification center wrapper helpers for read, unread, read-all, archive, unread count, and preferences.
  - Preserved legacy notification endpoints as wrappers.
  - Tightened pending leave projection to exclude cancelled/non-pending requests.
- `artifacts/api-server/src/notification.service.ts`
  - Added unread notification dedupe guard by recipient, type, company, entity type, and entity id.
- `frontend/src/app/features/approvals/approvals.component.ts`
  - Added unified approval center UI at `/app/approvals`.
- `frontend/src/app/app.routes.ts`
  - Registered `/app/approvals`.
- `frontend/src/app/core/services/role-access.service.ts`
  - Added approval screen access and nav entries for HR, payroll, manager, and recruiter.
- `frontend/src/app/features/notifications/notifications.component.ts`
  - Switched read/unread/archive/preferences calls to `/api/notifications/center/*`.
- `frontend/src/app/layout/layout.component.ts`
  - Switched topbar notification calls to canonical center endpoints.
- `migrations/cleanup-sprint-2-notification-preferences.sql`
  - Additive-only schema normalization migration for notification preferences. Not auto-applied.
- `qa/cleanup-sprint-2-smoke.cjs`
- `qa/cleanup-sprint-2-browser.cjs`

## Approval Coverage

Unified pending approvals now project these domains:

- `employee_action`
- `leave`
- `payroll_adjustment`
- `attendance_correction`
- `recruitment`
- `performance`
- `compliance_contract`

The action wrapper delegates to existing domain APIs. Domain workflow tables remain the source of truth.

## Notification Canonicalization

Canonical endpoint family:

- `/api/notifications/center`
- `/api/notifications/center/unread-count`
- `/api/notifications/center/read-all`
- `/api/notifications/center/:id/read`
- `/api/notifications/center/:id/unread`
- `/api/notifications/center/:id/archive`
- `/api/notifications/center/preferences`

Legacy endpoints still work:

- `/api/notifications`
- `/api/notifications/unread-count`
- `/api/notifications/read-all`
- `/api/notifications/:id/read`
- `/api/notifications/:id/unread`
- `/api/notifications/:id/archive`
- `/api/notifications/preferences`

## Validation

- Backend health: PASS
- Unified approvals API smoke: PASS
- Approval action wrapper smoke: PASS
- Notification center and legacy wrapper smoke: PASS
- Notification preferences smoke: PASS
- RBAC smoke: PASS
- Browser UAT for `/app/approvals`: PASS
- Dark mode readable sample: PASS
- Responsive no horizontal overflow desktop/mobile: PASS
- Typecheck: PASS
- Angular development build: PASS
- Angular production build: PASS with existing layout budget warning only.

## Regression Notes

- Cleanup Sprint 1 smoke was rerun as a guardrail. Performance promotion and attendance correction remained working.
- That legacy guardrail still reports `attendancePayrollImpact` as PARTIAL, matching the existing known partial behavior. No Sprint 2 change touched payroll calculation logic.
- Leave-management canonical payroll behavior remained working in the guardrail.

## Known Limitations

- Recruiter unified inbox returns 200 and is scoped to recruitment approvals only, but no pending recruiter-step approvals existed in the local seed data.
- `cleanup-sprint-2-notification-preferences.sql` was created but not applied automatically, per additive migration rules. Runtime compatibility handles the current pre-normalized table shape.
- Existing Arabic mojibake in older nav labels was not remediated in this sprint because the requested scope was approval/notification unification.

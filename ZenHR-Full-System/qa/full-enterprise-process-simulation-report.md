# Full Enterprise Process Simulation Report

Generated: 2026-05-06T12:42:37.978Z

## Final Status

GO

## Company

- ID: 4
- Name: Nexora Digital Solutions
- Arabic: شركة نيكسورا للحلول الرقمية

## Operational Activity Generated

- Pre-employment records: 5
- Probation evaluations: 15
- Attendance corrections/anomalies: 9
- Leave requests: 15
- Overtime requests: 14
- Salary advances: 4
- Disciplinary cases: 3
- Career/salary/status workflows: 11
- Resignations: 2
- Clearance workflows: 1
- Documents/files: 18
- Notifications: 90
- Dry-run emails: 22
- Background jobs: 22

## Phase Results

- Phase 1 - Pre-employment, recruitment and onboarding: PASS {"records":5,"evaluations":15}
- Phase 2 - Attendance and shift anomalies: PASS {"addedAttendanceRecords":4,"corrections":4}
- Phase 3 - Leave management: PASS {"addedLeaveRequests":4}
- Phase 4 - Salary advances: PASS {"requests":4,"viaApi":true}
- Phase 5 - Disciplinary actions: PASS {"records":3,"mixedStatuses":true}
- Phase 6-8 - Career, salary and status changes: PASS {"workflows":6,"viaApi":true}
- Phase 9-10 - Resignations and clearance: PASS {"resignations":2,"approvedClearanceStarted":true,"pending":true}
- Phase 11-13 - Documents, notifications, emails and jobs: PASS {"files":6,"notifications":36,"emails":14,"jobs":14}
- Phase 14-15 - Dashboard and end-to-end validation: PASS {"apiChecks":16}

## Dashboard Verification

Live API validation covered HR dashboard, manager dashboard, employee dashboard, attendance dashboard, compliance overview, workflow queues, payroll runs, salary advances, resignations, clearance, notifications, and pre-employment.

## RBAC Verification

- Manager payroll summary remained blocked with 403.
- Employee payroll summary remained blocked with 403.
- Payroll can read payroll/advance data.
- HR can read HR operations data.

## Issues Fixed

Pre-employment was a stub/in-memory module. It now persists records and probation evaluations through the additive migration and backend route update documented in qa/full-enterprise-fixes.md.

## Remaining Risks

- Browser click-through was not performed from this script; validation is API/database backed.
- Email sending remains dry-run, matching the configured system behavior.
- Shift templates remain in-memory in the current backend; attendance anomalies were persisted through attendance/correction records.

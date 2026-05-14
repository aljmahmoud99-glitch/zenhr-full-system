# Full Attendance Truth Map

Generated: 2026-05-13

## Overview

Attendance functionality is split between live biometric clock-in/out and legacy/correction-based attendance processing. Package A adds attendance intelligence and payroll attendance surfaces, but canonical payroll still relies on legacy overtime records.

---

## 1. Normal Check-In / Check-Out

- Trigger screen: `/app/attendance`.
- Trigger API: `/api/attendance/clock-in`, `/api/attendance/clock-out`.
- Stored where: `attendance_records`.
- Enforcement: geofence and biometric verification are required on live clock-in/out.
- Proof fields: attendance biometric records and possible device IDs are stored in associated tables.
- Payroll impact: direct attendance data is not consumed. Hourly worked hours may be derived from attendance rules.
- Reports: attendance summary, map, location list.

## 2. Biometric Enforcement

- Enforced where: `POST /api/attendance/clock-in` and `clock-out` handlers.
- Verified by: `validateAttendanceGeofence`, `verifyAttendanceBiometricAssertion` in backend.
- Bypass: not on live clock-in/out.
- Evidence: code confirms 400 error when biometric proof is missing on live clock-in.

## 3. Geofence Enforcement

- Enforced where: live attendance path.
- Verified by: validation functions called in clock-in/out handlers.
- Bypass: correction workflow can create records without any geofence data.

## 4. Correction Requests

- Trigger screen: correction request UI under attendance module.
- Trigger API: `/api/attendance/me/requests`, `/api/attendance/requests`, approval APIs.
- Stored where: `attendance_corrections`, `attendance_records`.
- Final effect: approved corrections insert or update `attendance_records`.
- Proof: not guaranteed. Approved correction can create attendance without biometric proof.
- Payroll impact: corrected records can change worked hours but the effect is not clearly audited.

## 5. Shifts

- Trigger screen: `/app/shifts`, `/app/payroll-attendance` shift scheduler.
- Trigger API: `/api/shifts`, `/api/shift-scheduler/*`.
- Stored where: `attendance_shift_patterns`, `attendance_schedules`, legacy shift tables.
- Use: for planned schedules and attendance rules.
- Conflict: shift scheduler is separate from live attendance and payroll attendance surfaces.

## 6. Overtime

- Trigger screen: `/app/overtime`, possibly payroll attendance.
- Trigger API: `/api/overtime`, `/api/overtime/reports`.
- Stored where: `overtime_requests`.
- Approved overtime: consumed by payroll run.
- Conflict: overtime is the canonical payroll-attendance pay source, while attendance intelligence tables are not.

## 7. Violations

- Trigger screen: payroll attendance and intelligence dashboards.
- Trigger API: `/api/attendance-intelligence/*`.
- Stored where: `attendance_violations`, `attendance_payroll_impacts`.
- Consumption: not used by canonical payroll run.
- Effect: used for reporting and manual review.

## 8. Attendance Payroll Impacts

- Stored where: `attendance_payroll_impacts`.
- Created where: payroll attendance intelligence workflows.
- Consumed by payroll run: no.
- Appears on payslip: no.
- Appears in reports: yes in attendance/payroll attendance reports.
- Risk: table claims payroll impact but is not reflected in actual payroll.

## 9. Bypass Paths

- Correction workflow can bypass live biometric and geofence enforcement.
- Legacy overtime approvals can alter pay without attendance intelligence.
- Old APIs may still create attendance if new route protections are not enforced.

## 10. Records Without Proof

- Approved correction-created attendance records likely lack biometric proof.
- Live attendance records have checks, but corrective entries are treated as exceptions.
- Recommendation: classify them explicitly and show them separately in attendance reports.

## 11. Payroll Impact Not Consumed

- `attendance_payroll_impacts` is not read by `PayrollRunService`.
- `attendance_violations` is not read by payroll run.
- Hourly worked hours may be derived from attendance policy but the direct attendance/payroll event tables are orphaned.

## 12. Old API / Legacy Paths

- Legacy overtime and attendance correction APIs remain in use.
- Package A attendance intelligence is newer and not canonical for payroll.
- Users can interact with both surfaces without a clear single source-of-truth.

## 13. Recommendation

- Keep `attendance_records` as the truth for actual punches.
- Treat corrections as audited exceptions, not normal punches.
- Either integrate `attendance_payroll_impacts` into payroll or label it as analysis-only.
- Merge or clearly separate shift scheduling from live attendance operations.

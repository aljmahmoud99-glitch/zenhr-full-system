# Full Payroll Truth Map

Generated: 2026-05-13

## Overview

The canonical payroll engine is `PayrollRunService` in `artifacts/api-server/src/payroll-run.service.ts`. It is the authoritative source for payroll run calculation and payslip creation.

### What payroll run currently consumes
- Active employee salary components via `employee_salary_components` and `salary_components`.
- Approved legacy overtime requests in `overtime_requests`.
- Approved salary advances in `salary_advances`.
- Approved unpaid leave impact calculated from `leave_requests` joined to `enterprise_leave_types`.
- Payroll policy context from `resolvePayrollPolicy`.

### What payroll run currently ignores
- `payroll_adjustments` and `payroll_adjustment_installments`.
- `attendance_payroll_impacts`.
- `payroll_audit_events` as calculation input.
- `enterprise_documents` or contract-derived payroll metadata.

---

## 1. Salary Components

- Created where: salary component management screens, `/api/payroll/salary-components`, `/api/salary-components`.
- Approved where: no distinct approval workflow; components are active/inactive by role.
- Stored where: `salary_components`, `employee_salary_components`.
- Consumed by PayrollRunService: yes, via effective assignments.
- Appears on payslip: yes, as component breakdown snapshot.
- Appears in reports/exports: yes for payroll reports, if report UI consumes payslip data.

## 2. Salary Changes

- Created where: employee action workflows, salary change forms, possibly performance recommendation conversions.
- Approved where: workflow approval path in `employee_actions` or performance workflows.
- Stored where: `employee_actions`, `employees.basic_salary`, `employee_salary_components`.
- Consumed by PayrollRunService: yes if `employees.basic_salary` or active salary component assignments reflect the change.
- Appears on payslip: yes when calculation uses updated component values.
- Appears in reports/exports: indirect via payroll runs.

## 3. Payroll Adjustments

- Created where: `/app/payroll-attendance`, `/api/payroll-adjustments`.
- Approved where: `payroll_adjustment_approvals` path.
- Stored where: `payroll_adjustments`, `payroll_adjustment_types`.
- Consumed by PayrollRunService: no.
- Appears on payslip: not currently unless UI/engine manually merges the record.
- Appears in reports/exports: yes in payroll adjustment list/reports, but not in payslip totals.

## 4. Recurring Adjustments / Installments

- Created where: `/api/payroll-adjustments` with recurrence types and installments metadata.
- Approved where: same payroll adjustment approval process.
- Stored where: `payroll_adjustments`, `payroll_adjustment_installments`.
- Consumed by PayrollRunService: no, calculations use `salaryAdvances` but not payroll adjustment installments.
- Appears on payslip: no direct line item in canonical payslip.
- Appears in reports/exports: yes for adjustment tracking; not for payroll net salary.

## 5. Overtime

- Created where: `/api/overtime`, `/app/overtime` legacy screens.
- Approved where: overtime request approval process.
- Stored where: `overtime_requests`.
- Consumed by PayrollRunService: yes, approved overtime is aggregated and paid with hourly rates.
- Appears on payslip: yes as `overtimeEarnings` and overtime hours snapshot.
- Appears in reports/exports: yes if payroll run summary includes overtime earnings.

## 6. Attendance Payroll Impacts

- Created where: `/api/attendance-intelligence/*`, `/api/payroll-attendance/*`.
- Approved where: approval engines or automatic detection.
- Stored where: `attendance_payroll_impacts`, `attendance_violations`.
- Consumed by PayrollRunService: no.
- Appears on payslip: no.
- Appears in reports/exports: yes in attendance/payroll attendance reports.

## 7. Leave Unpaid Deductions

- Created where: `/api/leave/management/requests` for enterprise leave.
- Approved where: leave approval workflow in `leave_request_approval_steps`.
- Stored where: `leave_requests`, `leave_payroll_impacts`.
- Consumed by PayrollRunService: yes indirectly via `approvedUnpaidLeaveImpactForEmployee` joining to `enterprise_leave_types`.
- Appears on payslip: yes as `otherDeductions` when leave impact amount is present.
- Appears in reports/exports: yes in leave payroll-impact reports, not necessarily in legacy leave report exports.

## 8. Biometric Attendance

- Created where: `/api/attendance/clock-in`, `/api/attendance/clock-out`.
- Approved where: live biometric verification is enforced on the clock-in/out APIs.
- Stored where: `attendance_records`, `attendance_trusted_devices`, `attendance_biometric_audit_logs`.
- Consumed by PayrollRunService: no direct record, except hourly worked hours for policy-based employees.
- Appears on payslip: only indirectly if `workedHoursForEmployee` uses the attendance rules.
- Appears in reports/exports: yes in attendance summary reports; pay implication route incomplete.

## 9. Absences / Lateness

- Created where: attendance intelligence and shift rule processing.
- Approved where: attendance violation review or automatic rules.
- Stored where: `attendance_violations`, `attendance_records`.
- Consumed by PayrollRunService: no direct table consumption.
- Appears on payslip: no direct payslip field.
- Appears in reports/exports: yes in attendance analytics/violation reports.

## 10. Advances

- Created where: payroll advance screens and APIs.
- Approved where: salary advance approval flow.
- Stored where: `salary_advances`.
- Consumed by PayrollRunService: yes, remaining balance installments are deducted.
- Appears on payslip: yes as `advanceDeduction`.
- Appears in reports/exports: yes in payroll advance reports.

## 11. Contracts / Employment Type

- Created where: `/api/compliance-contracts/*`, recruitment conversion, manual employee updates.
- Approved where: contract create/renew approval.
- Stored where: `employee_contracts`, `contract_types`, `employees.employment_type`.
- Consumed by PayrollRunService: indirectly via `resolvePayrollPolicy` and `employees.employmentType`.
- Appears on payslip: no direct contract field; employment type influences calculation rules.
- Appears in reports/exports: yes in contract reports and payroll policy snapshots.

## 12. Payroll Policies

- Created where: `/api/payroll-policies`, payroll policy UI.
- Approved where: payroll policy save path with HR/payroll role enforcement.
- Stored where: `payroll_policies`, `system_configurations`/policy snapshot tables.
- Consumed by PayrollRunService: yes, policy rules determine salary basis, working days, and overtime.
- Appears on payslip: yes in `payrollPolicySnapshot` and calculation details.
- Appears in reports/exports: yes in payroll run metadata.

---

## Summary

The payroll truth is partially complete. The canonical run engine is sound for core salary, overtime, advances, and enterprise unpaid leave. It is not complete for Bundle A payroll adjustments or attendance-payroll impact tables. A cleanup phase must either make these ignored tables visible as non-payroll or fully integrate them.

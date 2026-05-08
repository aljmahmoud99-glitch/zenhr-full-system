# Enterprise Simulation Report

Generated: 2026-05-06T12:20:13.807Z

## Final Status

GO

## Company

- ID: 4
- English: Nexora Digital Solutions
- Arabic: شركة نيكسورا للحلول الرقمية
- Industry: Technology / Software
- Country/City: Jordan / Amman
- Subscription: Pro / active

## Demo Password

All created tenant users use: `Nexora@1234`

## Created Users

- nexora.hr (hr)
- nexora.payroll (payroll)
- nexora.manager1 (manager1)
- nexora.manager2 (manager2)
- nexora.manager3 (manager3)
- nexora.manager4 (manager4)
- nexora.employee01 (employee01)
- nexora.employee02 (employee02)
- nexora.employee03 (employee03)
- nexora.employee04 (employee04)
- nexora.employee05 (employee05)
- nexora.employee06 (employee06)
- nexora.employee07 (employee07)
- nexora.employee08 (employee08)
- nexora.employee09 (employee09)
- nexora.employee10 (employee10)
- nexora.employee11 (employee11)
- nexora.employee12 (employee12)
- nexora.employee13 (employee13)
- nexora.employee14 (employee14)
- nexora.employee15 (employee15)

## Departments

- ENG: Engineering, managerEmployeeId=12
- HR: Human Resources, managerEmployeeId=10
- FIN: Finance, managerEmployeeId=11
- OPS: Operations, managerEmployeeId=13
- SUP: Customer Support, managerEmployeeId=15
- SAL: Sales, managerEmployeeId=14

## Operational Summary

- Users/employees: 21
- Attendance records: 441 across 21 workdays
- Leave requests: 11
- Overtime requests: 14
- Payroll gross/net: 35738.000 / 32958.525 JOD
- Workflows: 5
- Notifications: 21
- Files/documents: 12 file objects / 12 documents
- Background jobs: 8
- Dry-run emails: 8

## Phase Results

- Phase 1 - Company setup: PASS {"companyId":4,"departments":6,"jobTitles":14}
- Phase 2 - Employee lifecycle: PASS {"employees":21,"users":21}
- Phase 3 - Attendance simulation: PASS {"workdays":21,"records":441,"statuses":{"present":311,"late":52,"absent":26,"remote":26,"partial":26}}
- Phase 4 - Leave management: PASS {"total":11,"approved":7,"pending":3,"rejected":1}
- Phase 5 - Overtime: PASS {"total":14,"approved":10,"pending":2,"rejected":2}
- Phase 6 - Payroll: PASS {"payrollRunId":2,"employeeCount":21,"totalGross":"35738.000","totalNet":"32958.525"}
- Phase 7 - Workflow engine: PASS {"workflows":5}
- Phase 8 - Notifications: PASS {"notifications":21}
- Phase 9 - File storage: PASS {"filesCreated":12,"documents":12}
- Phase 10 - Background jobs / emails: PASS {"jobs":8,"emails":8}
- Phase 11/12 - Manager and employee activity: PASS {"assets":26,"managers":4,"selfServiceEmployees":15}

## Validation

Validation used the live backend API at `http://localhost:3001` against the local PostgreSQL database. Browser click-through was not performed in this simulation run because no callable browser automation tool is exposed in the current toolset.

- final-login:hr: status 200, ok=true
- final-login:payroll: status 200, ok=true
- final-login:manager1: status 200, ok=true
- final-login:employee01: status 200, ok=true
- dashboard: status 200, ok=true
- employees: status 200, ok=true
- attendance: status 200, ok=true
- leave: status 200, ok=true
- overtime: status 200, ok=true
- workflows: status 200, ok=true
- notifications: status 200, ok=true
- payrollRuns: status 200, ok=true
- payrollSlips: status 200, ok=true
- payrollSummary: status 200, ok=true
- managerEmployees: status 200, ok=true
- managerPayrollBlocked: status 403, ok=false
- employeeMe: status 200, ok=true
- employeePayslips: status 200, ok=true
- employeePayrollBlocked: status 403, ok=false
- employeeDocuments: status 200, ok=true

## Issues / Fixes

No source-code fixes were required. No database migration was required.

## RBAC Smoke Notes

- `managerPayrollBlocked` returned 403 as expected.
- `employeePayrollBlocked` returned 403 as expected.
- HR and payroll sample users can view payroll endpoints for the new company.
- Manager and employee sample users cannot view the company-wide payroll summary.

## Known Limitations

- Shift templates are in-memory in the active backend, not DB-backed; attendance was persisted using the backend's 09:00 shift convention.
- Email sending is dry-run, matching the current configured email system.
- This simulation creates a new tenant and does not delete or truncate any existing data.

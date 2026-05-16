# Full Enterprise Operational UAT - Final Pre-RC Product Validation

Generated: 2026-05-15

## Final Decision

**FULL-UAT GO**

The Phase 11.1 security patch was applied and the full operational UAT API/regression harness was rerun cleanly.

The previous manager-scoping blocker is now resolved: manager `GET /api/employees/2` returns `404`, while manager self/direct-report access, HR company employee access, employee self-service access, payroll read behavior, and recruiter denial remain intact.

## Executive Summary

### Passed

- All six roles logged in successfully: superadmin, HR admin, payroll admin, manager, employee, recruiter.
- Backend health/readiness/version passed.
- Ops environment and metrics endpoints passed without sensitive env leakage.
- HR employee create/edit/profile flow passed.
- HR contract creation, required document creation, attachment metadata, and enterprise document linking passed.
- Enterprise leave request creation, manager approval, HR approval, audit rows, notifications, and payroll impact lookup passed.
- Payroll policy, employment rules, preview, run/payslip/report reconciliation, duplicate protection, and locked-run protection passed through direct UAT plus refreshed Sprint 5 evidence.
- Recruitment handoff passed through refreshed Sprint 6 evidence: candidate conversion created employee, user, contract, required document checklist, enterprise document links, and idempotent retry.
- Unified approvals included leave, payroll adjustment, attendance correction, employee action, performance, recruitment, and compliance contract domains.
- Notification list/read/unread isolation path passed at API level.
- Authorized CSV/XLSX/PDF exports passed for employees, attendance, payroll, recruitment, evaluations, workflows, and reports.
- Unauthorized payroll exports for employee, manager, and recruiter returned 403.
- Chrome/CDP browser UAT passed across desktop/mobile, Arabic/RTL, dark mode, route loading, console/network checks, screenshots, and legacy leave banner check.

### Blockers

No blockers remain in the clean full operational UAT rerun.

### Non-Blocking Findings

#### MEDIUM: `/api/production/exports/documents` unsupported

- Expected: document exports work if advertised/supported.
- Actual: documents export returned `404` for CSV/XLSX/PDF.
- Evidence: `qa/full-operational-uat-export-results.json`
- Risk: reporting UX may imply document export capability while production export endpoint lacks a documents dataset.
- Recommended fix: either add canonical documents export support later or hide/label document export action as unsupported.

## Role UAT Matrix

| Role | Result | Evidence |
| --- | --- | --- |
| Superadmin | PASS | Modules, usage, ops env, metrics passed; tenant mutation blocked with 403 |
| HR admin | PASS | Employee lifecycle, contracts/compliance, leave, approvals, documents/reporting checks passed |
| Payroll admin | PASS | Payroll policy, preview, reconciliation, exports, locked-run evidence passed |
| Manager | PASS | Team list loaded; unrelated HR employee profile returned 404; forbidden payroll/contract actions blocked |
| Employee | PASS | Own profile allowed; other profile, payroll preview, exports, contracts blocked |
| Recruiter | PASS | Recruitment list/handoff evidence passed; payroll and contract mutation blocked |

Detailed evidence: `qa/full-operational-uat-role-matrix.json`

## Business Flow Evidence

### HR Employee Lifecycle

- Created employee: `employeeId=55`
- Edited employee: status 200
- Opened profile: status 200

Evidence: `qa/full-operational-uat-results.json`

### Contracts + Compliance

- Contract created: `contractId=32`
- Required document created and linked to enterprise document: `enterpriseDocumentId=53`
- Attachment metadata created and linked to enterprise document: `enterpriseDocumentId=54`
- Contract detail loaded: status 200

Evidence: `qa/full-operational-uat-results.json`

### Leave -> Payroll

- Leave request created: `requestId=59`
- Leave type payroll behavior: `deduct_daily_rate`
- Manager approve: 200
- HR approve: 200
- Final status: `approved`
- Audit rows: 3
- Payroll impact rows visible: 18
- Employee notifications list: 200
- Payroll preview for employee: 200

Evidence: `qa/full-operational-uat-workflows.json`, `qa/full-operational-uat-payroll-reconciliation.json`

### Payroll Truth

Canonical payroll evidence from refreshed Cleanup Sprint 5:

- Run total net: `26905.783`
- Payslip net total: `26905.783`
- Report total net: `26905.783`
- Duplicate prevention: true
- Locked recalculation status: 409

Evidence: `qa/full-operational-uat-payroll-reconciliation.json`, `qa/cleanup-sprint-5-results.json`

### Recruitment -> Employee -> Contract -> Documents

Refreshed Cleanup Sprint 6 evidence:

- Candidate converted to employee: `employeeId=52`
- Draft contract created: `contractId=29`
- Enterprise document IDs linked: `41, 42, 43, 44, 40`
- Second conversion idempotent: true

Evidence: `qa/cleanup-sprint-6-results.json`

### Unified Approvals

Domains visible in HR pending approvals:

- compliance_contract
- payroll_adjustment
- attendance_correction
- employee_action
- leave
- performance
- recruitment

Employee approvals access: 403

Evidence: `qa/full-operational-uat-workflows.json`

### Notifications

- Employee notification list: 200
- Read notification: 200
- Unread notification: 200
- Foreign read attempt returned 200 with `updated=0`, meaning no foreign notification mutation occurred.

Evidence: `qa/full-operational-uat-workflows.json`

## Export Validation

Authorized exports passed:

- employees: CSV/XLSX/PDF
- attendance: CSV/XLSX/PDF
- payroll: CSV/XLSX/PDF
- recruitment: CSV/XLSX/PDF
- evaluations: CSV/XLSX/PDF
- workflows: CSV/XLSX/PDF
- reports: CSV/XLSX/PDF

Unauthorized payroll exports:

- employee: 403
- manager: 403
- recruiter: 403

Unsupported:

- documents export: 404 for CSV/XLSX/PDF

Evidence: `qa/full-operational-uat-export-results.json`

## Browser/CDP UAT

Status: **GO**

Validated routes:

- `/app/dashboard`
- `/app/leave-management`
- `/app/leave`
- `/app/approvals`
- `/app/payroll/runs`
- `/app/payroll/slips`
- `/app/payroll-policies`
- `/app/payroll-attendance`
- `/app/attendance`
- `/app/recruitment`
- `/app/compliance-contracts`
- `/app/documents-reporting`
- `/app/performance-workflows`
- `/app/notifications`
- `/app/employees`
- `/app/job-descriptions`

Checks passed:

- pages loaded
- no stuck loading
- no horizontal overflow
- dark mode readable
- no mojibake detected
- actionable controls present
- compatibility banner visible on legacy leave route
- no critical console errors
- no unexpected API 500s
- screenshots captured

Evidence: `qa/full-operational-uat-browser-results.json`, `qa/full-operational-uat-screenshots/`

## Infrastructure / Reliability Checks

Local runtime checks passed:

- `/api/healthz`: 200
- `/api/readiness`: 200
- `/api/version`: 200
- `/api/ops/metrics`: 200
- `/api/ops/environment`: 200 and sanitized
- correlation id response header: passed
- rate limiting: blocked bad login burst with 429
- readiness reports memory adapter honestly

Evidence: `qa/full-operational-uat-results.json`

## Test Data

The UAT harness isolated new records using the run tag `uat1778846275745`.

Created during final run:

- Employee: `employeeId=55`
- Contract: `contractId=32`
- Leave request: `requestId=59`
- Required document enterprise link: `enterpriseDocumentId=53`
- Attachment enterprise link: `enterpriseDocumentId=54`

Refreshed prerequisite smoke data:

- Recruitment conversion: candidate `26`, employee `52`, contract `29`

## Final Recommendation

Proceed with the next RC validation gate once the Phase 11.1 browser/CDP spot-check limitation is accepted or rerun in an environment where Chrome can expose a CDP port.

The application-layer blocker is fixed and the full operational UAT API/regression harness is **FULL-UAT GO**. The only non-blocking product issue still listed here is the existing unsupported document export dataset warning.

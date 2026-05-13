# Cleanup Fix Sprint 1 Report

Generated: 2026-05-13T22:51:58.546Z

Status: **GO**

## Validation Matrix

| Flow | Result | Evidence summary |
|---|---|---|
| performancePromotion | CONFIRMED WORKING | Approved recommendation updates employee salary, payroll preview, and rejects duplicate approval. |
| attendanceCorrection | CONFIRMED WORKING | Correction is an audited manual exception and not biometric proof. |
| attendancePayrollImpact | CONFIRMED WORKING | Approved attendance impacts are consumed by preview/run/payslip snapshot once. |
| legacyVsEnterpriseLeave | CONFIRMED WORKING | Legacy unmapped leave is explicitly flagged as payroll-ignored; enterprise leave remains canonical payroll source. |
| recruitmentConversion | CONFIRMED WORKING | Conversion creates employee/user plus draft contract/checklist handoff and is idempotent. |
| employeeSelfServiceSecurity | CONFIRMED WORKING | No sampled employee data leak or forbidden payroll access remained. |
| superadminPolicy | DOCUMENTED | Observed and documented; no new superadmin privileges were added in this cleanup sprint. |

## Files Changed

- artifacts/api-server/src/index.ts
- artifacts/api-server/src/payroll-run.service.ts
- qa/cleanup-fix-sprint-1-smoke.cjs

## Notes

- This sprint intentionally avoided new modules and UI redesign.
- Attendance payroll impact behavior chosen: approved attendance_payroll_impacts are canonical payroll effects and are consumed by payroll preview/run/payslip snapshot once.
- Enterprise leave-management remains payroll source of truth. Legacy leave creation now returns an explicit compatibility/payroll warning when unmapped.

## Validation Run

- `pnpm.cmd run typecheck`: passed
- Angular development build: passed
- Angular production build: passed with existing SCSS budget warning only
- Backend health: passed on `http://localhost:3001/api/healthz`
- Focused API smoke: passed via `qa/cleanup-fix-sprint-1-smoke.cjs`

## Runtime Note

Windows intermittently denied Node startup under `C:\Users\w10` with `EPERM: lstat`. Final backend smoke used the existing `C:\Users\Public\zenhr-runtime` runtime copy, synchronized with the patched API and DB schema files.

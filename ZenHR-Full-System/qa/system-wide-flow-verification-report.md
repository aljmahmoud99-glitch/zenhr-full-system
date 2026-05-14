# System-Wide Flow Verification Report

Generated: 2026-05-13T22:16:47.297Z

Status: **NO_GO**

This was a verification-only run. No product code was changed.

## Test Context

- Backend: http://localhost:3001
- Health: 200
- Employee under test: 8
- Payroll period: 2884-01

## Flow Classifications

| Flow | Classification | Evidence summary |
|---|---|---|
| payrollAdjustment | CONFIRMED WORKING | Adjustment reflected by payroll preview/run evidence |
| attendancePayrollImpact | PARTIAL | Violations can be generated/listed, but canonical payroll snapshot did not show attendance impact evidence |
| legacyVsEnterpriseLeave | PARTIAL | Enterprise unpaid leave affected payroll preview; legacy leave used a non-enterprise leave type and is expected to be ignored by enterprise payroll join. |
| attendanceCorrection | PARTIAL | Correction creates/updates attendance as manual exception, not biometric proof path |
| performancePromotion | CONFIRMED BROKEN | Recommendation/workflow did not change employee salary/job or create detectable employee action |
| recruitmentConversion | PARTIAL | Conversion creates employee/user; contract and enterprise document checklist are absent unless counts are non-zero. |
| notifications | CONFIRMED WORKING | Both legacy and center APIs read notification data; unread/read works on sampled center notification. |
| documentsFiles | PARTIAL | Legacy and enterprise document records can both be created, but they appear in separate centers/tables. |
| employeeSelfServiceSecurity | PARTIAL |  |
| superadminPolicy | PARTIAL | Policy is documented as observed statuses, not judged as correct because product policy is inconsistent by design. |
| reportTruth | PARTIAL | Reports/exports respond where tested; numeric reconciliation to all newly created flow data remains partial because canonical payroll omitted some enterprise impacts. |

## Important Notes

- A CONFIRMED BROKEN result means the suspected issue reproduced through API/runtime evidence.
- PARTIAL means the flow has some working pieces but failed at least one requested verification point or is split across duplicate sources.
- NOT TESTED means a prerequisite or endpoint behavior prevented a meaningful result.

## Evidence

See `qa/system-wide-flow-verification-results.json` for exact statuses, IDs, and endpoint responses.

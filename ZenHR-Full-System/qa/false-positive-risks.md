# False Positive Risks

These suspected issues were not fully confirmed as broken in this run, but remain risky or partial.

## payrollAdjustment

Classification: **CONFIRMED WORKING**

Adjustment reflected by payroll preview/run evidence

## notifications

Classification: **CONFIRMED WORKING**

Both legacy and center APIs read notification data; unread/read works on sampled center notification.

## attendancePayrollImpact

Classification: **PARTIAL**

Violations can be generated/listed, but canonical payroll snapshot did not show attendance impact evidence

## legacyVsEnterpriseLeave

Classification: **PARTIAL**

Enterprise unpaid leave affected payroll preview; legacy leave used a non-enterprise leave type and is expected to be ignored by enterprise payroll join.

## attendanceCorrection

Classification: **PARTIAL**

Correction creates/updates attendance as manual exception, not biometric proof path

## recruitmentConversion

Classification: **PARTIAL**

Conversion creates employee/user; contract and enterprise document checklist are absent unless counts are non-zero.

## documentsFiles

Classification: **PARTIAL**

Legacy and enterprise document records can both be created, but they appear in separate centers/tables.

## employeeSelfServiceSecurity

Classification: **PARTIAL**

See JSON details.

## superadminPolicy

Classification: **PARTIAL**

Policy is documented as observed statuses, not judged as correct because product policy is inconsistent by design.

## reportTruth

Classification: **PARTIAL**

Reports/exports respond where tested; numeric reconciliation to all newly created flow data remains partial because canonical payroll omitted some enterprise impacts.

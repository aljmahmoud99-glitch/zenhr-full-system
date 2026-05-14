# Product Regression Test Plan

Generated: 2026-05-13

## HR Admin

1. Create employee, assign department, job profile, manager, employment type.
2. Create HR master data item and verify it appears in job profile dropdown.
3. Create job profile with grade, responsibilities, skills, languages.
4. Create leave type/policy in enterprise leave.
5. Submit leave for employee, approve as manager/HR, verify notification and audit.
6. Run payroll preview and confirm unpaid leave deduction only for enterprise unpaid leave.
7. Create payroll adjustment and confirm it is either applied in payroll run or flagged as not integrated.
8. Create recruitment candidate, offer, convert to employee, verify user and onboarding.
9. Create compliance contract and required document.
10. Create enterprise document and verify it is visible in document reporting.

## Manager

1. Verify manager sees only team employees.
2. Approve/reject team leave request.
3. Attempt to approve non-team leave request, expect 403.
4. View team attendance, corrections, and evaluations.
5. Attempt payroll adjustment mutation, expect forbidden or validated role behavior.
6. Submit team performance evaluation and verify workflow visibility.

## Employee

1. View own dashboard, profile, leave, notifications, documents.
2. Submit enterprise leave request and see pending state.
3. Attempt to view another employee leave or document, expect blocked.
4. Enroll biometric device and check in/out inside geofence.
5. Attempt check-in without biometric assertion, expect blocked.
6. View own payslip only.
7. Submit self-evaluation if enabled.

## Payroll Admin

1. View payroll policies and edit calculation mode.
2. Preview payroll for full-time, part-time/hourly, and unpaid leave cases.
3. Generate draft payroll run and inspect policy snapshot.
4. Confirm locked/approved runs are not recalculated silently.
5. Confirm payroll adjustments and attendance impacts are either reflected or reported as integration gaps.
6. Attempt recruitment mutation, expect forbidden.

## Recruiter

1. Create recruitment request/candidate if allowed by current RBAC.
2. Move candidate through pipeline.
3. Schedule interview and create offer where allowed.
4. Attempt payroll and leave policy mutation, expect forbidden.
5. Verify recruiter sees only recruitment-scoped documents/forms.

## Superadmin

1. Verify platform/company administration.
2. Verify tenant data views obey designed platform behavior.
3. Attempt tenant payroll/leave/compliance mutation and confirm consistent policy.
4. Verify cross-company search does not leak tenant data.

## Cross-Domain Scenarios

### Leave To Payroll

1. Create paid annual leave.
2. Approve it.
3. Preview payroll: no deduction.
4. Create unpaid leave through enterprise leave.
5. Approve it.
6. Preview payroll and generate draft run: deduction appears in payslip snapshot.
7. Create legacy leave request and confirm whether it is intentionally included or excluded.

### Attendance To Payroll

1. Check in/out with biometric and geofence.
2. Create approved overtime request.
3. Generate payroll run and verify overtime earnings.
4. Create attendance violation/payroll impact and verify whether canonical payroll consumes it.

### Recruitment To Employee

1. Candidate with accepted offer converts to employee.
2. Verify employee, user, onboarding batch.
3. Verify no duplicate employee on second conversion.
4. Verify contract and document checklist behavior. Current expected result: not automatically created.

### Performance To Payroll

1. Create performance evaluation and submit.
2. Approve workflow.
3. Create promotion/increment recommendation.
4. Approve workflow.
5. Verify whether employee salary/job changes. Current expected result: no direct payroll effect unless employee action is created separately.

### Documents/Compliance

1. Create contract with required document.
2. Attach metadata.
3. Verify enterprise document center visibility. Current expected result: not automatically unified unless explicitly linked.

## Automated Regression Harness Recommendations

1. Add route inventory test to detect duplicate route labels in navigation.
2. Add API RBAC matrix tests for canonical and deprecated endpoints.
3. Add payroll calculation golden tests for policy, leave, overtime, adjustments, and locked runs.
4. Add tenant isolation tests using two companies for every module.
5. Add UTF-8 static scanner for mojibake markers in `.ts`, `.html`, and `.sql`.
6. Add source-of-truth tests that assert deprecated endpoints call canonical services.

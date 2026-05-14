# Cleanup Sprint 5 - Payroll Truth Hardening + Reporting Reconciliation

Generated: 2026-05-14

## Status

**Sprint 5 status: GO**

Payroll preview, payroll run calculation, payslip snapshots, payroll summary reporting, and binary exports now reconcile for the validated payroll period. Approved payroll impacts are applied once, same-run recalculation does not duplicate them, and locked payroll runs reject recalculation.

No migration was created for this sprint. The payroll impact registry is an internal calculation-layer structure, as requested.

## Files Changed

- `artifacts/api-server/src/payroll-run.service.ts`
- `artifacts/api-server/src/index.ts`
- `qa/cleanup-sprint-5-smoke.cjs`
- `qa/cleanup-sprint-5-browser.cjs`
- `qa/cleanup-sprint-5-results.json`
- `qa/cleanup-sprint-5-payroll-reconciliation.json`
- `qa/cleanup-sprint-5-rerun-protection.json`
- `qa/cleanup-sprint-5-rbac-results.json`
- `qa/cleanup-sprint-5-export-results.json`
- `qa/cleanup-sprint-5-browser-results.json`
- `qa/cleanup-sprint-5-report.md`

## Implementation Summary

### Canonical Payroll Impact Registry

Added an internal `PayrollImpactRegistry` in `payroll-run.service.ts` to normalize pay-affecting records into a deterministic shape:

- salary components
- overtime
- leave impacts
- payroll adjustments
- payroll adjustment installments
- attendance payroll impacts
- salary advances

The registry deduplicates by source type, source id, employee, and payroll period. Invalid, skipped, or duplicate impacts are captured for audit visibility instead of being silently ignored.

### Payroll Adjustments in Canonical Pipeline

Approved payroll adjustments and installments are now consumed by the payroll run calculation pipeline and reflected in:

- payroll preview
- payroll run totals
- payslip component snapshot
- payroll summary report totals
- export-backed payroll data

Validated case: after-net +50 JOD adjustment.

### Duplicate Protection

Same-run recalculation resets stale draft/calculated payslip links before rebuilding the canonical output. The validated run applied the +50 JOD adjustment once on the first calculation and once on the recalculated replacement payslip, with no duplicate accumulation.

Locked payroll protection is still enforced. Recalculating the approved run returned `409`.

### Payroll Snapshot Truth

The same canonical calculation output is now used for payroll run totals and payslip snapshots. Reports and payroll summary exports reconcile to the stored run/payslip totals for the tested period.

### SSC Rate Normalization

Payroll configuration values stored as percentages, such as `7.5`, are normalized to decimal rates, such as `0.075`, in both payroll run calculation and preview. This fixed a runtime discrepancy where historical percentage-style config values could inflate deductions.

## Validation Evidence

### Backend Health

- `/api/healthz`: `200`
- Response status: `healthy`

### Role Logins

All test roles authenticated successfully:

- hr: `hradmin`
- payroll: `payrolladmin`
- manager: `manager`
- employee: `employee`
- recruiter: `recruiter`
- admin: `superadmin`

### Payroll Reconciliation

Validated period: `2138-11`

Validated employee: `8`

Validated adjustment: `24`

| Check | Result |
| --- | ---: |
| Preview net before adjustment | `1155.525` |
| Preview net after adjustment | `1205.525` |
| Preview delta | `50.000` |
| Preview adjustment addition | `50.000` |
| Payslip adjustment addition | `50.000` |
| Run total net | `22561.983` |
| Payslip net total | `22561.983` |
| Report total net | `22561.983` |
| Gross reconciles | `true` |
| Deductions reconcile | `true` |
| Net reconciles | `true` |

Result: **GO**

### Rerun and Lock Protection

| Check | Result |
| --- | ---: |
| First calculate status | `200` |
| Second calculate status | `200` |
| First snapshot adjustment | `50.000` |
| Second snapshot adjustment | `50.000` |
| Adjustment status after run | `applied` |
| Adjustment payroll run id | `18` |
| Approve run status | `200` |
| Locked recalculate status | `409` |
| Duplicate prevented | `true` |

Result: **GO**

### RBAC Payroll Smoke

| Check | Result |
| --- | ---: |
| Manager payroll mutation | `403` |
| Employee payroll preview | `403` |
| Recruiter payroll export | `403` |
| Payroll admin read | `200` |

Result: **GO**

### Export Smoke

| Export | Status | Content Type | Size |
| --- | ---: | --- | ---: |
| Payroll CSV | `200` | `text/csv; charset=utf-8` | `10767` |
| Payroll XLSX | `200` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `13515` |
| Payroll PDF | `200` | `application/pdf` | `7002` |
| Payroll summary Excel | `200` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `10264` |

Result: **GO**

### Browser UAT

Chrome/CDP payroll browser smoke passed:

- `/app/payroll/runs` loads
- `/app/payroll-attendance` loads
- mobile payroll route loads without horizontal overflow
- dark-mode contrast sampling passed
- no critical console errors

Result: **GO**

### Builds

- `pnpm.cmd run typecheck`: passed
- Angular development build: passed
- Angular production build: passed

Known non-blocking warning: existing Angular style budget warning for `layout.component.scss`.

## Regression Coverage

Validated during Sprint 5:

- Unified approvals endpoint remained reachable: `200`
- Leave compatibility endpoint remained reachable: `200`
- Cleanup Sprint 2 smoke: GO
- Cleanup Sprint 3 smoke: GO after stabilizing the test date range to avoid random historical conflicts
- Cleanup Sprint 4 navigation check: GO

Cleanup Sprint 1 full smoke remains `PARTIAL` only because the legacy unmapped leave path now fails safely with `400`, which is the canonical leave guardrail from Sprint 3. Core Sprint 1 payroll-relevant flows remained working in the previous evidence: performance promotion, attendance correction, attendance payroll impact, recruitment conversion, and employee self-service security.

## Remaining Limitations

- The impact registry is internal and persisted indirectly through payslip snapshots, source row application markers, and audit rows. No new normalized payroll impact table was added.
- Browser text extraction still shows some historical Arabic mojibake in existing payroll data samples. This sprint did not attempt a broad Arabic data cleanup because its scope was payroll truth and reconciliation.
- Existing style budget warning remains non-blocking and was not changed in this sprint.

## Final Determination

Cleanup Sprint 5 is **GO**.

Success criteria satisfied:

- payroll preview/run/payslip/export totals reconcile
- approved payroll impacts apply exactly once
- locked payroll runs are immutable
- payroll calculation is deterministic and auditable for the tested sources
- payroll RBAC smoke passed
- exports return real downloadable files
- browser payroll UAT passed
- typecheck and builds passed

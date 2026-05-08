# Bundle D Production Readiness

## Status

Conditional GO for backend/API/export hardening and Angular production build.

Not a full production GO until browser UAT and PDF typography verification are completed.

## Passed

- Backend starts and `/api/healthz` returns 200.
- All six seeded role logins pass.
- Global search returns 200 for HR, employee, and superadmin.
- Production export endpoint returns real downloadable CSV/XLSX/PDF responses where supported.
- Export RBAC blocks unauthorized payroll/tenant exports.
- Payroll-summary RBAC regression remains fixed.
- Enterprise regression API probes for document reporting, performance, payroll-attendance, recruitment, and job profiles return 200.
- `pnpm.cmd run typecheck` passes.
- Angular production build passes.

## Security Readiness

- Tenant export datasets are company-scoped through `company_id` or owning parent records.
- Superadmin is blocked from tenant employee export in the new production export API.
- Employee and recruiter are blocked from payroll export.
- Payroll-summary endpoint still allows HR/payroll and denies admin/manager/employee/recruiter.

## Operational Readiness

- `qa/bundle-d-smoke.ps1` provides a repeatable regression smoke.
- `qa/bundle-d-final-hardening-api-results.json` contains final response status/content-type/byte-size evidence.
- Backend runtime log is clean after the final patches.

## Conditional Items

- Browser click-level UAT is still required.
- Arabic PDF rendering needs a real Unicode/Arabic-capable PDF engine before print-quality Arabic documents are production-grade.
- Existing large layout SCSS should be split later to reduce style budget pressure.

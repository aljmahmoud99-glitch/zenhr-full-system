# Full Enterprise Process Fixes

- Added migrations\full-enterprise-process-v1.sql for persisted pre-employment and probation evaluation records.
- Updated artifacts/api-server/src/index.ts so /api/pre-employment and /api/probation/evaluations persist to PostgreSQL instead of returning stub/in-memory data.
- No RBAC weakening was applied. Platform payroll-summary RBAC was not touched.

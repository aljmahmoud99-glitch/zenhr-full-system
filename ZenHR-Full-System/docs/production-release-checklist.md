# Production Release Checklist

## Pre-Release

- Confirm target branch and release tag.
- Confirm no unreviewed migrations are pending.
- Confirm `.env.production.example` has a matching deployment secret set.
- Confirm `APP_VERSION` is set to the release version.
- Confirm `DATABASE_URL` points to the intended production database.
- Confirm `JWT_SECRET` is production-grade and not the development default.
- Confirm `CORS_ORIGINS` contains only HTTPS production origins.
- Confirm persistent upload/export volumes are mounted.
- Confirm backup storage is available.

## Backup

- Run database backup:

```powershell
scripts\db-backup.ps1 -DatabaseUrl $env:DATABASE_URL
```

- Run uploads backup:

```powershell
scripts\uploads-backup.ps1
```

- Store backup artifacts outside the application host.

## Deploy

- Apply migrations manually.
- Build and deploy API image.
- Build and deploy frontend image/static bundle.
- Confirm API starts without environment validation errors.
- Confirm `/api/healthz`.
- Confirm `/api/readiness`.
- Confirm `/api/version`.
- Confirm `/api/ops/environment` as HR/payroll/admin.

## Smoke Tests

- Run:

```powershell
scripts\ci-check.ps1
```

- Validate:
  - login
  - payroll
  - leave
  - approvals
  - documents
  - exports
  - notifications
  - Arabic/RTL
  - dark mode

## Post-Deploy Monitoring

- Watch structured logs for:
  - 5xx spikes
  - login failures
  - export job failures
  - rate-limit spikes
  - database readiness failures

- Confirm no cross-tenant/RBAC regression with the Sprint 7 smoke artifacts.

## Release Decision

Release is acceptable only when:

- health/readiness pass
- CI smoke passes
- exports download successfully
- no critical browser console/API errors
- rollback plan is ready
- backups are verified

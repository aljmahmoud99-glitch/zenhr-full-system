# Rollback Plan

## Goals

Rollback must restore service safely without corrupting payroll, leave, attendance, document, or workflow truth.

## Application Rollback

1. Stop new deployments.
2. Keep the database online unless data corruption is confirmed.
3. Re-deploy the previous API image and frontend bundle.
4. Confirm `/api/healthz` and `/api/readiness`.
5. Run targeted smoke tests for login, payroll, leave, approvals, and exports.

## Database Rollback

Database restore is destructive and must be explicitly approved.

Dry run:

```powershell
scripts\db-restore.ps1 -BackupFile backups\zenjo-db-YYYYMMDD-HHMMSS.dump
```

Apply:

```powershell
scripts\db-restore.ps1 -BackupFile backups\zenjo-db-YYYYMMDD-HHMMSS.dump -Apply
```

Only restore when:

- a migration caused confirmed data corruption, or
- the release cannot be made safe through application rollback.

## Uploads Rollback

Restore upload archives manually to the mounted uploads volume. Preserve current files until ownership and timestamps are reviewed.

## Post-Rollback Verification

- `/api/healthz`
- `/api/readiness`
- login
- payroll preview/run/payslip
- leave approval/payroll impact
- attendance payroll impact
- document download authorization
- export downloads

## Communication

Document:

- release version
- rollback version
- issue trigger
- data impact
- validation results
- follow-up fix plan

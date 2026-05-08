# Admin V2 Enterprise Automation Feature Report

Generated: 2026-05-06

## Summary

Admin V2 adds the high-priority enterprise automation layer for notifications, approvals, background jobs, dry-run email, and private file storage. The implementation reuses the existing notification, employee action workflow, document upload, auth, RBAC, and tenant scoping patterns instead of adding parallel systems.

Status: GO for backend/API and frontend compile validation.

## What Already Existed

### Notifications

- Existing `notifications` database model and API support.
- Existing notification service in `artifacts/api-server/src/notification.service.ts`.
- Existing APIs for notification list, unread count, read/read-all behavior.
- Existing Angular layout notification dropdown and periodic refresh.

### Approval Workflows

- Existing `employee_actions` workflow table with `approval_steps_json`.
- Existing workflow request APIs for career movements, salary changes, and status changes.
- Existing approval/rejection behavior for workflow requests.
- Existing frontend screens for career movements, salary changes, and employment status changes.

### Background Jobs

- No queue library, Redis, BullMQ, or scheduled job worker was present.
- Payroll and notification flows existed as direct API/service actions, not queued jobs.

### Email Service

- No SMTP provider or email service implementation was present.
- No installed email transport dependency was found.
- No password reset/welcome/approval/payslip email templates were wired.

### File Storage

- Existing local `uploads` folder and document upload endpoint.
- Existing multer validation for document upload.
- Existing document file metadata fields such as `fileName` and `fileUrl`.
- Private signed/scoped file object access did not exist.

## What Was Added

### Notifications Engine

- Added notification preferences APIs:
  - `GET /api/notifications/preferences`
  - `PATCH /api/notifications/preferences`
- Added QA/admin test notification API:
  - `POST /api/notifications/test`
- Added storage for delivery channel/email status fields in the migration.

### Approval Workflow Engine

- Added generic workflow aliases over the existing `employee_actions` engine:
  - `GET /api/workflows`
  - `GET /api/workflows/pending`
  - `POST /api/workflows/:id/approve`
  - `POST /api/workflows/:id/reject`
  - `GET /api/workflows/:id/history`
- Added workflow action audit rows for approve/reject decisions.
- Added frontend pending approvals page at `/app/workflows`.

### Background Jobs

- Added lightweight PostgreSQL-backed job abstraction because no Redis/BullMQ stack existed.
- Added admin APIs:
  - `GET /api/admin/background-jobs`
  - `POST /api/admin/background-jobs`
  - `POST /api/admin/background-jobs/run-due`
- Added admin automation summary endpoint:
  - `GET /api/admin/automation/summary`

### Email Service

- Added configurable email settings backed by `system_configurations`.
- Added dry-run email logging so email behavior can be validated without SMTP.
- Added email templates and email logs.
- Added admin APIs:
  - `GET /api/admin/email/settings`
  - `PATCH /api/admin/email/settings`
  - `POST /api/admin/email/test`

### File Storage

- Added `file_objects` metadata for uploaded files.
- Added private download endpoint:
  - `GET /api/files/:id/download`
- Added scoped file listing endpoint:
  - `GET /api/files`
- Updated document upload to create `file_objects`, return `fileObjectId`, and use `/api/files/:id/download`.
- Protected raw `/uploads/*` access through file-object metadata checks while keeping `/uploads/logos` public.

### Frontend

- Added admin automation page at `/admin/automation`.
- Added pending approvals page at `/app/workflows`.
- Added sidebar/menu access entries for superadmin automation and workflow approvals.
- All added async frontend flows use `finalize` to clear loading states.

## Database Migration

Created and applied:

- `migrations/admin-v2.sql`

Objects added safely:

- `notification_preferences`
- `workflow_definitions`
- `workflow_steps`
- `workflow_actions`
- `background_jobs`
- `email_templates`
- `email_logs`
- `file_objects`
- `file_access_logs`

Columns added safely:

- `notifications.delivery_channels_json`
- `notifications.email_status`
- `documents.file_object_id`

Seeded safe defaults:

- SMTP/email configuration keys.
- Storage configuration keys.
- Notification configuration keys.
- Approval escalation setting.
- Email templates.
- Workflow definitions for career movement, salary change, status change, leave, overtime, document approval, and compliance reminder.

Migration was applied successfully to the local PostgreSQL database.

## Files Changed

Backend:

- `artifacts/api-server/src/index.ts`

Frontend:

- `frontend/src/app/app.routes.ts`
- `frontend/src/app/core/services/role-access.service.ts`
- `frontend/src/app/features/admin-automation/admin-automation.component.ts`
- `frontend/src/app/features/workflows/workflows.component.ts`

Database/reporting:

- `migrations/admin-v2.sql`
- `qa/admin-v2-api-results.json`
- `qa/admin-v2-feature-report.md`

## RBAC And Security Checks

Platform admin APIs are protected with `requirePlatformAdmin`.

Validated:

- `admin` / `superadmin` receives 200 for admin automation APIs.
- `hr`, `payroll`, `manager`, `employee`, and `recruiter` receive 403 for platform admin automation APIs.
- `manager` still receives 403 for `/api/reports/payroll-summary`.
- `superadmin` is blocked from private company file downloads.
- Employee file download is scoped to the owning employee.
- Invalid upload type is rejected with 400.

No payroll data was exposed to manager, employee, or recruiter roles.

## Validation Results

Commands run:

- `pnpm.cmd run typecheck` - passed.
- `node .\node_modules\@angular\cli\bin\ng.js build --configuration development` - passed.
- Backend restarted successfully on port 3001.
- Frontend available on port 5000.
- `migrations/admin-v2.sql` applied successfully.
- Admin V2 API smoke checks saved to `qa/admin-v2-api-results.json`.

API smoke highlights:

- All test logins returned 200: admin, hr, payroll, manager, employee, recruiter.
- Admin automation APIs returned 200 for superadmin.
- Admin automation APIs returned 403 for hr, payroll, manager, employee, recruiter.
- Notifications test/list/unread/preferences returned expected success statuses.
- Workflow create/history/reject/history-after-reject path passed.
- Background job enqueue/run-due passed.
- Email settings and dry-run test passed.
- Storage settings passed.
- Invalid upload rejected with 400.
- File upload/download passed for owner.
- File download blocked for superadmin with 403.
- API smoke reported 0 server errors.

## Remaining Risks

- Email is implemented in dry-run mode because no SMTP transport dependency existed. Real SMTP delivery needs a transport integration if production email is required.
- Background jobs use a lightweight database-backed runner, not Redis/BullMQ. This is appropriate for the current stack but should be revisited for high-volume processing.
- Existing legacy document rows created before `file_objects` may still reference raw `/uploads/...` paths and need a backfill if those old file URLs must remain downloadable through the new private access path.
- Workflow aliases intentionally reuse `employee_actions`; deeper workflow definition routing can be expanded later without breaking current screens.

## Final Status

GO for Admin V2 backend/API and frontend compile validation.

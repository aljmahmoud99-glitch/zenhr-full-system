# Bugfix Report

Date: 2026-05-06

## Scope

Fixed only the listed frontend/backend integration bugs. No database schema, migrations, seed data, or payroll-summary RBAC logic were changed.

## Latest Update: Job Descriptions Page

Route validated: `/app/job-descriptions`

### Root Cause

The job descriptions page was loading and saving data correctly at the API/component level, but the browser DOM was not refreshing after async state changes. A headless Chrome DevTools run reproduced the real UI mismatch:

- `POST /api/job-descriptions` returned `201`.
- Angular component state changed to `saving=false`, `jobs=6`, and `filteredJobs=6`.
- The rendered DOM still showed the modal, the save button text `جارٍ الحفظ...`, total `5`, and only 5 table rows.

Exact UI binding mismatch found:

- Template button/loading state was bound to `saving`.
- Template rows and totals were bound to `filteredJobs` / `jobs`.
- The component properties were updated, but Angular did not run a view refresh on this page's async save/load path, so the template kept stale values.

No duplicate route/component was found. `/app/job-descriptions` maps to `JobDescriptionsComponent` only. No `ChangeDetectionStrategy.OnPush` is configured on this component.

### Files Changed

- `frontend/src/app/features/job-descriptions/job-descriptions.component.ts`

### Endpoints Involved

- `GET /api/job-descriptions`
- `POST /api/job-descriptions`
- `PUT /api/job-descriptions/:id`
- `GET /api/org-nodes`
- `GET /api/career-paths`

### Fix

- Added `loadPageData()` and call it from `ngOnInit()` so page entry always triggers a fresh backend load.
- Updated `loadJobs()` to normalize both `ApiResponse<JobDescription[]>` and raw `JobDescription[]` responses.
- Moved `jobsLoading` cleanup into RxJS `finalize()`.
- Guarded duplicate save clicks while `saving` is active.
- Kept save cleanup in `finalize()` and fully reset modal/form state in `closeModal()`.
- After successful create/update, the component still updates local state immediately, then calls `loadJobs()` to reload persisted data from the API.
- Injected `ChangeDetectorRef` and call a guarded `detectChanges()` after the async mutations that the template renders: list load, org/path load, filter updates, save finalization, and modal close/reset.

### Validation

- Workspace typecheck: `pnpm.cmd run typecheck` passed.
- Angular development build: `node .\node_modules\@angular\cli\bin\ng.js build --configuration development` passed.
- Backend health: `GET /api/healthz` returned `200`.
- Frontend server: `http://localhost:5000` returned `200`.
- Real browser validation was performed with headless Chrome via DevTools Protocol against `http://localhost:5000`.
- HR login/session was used.
- Opening `/app/job-descriptions` showed records immediately: component `jobs=6`, `filteredJobs=6`, DOM rows `6`, total `6`.
- Added a new item through the modal.
- After clicking save: `saving=false`, modal closed, component `jobs=7`, `filteredJobs=7`, DOM rows `7`, total `7`, and the new title was visible immediately.
- Navigated to dashboard and back to `/app/job-descriptions`: rows stayed visible without manual refresh, total `7`, and the new title was still present.

QA record created:

- `QA Job Description 1778017966202`
- `QA UI FIX 1778021126146`

### Regression Confirmation

- No database schema, migrations, seed data, RBAC, payroll-summary logic, or backend security logic were changed for this update.
- The fix is limited to frontend lifecycle, response mapping, save-state cleanup, and explicit view refresh for the job descriptions page.
- Remaining unrelated console risk observed during validation: navigating through dashboard logs `GET /api/dashboard/leave-type-breakdown` as `500`. This is outside the job descriptions page and was not changed.

## Bug 1: Employee Actions Pages Failed To Load

### Root Cause

The standalone employee-action pages were calling backend paths without the `/api` prefix:

- `/workflow/career-movements`
- `/workflow/salary-changes`
- `/workflow/status-changes`
- `/workflow/employee-list`
- `/org-nodes`
- `/job-titles`

The backend routes are mounted under `/api`, so the pages hit missing frontend-relative routes and showed "Failed to load data". The employee-profile "Take Action" flow was not the root cause; it correctly passes `employeeId` as query params for modal prefill.

### Files Changed

- `frontend/src/app/features/employee-actions/career-movements/career-movements.component.ts`
- `frontend/src/app/features/employee-actions/salary-changes/salary-changes.component.ts`
- `frontend/src/app/features/employee-actions/status-changes/status-changes.component.ts`

### Endpoints Involved

- `GET /api/workflow/career-movements`
- `GET /api/workflow/salary-changes`
- `GET /api/workflow/status-changes`
- `GET /api/workflow/employee-list`
- `GET /api/org-nodes`
- `GET /api/job-titles`
- `POST /api/workflow/requests`
- `POST /api/workflow/requests/:id/approve`
- `POST /api/workflow/requests/:id/reject`
- `POST /api/workflow/requests/:id/cancel`

### Validation

API validation after backend restart:

- `hr`: all three workflow list endpoints returned `200`; employee list returned `200`.
- `manager`: all three workflow list endpoints returned `200`; employee list returned `200`.
- `payroll`: all three workflow list endpoints returned `200`; employee list returned `200`.
- `employee`: all three workflow list endpoints returned `200`; employee list returned `200`.

## Bug 2: Job Titles Save Spinner / Persistence

### Root Cause

Two issues were found:

1. The frontend job-title/job-description save flow did not use a completion finalizer, so the save state could remain active if later refresh logic changed timing.
2. Backend `/api/job-titles` was inconsistent: `GET /api/job-titles` read from `job_descriptions`, but `POST/PATCH/DELETE /api/job-titles` wrote to the older `job_titles` table. New titles created through that API could appear transiently in UI state but disappear after reload.

### Files Changed

- `frontend/src/app/features/job-descriptions/job-descriptions.component.ts`
- `artifacts/api-server/src/index.ts`

### Endpoints Involved

- `GET /api/job-titles`
- `POST /api/job-titles`
- `PATCH /api/job-titles/:id`
- `DELETE /api/job-titles/:id`
- `GET /api/job-descriptions`
- `POST /api/job-descriptions`
- `PUT /api/job-descriptions/:id`

### Validation

- Created a QA job title through `POST /api/job-titles`.
- Confirmed it reloaded through `GET /api/job-titles`.
- Frontend save now clears `saving` via `finalize()` and updates the in-memory list before refreshing from the API.

QA record created:

- `QA Job Title 1778008542303`

## Bug 3: False Permission Warning On Role Dashboards

### Root Cause

`AppSettingsService` loaded `/api/config` globally for every logged-in role. That endpoint is intentionally admin-only (`superadmin`/`hradmin`), so normal dashboards for `manager`, `payrolladmin`, and `employee` could trigger a 403 and the global interceptor showed "You do not have permission to perform this action."

### Files Changed

- `frontend/src/app/core/services/app-settings.service.ts`

### Endpoints Involved

- `GET /api/config`

### Fix

The settings loader now skips the admin-only config request for non-admin roles and uses frontend defaults. This removes the unnecessary forbidden request without hiding real permission errors on restricted pages.

Direct API access to `/api/config` still correctly returns `403` for:

- `manager`
- `payrolladmin`
- `employee`

## Validation Results

- Workspace typecheck: `pnpm.cmd run typecheck` passed.
- Backend restarted with `DATABASE_URL=postgresql://postgres:123@localhost:5432/zenhr`.
- Backend health: `GET /api/healthz` returned `200`.
- Frontend server: `http://localhost:5000` returned `200`.
- Employee-action API list endpoints returned `200` for tested roles.
- Job-title create/reload path verified.

Angular build note:

- `npm.cmd run build` compiled the app but failed existing Angular style budget limits in unrelated SCSS files (`dashboard`, `layout`, `employee-profile`). No TypeScript errors were reported by the Angular compiler before budget failure.

## Remaining Risks

- Browser automation was not available locally (`playwright` / `@playwright/test` not installed), so UI validation was performed through endpoint checks, code-path verification, and frontend service availability.
- A QA job title record was intentionally created for persistence validation and was not deleted.

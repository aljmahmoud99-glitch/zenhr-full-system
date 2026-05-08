# Post-GO UI Hotfix Report

Date: 2026-05-09

Recommendation: **HOTFIX GO**

The backend restart blocker was cleared and the patched runtime was validated on `http://localhost:3001`. API smoke, Chrome/CDP browser UAT, typecheck, Angular development build, and Angular production build all passed after restart.

## Runtime Blocker Resolution

- Previous blocker: Windows/Node startup hit `EPERM: operation not permitted, lstat 'C:\Users\w10'`, caused by Node/TS runtime package resolution calling `realpath/lstat` on the restricted user-profile parent folder.
- Resolution: created a temporary physical runtime copy at `C:\Users\Public\zenhr-runtime`, hydrated dependencies there, and started the backend with explicit `DATABASE_URL`. This avoids traversing the restricted `C:\Users\w10` parent while preserving the workspace source patches.
- Health check: `GET /api/healthz` returned healthy.

## Fixes Validated

### 1. Workflows / Pending Approvals Arabic
- Root cause: `/app/workflows` had hardcoded English labels and raw workflow enum values in Arabic mode.
- Fix applied: localized headings, descriptions, actions, history labels, status badges, workflow type labels, and RTL alignment.
- Files changed:
  - `frontend/src/app/features/workflows/workflows.component.ts`
- Validation result: Chrome/CDP route UAT passed. Arabic text is clean, no mojibake, and no raw enums were detected.

### 2. Forms Arabic / Mojibake
- Root cause: form catalog/fallback labels could surface corrupted Arabic or mixed labels.
- Fix applied: clean UTF-8 Arabic backend catalog/category labels, clean backend item-name override mapping for every static form id, frontend defensive Arabic fallback mapping, and tokenized dark-mode card surfaces.
- Files changed:
  - `artifacts/api-server/src/index.ts`
  - `frontend/src/app/features/forms/forms.component.ts`
- Validation result: API smoke and browser route UAT passed. `/api/forms-catalog` and `/app/forms` render Arabic cleanly with no mojibake detected.

### 3. Global Arabic/i18n Audit for Targeted Routes
- Root cause: workflows/forms/attendance/leave still had mixed labels, raw enum display, or corrupted text paths.
- Fix applied: repaired localized text and display mappings on the targeted post-GO routes.
- Files changed:
  - `frontend/src/app/features/workflows/workflows.component.ts`
  - `frontend/src/app/features/forms/forms.component.ts`
  - `frontend/src/app/features/attendance/attendance.component.ts`
  - `frontend/src/app/features/attendance/attendance.component.html`
  - `frontend/src/app/features/attendance/attendance.component.scss`
  - `frontend/src/app/features/leave/leave.component.ts`
  - `frontend/src/app/features/leave/leave.component.html`
  - `frontend/src/app/features/leave/leave.component.scss`
- Validation result: `/app/workflows`, `/app/forms`, `/app/attendance`, and `/app/leave` passed Arabic/RTL browser checks.

### 4. Attendance Location Map Picker / Geofence
- Root cause: attendance location setup was coordinate-first and employee check-in did not clearly validate browser location against saved company work locations.
- Fix applied:
  - Added in-app map-like location picker with clickable map area, marker, current-location support, radius field, and coordinates as secondary technical info.
  - Added company-scoped attendance work-location endpoints backed by `system_configurations`.
  - Added backend geofence validation for clock-in/clock-out with Arabic messages.
- Files changed:
  - `artifacts/api-server/src/index.ts`
  - `frontend/src/app/features/attendance/attendance.component.ts`
  - `frontend/src/app/features/attendance/attendance.component.html`
  - `frontend/src/app/features/attendance/attendance.component.scss`
- Validation result:
  - API create/get/delete location smoke passed.
  - Browser UAT opened the map picker, selected a point, saved a location, confirmed success text, and cleaned up the created test location.
  - Employee check-in UX passed; the seeded employee was already clocked in, so live duplicate check-in was not attempted. API geofence behavior was validated with a 400 `location_unavailable` response when coordinates are missing.

### 5. Leave Filters / Search UI
- Root cause: leave filters were cramped and inconsistent; filtering needed a clearer dropdown grid and reset/search behavior.
- Fix applied:
  - Added modern dropdown filters for employee/status/leave type.
  - Preserved search by employee/reason/code where available.
  - Added filter chips/reset behavior and RTL-safe responsive layout.
- Files changed:
  - `frontend/src/app/features/leave/leave.component.ts`
  - `frontend/src/app/features/leave/leave.component.html`
  - `frontend/src/app/features/leave/leave.component.scss`
- Validation result: API filtered leave request smoke passed. Browser UAT verified dropdown filtering updates the page and filter chips appear.

## Validation Summary

- Backend health: passed.
- Login smoke: `hr`, `admin`, `manager`, `employee`, `payroll`, `recruiter` passed.
- API smoke:
  - workflows pending: passed.
  - forms catalog/list: passed.
  - leave filters/self requests: passed.
  - attendance locations/geofence: passed.
- Chrome/CDP browser UAT:
  - `/app/workflows`: passed.
  - `/app/forms`: passed.
  - `/app/attendance`: passed.
  - `/app/leave`: passed.
- Dark mode sampling: passed on all tested routes.
- Responsive checks: passed for leave and attendance on tablet/mobile widths.
- Typecheck: passed after the final backend forms-catalog patch.
- Angular development build: passed.
- Angular production build: passed with existing non-blocking `layout.component.scss` budget warning.

## Notes

- Expected transient 401 dashboard calls during browser session reset/login were captured by Chrome logs and classified as non-critical; no unexpected 500s, route crashes, or critical console errors remained.
- No database migration was required or applied.
- The `C:\Users\Public\zenhr-runtime` copy is a local Windows runtime workaround only; source-of-truth files remain in the workspace.

## Final Status

**HOTFIX GO.**

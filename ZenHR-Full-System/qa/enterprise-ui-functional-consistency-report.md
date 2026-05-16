# Enterprise UI/UX + Functional Consistency Stabilization Report

Generated: 2026-05-15

## Status

**PARTIAL PASS.**

This stabilization pass preserved the newly implemented RBAC/navigation security layer and focused on targeted enterprise quality issues that could be fixed safely without redesigning the product or changing canonical business flows.

## Fixes Applied

### Global UI Consistency

- Added shared global button styling for:
  - `z-btn-primary`
  - `primary-action`
  - `btn-primary`
  - `z-btn-secondary`
  - `ghost-action`
  - `btn-secondary`
  - `z-btn-danger`
  - `btn-danger`
- Normalized button height, radius, icon spacing, hover states, disabled states, and danger styling.
- Improved visual consistency without weakening route/action permission visibility.

### Top Navigation Dropdowns

- Reworked desktop dropdown sizing into a wider enterprise-style panel.
- Added viewport clamping to prevent dropdown clipping/off-screen rendering.
- Improved dropdown item spacing, icon alignment, wrapping, hover states, and dark-mode compatibility.
- Preserved permission-driven sidebar/search/quick-action filtering.

### Attendance Location Picker

- Fixed map picker interactions:
  - click updates coordinates
  - pointer drag updates marker location
  - keyboard arrow nudging works
  - radius/geofence ring reflects radius value visually
  - browser current-location action updates marker and internal coordinates
  - default Amman reset now syncs internal address hint
- Kept lat/lng as secondary technical info only.
- Did not rely on Google Maps as the only picker.

### Job Profile Add Buttons

- Fixed on-the-fly add payloads for job profile builder master data.
- Responsibilities now require/select the current responsibility group before creation.
- Added required default fields for:
  - responsibilities
  - educational qualifications
  - experience levels
  - training courses
  - languages
- Newly created items are selected in the job profile form after save.

### Arabic / Encoding Cleanup

- Added a safe shared Arabic mojibake repair pass to `I18nService` and `LangService`.
- Components using shared translation helpers now attempt to repair Windows-1256/UTF-8 mojibake before rendering Arabic text.
- This avoids a destructive mass rewrite of translation files and keeps English mode untouched.

### Role-Aware UX

- Employee dashboard quick action for documents now routes to `/app/documents` instead of hidden `/app/documents-reporting`.
- Employee compliance widget falls back to `/app/documents` when the enterprise reporting route is hidden by RBAC.
- RBAC/navigation smoke was rerun after these UI changes and still passed.

## Validation

- `pnpm.cmd run typecheck`: PASS
- Angular production build: PASS
- Backend `/api/healthz`: PASS
- `qa/rbac-navigation-security-smoke.cjs`: PASS

## Affected Files

- `frontend/src/styles.scss`
- `frontend/src/app/layout/layout.component.ts`
- `frontend/src/app/layout/layout.component.scss`
- `frontend/src/app/core/services/i18n.service.ts`
- `frontend/src/app/core/services/lang.service.ts`
- `frontend/src/app/features/dashboard/dashboard.component.ts`
- `frontend/src/app/features/job-descriptions/job-descriptions.component.ts`
- `frontend/src/app/features/attendance/attendance.component.ts`
- `frontend/src/app/features/attendance/attendance.component.html`
- `frontend/src/app/features/attendance/attendance.component.scss`

## Remaining Concerns

- This was not a full browser/CDP sweep of every large screen. The build and API health gates passed, but visual verification should still be sampled in Chrome before release.
- Dashboard data sources already call backend APIs, but a deeper data reconciliation audit was not rerun in this pass.
- Shift reflection remains architecturally weak because the current shift backend is still an in-memory compatibility implementation in `index.ts`; employee self-service schedule visibility needs a canonical persisted shift API before it can be honestly marked production-grade.
- Some dashboard/local component strings use local `t(ar,en)` helpers rather than the shared `LangService`, so the new mojibake repair is strongest where shared i18n helpers are used.
- The existing Angular warning remains: `layout.component.scss` exceeds the configured stylesheet budget.

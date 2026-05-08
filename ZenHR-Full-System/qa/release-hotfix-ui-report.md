# Release Hotfix UI/UX Report

Date: 2026-05-08

## Recommendation

**HOTFIX GO**

All 12 reviewed release-polish issues were addressed with targeted frontend/backend patches. The final Chrome/CDP browser UAT rerun passed with no critical console errors, no failed page checks, and all export checks passing.

## Issue Results

| # | Issue | Fix Applied | Validation |
| --- | --- | --- | --- |
| 1 | Long horizontal tab bars | Converted Performance, Documents/Reporting, and Payroll/Attendance section tabs to responsive accordion-style section navigation with grid buttons. | Angular dev/prod build PASS; browser responsive checks PASS. |
| 2 | Broken Arabic/i18n labels | Added clean Arabic label fallbacks for the newly added enterprise section navs and rewrote corrupted role-assignment UI labels. | Build PASS; browser UAT had 0 critical console errors. |
| 3 | Approvals screen English in Arabic mode | Added clean Arabic fallback labels for Performance approvals center actions and empty states. | Build PASS. |
| 4 | HR attendance map raw lat/lng UX | Replaced primary latitude/longitude fields with a map-picker panel, marker selection, Google Maps link, Amman default, radius input, and internal coordinate display. | Angular build PASS. |
| 5 | Leave search/filters broken | Backend leave list now returns enriched employee, department, job title, and leave type fields. Frontend type/org matching now handles IDs, codes, and names. | `/api/leave/requests` smoke PASS 200. |
| 6 | Overtime history missing employee name/code | Overtime APIs now join employee/department data and frontend displays localized employee name plus code. | `/api/overtime/requests` smoke PASS 200 with `employeeCode`. |
| 7 | Overtime reports broken | Rebuilt overtime reports response for employee, department, cost, monthly/comparison grouping with totals and no raw rows. | Employee and department report smoke PASS 200. |
| 8 | Overtime rules empty/not connected | Overtime rules now load/save from `system_configurations` and calculation uses tier/weekend/holiday rates. No migration required. | GET rules PASS 200; PUT RBAC PASS: HR/admin 200, other roles 403. |
| 9 | Holiday calendar missing holidays | Backend holiday Arabic names fixed to clean UTF-8; frontend maps `fixed/islamic` types and calendar day click shows details. | `/api/public-holidays?year=2026` PASS 200 with Arabic names. |
| 10 | Holiday reports broken | Reports endpoint now supports annual, by-type, monthly, and work-report data shapes. | Annual/by-type report smoke PASS 200. |
| 11 | Compliance dashboard layout too large | Tightened compliance summary grid and critical alert panel with compact rows, max-height list, and theme token surfaces. | Angular build PASS; browser UAT routes PASS. |
| 12 | Role assignment confusing | User roles endpoint now returns employee and direct-manager metadata separately. UI rewritten to show system role badge, manager relationship, role counts, and clean Arabic labels. | `/api/user-roles` PASS for HR/admin; forbidden roles 403. |

## Files Changed

- `artifacts/api-server/src/index.ts`
- `frontend/src/app/features/attendance/attendance.component.html`
- `frontend/src/app/features/attendance/attendance.component.ts`
- `frontend/src/app/features/attendance/attendance.component.scss`
- `frontend/src/app/features/leave/leave.component.ts`
- `frontend/src/app/features/overtime/overtime.component.ts`
- `frontend/src/app/features/overtime/overtime.component.html`
- `frontend/src/app/features/holidays/holidays.component.ts`
- `frontend/src/app/features/compliance/compliance.component.scss`
- `frontend/src/app/features/user-roles/user-roles.component.ts`
- `frontend/src/app/features/performance-workflows/performance-workflows.component.html`
- `frontend/src/app/features/performance-workflows/performance-workflows.component.ts`
- `frontend/src/app/features/performance-workflows/performance-workflows.component.scss`
- `frontend/src/app/features/documents-reporting/documents-reporting.component.html`
- `frontend/src/app/features/documents-reporting/documents-reporting.component.ts`
- `frontend/src/app/features/documents-reporting/documents-reporting.component.scss`
- `frontend/src/app/features/payroll-attendance-core/payroll-attendance-core.component.html`
- `frontend/src/app/features/payroll-attendance-core/payroll-attendance-core.component.ts`
- `frontend/src/app/features/payroll-attendance-core/payroll-attendance-core.component.scss`

## Validation

- `pnpm.cmd run typecheck`: PASS
- Angular development build: PASS
- Angular production build: PASS, existing non-blocking `layout.component.scss` budget warning remains
- Backend restart: PASS
- `/api/healthz`: PASS
- API smoke changed endpoints: PASS
- RBAC smoke for changed endpoints: PASS
- Chrome/CDP browser UAT rerun: PASS
  - Auth: 6/6
  - Pages: 26/26
  - Global search: 6/6
  - Theme sampling: 2/2
  - Responsive sampling: 2/2
  - Exports: 7/7
  - Console errors: 0

## Remaining Limitations

- Attendance map picker uses a safe built-in map preview plus Google Maps link because no Google Maps API key was configured. It is no longer raw latitude/longitude as the primary UX.
- Leave filtering remains client-side over the tenant-scoped loaded list; backend enrichment was added so filters work reliably without inventing a larger server pagination rewrite in this hotfix.

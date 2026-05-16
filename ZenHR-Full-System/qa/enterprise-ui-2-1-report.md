# Enterprise UI/UX + Workflow Truth Fixes - Prompt 2.1

Generated: 2026-05-15T17:00:26.600Z

## Decision

**PARTIAL**. The core backend/API workflow fixes for attendance location persistence, persisted shift assignment to employee schedule reflection, job-profile master-data creation, and RBAC regression passed. I am not marking GO because the final Chrome/CDP browser rerun against the rebuilt production bundle timed out in local Chrome cleanup, and the repository-wide Arabic scanner still finds legacy mojibake outside the touched operational files.

## Fixes Applied

- Replaced the old in-memory /api/shifts compatibility endpoints with persisted attendance_shift_patterns and attendance_schedules reads/writes.
- Added /api/shifts/my-schedule for employee/manager/HR/payroll scoped schedule visibility.
- Added recurrence and attendance-location assignment fields to the HR shift assignment UI payload.
- Added employee schedule/today shift panel to /app/attendance with location, radius, and Google Maps link display.
- Improved attendance location modal with direct latitude/longitude secondary inputs tied to the marker state.
- Reworked top dropdown rendering into grouped compact sections while preserving RoleAccessService nav filtering.
- Converted Job Profile Add helper into a dialog-style create flow with draft-preservation copy and automatic selection after creation.
- Fixed visible mojibake in touched leave filter labels and applied Arabic cleaning through layout/i18n/attendance rendering paths.

## Validation

- Typecheck: PASS.
- Angular production build: PASS with existing layout SCSS budget warning.
- Backend /api/healthz: PASS (200).
- API smoke: PASS.
- Arabic scan: PARTIAL (529 total legacy findings; 0 in touched important files).
- Browser/CDP: PARTIAL; latest completed evidence is in qa/enterprise-ui-2-1-browser-results.json, but final rebuilt rerun timed out locally.

## Remaining Limitations

- Browser/CDP final rebuilt pass is not clean GO due local Chrome harness timeout; screenshots/results are retained from the latest completed pass.
- Repository-wide mojibake remains in older legacy/API/comment/seed areas; touched operational files scanned clean.
- Shift exceptions remain compatibility memory behavior; this pass hardened persisted shift assignments and employee schedule reflection as requested.
- Job Profile Add now uses a modal create/select flow for master data, but a deeper master-data returnUrl workflow was not added.

# Enterprise UI/UX Prompt 2.3 Report

## Decision
**PARTIAL - do not mark GO.**

The targeted fixes landed without weakening RBAC, and several browser slices passed. However, recruiter/superadmin dropdown validation did not complete successfully and the mobile topbar slice captured a blank page. Per the prompt rules, that prevents GO.

## Fixes Applied
- Attendance Google Maps actions now use `window.open(url, '_blank', 'noopener,noreferrer')` with a short double-click guard.
- Attendance location card dark-mode styling was fixed so map actions are readable instead of rendering as white strips.
- Top dropdown grouping rules were updated by role priority:
  - HR: Workforce, Payroll, Recruitment, Documents & Compliance, Reports & Analytics, Settings
  - Payroll: Payroll Operations, Payroll Policies, Payroll Reports
  - Manager: Team, Approvals, Attendance, Performance
  - Employee: My Work, Attendance, Leave, Documents, Payslips, Notifications
  - Recruiter: Recruitment, Candidates, Hiring Pipeline
  - Superadmin: Platform, Companies, Plans & Modules, System Settings
- Dropdown sizing/spacing was tightened for a compact enterprise menu feel.
- Unsupported document export creation is hidden/guarded instead of exposing a broken 404 action.

## Files Changed
- `frontend/src/app/features/attendance/attendance.component.ts`
- `frontend/src/app/features/attendance/attendance.component.html`
- `frontend/src/app/features/attendance/attendance.component.scss`
- `frontend/src/app/layout/layout.component.ts`
- `frontend/src/app/layout/layout.component.scss`
- `frontend/src/app/features/documents-reporting/documents-reporting.component.ts`
- `frontend/src/app/features/documents-reporting/documents-reporting.component.html`
- `frontend/src/app/features/documents-reporting/documents-reporting.component.scss`
- `qa/enterprise-ui-2-3-browser.cjs`
- `qa/enterprise-ui-2-3-*.json`

## Validation
- `pnpm.cmd run typecheck`: PASS
- Angular production build: PASS, with existing SCSS budget warning for `layout.component.scss`
- `/api/healthz`: PASS
- RBAC/navigation regression smoke: PASS
- Attendance Google Maps open stress: PASS
- Arabic operational sampling: PASS
- Dark-mode operational sampling: PASS
- Documents unsupported export visibility: PASS
- HR/payroll/manager/employee dropdown browser validation: PASS
- Recruiter dropdown browser validation: FAIL/incomplete
- Superadmin dropdown browser validation: FAIL/incomplete
- Mobile topbar browser validation: FAIL, blank page screenshot

## Remaining Issues
1. **Recruiter dropdown validation incomplete.** Recruiter can land on an allowed route and RBAC remains intact, but CDP did not open grouped dropdown sections.
2. **Superadmin dropdown validation incomplete.** Needs confirmation whether the admin shell should expose the same grouped topbar pattern.
3. **Mobile topbar slice failed.** CDP captured a blank page without console errors; this needs a focused browser/mobile investigation before GO.

## Final Status
Prompt 2.3 is **PARTIAL**. The map-freeze fix is validated, Arabic/dark/document-export checks passed, and RBAC stayed intact, but the remaining dropdown/mobile evidence blocks GO.

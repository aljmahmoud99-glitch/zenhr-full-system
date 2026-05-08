# Manual UI Bugs

Generated: 2026-05-06

## Summary

No application UI bugs were confirmed in this pass because real browser interaction was blocked.

## Blocking QA Tooling Issue

Severity: BLOCKER for manual UI/UAT signoff

The Browser Use plugin files are installed, but the required Node REPL browser-control tool (`node_repl` / `mcp__node_repl__js` / `js`) is not exposed in this session. Because of that, I could not:

- Login through the UI.
- Click menus.
- Open dialogs.
- Submit forms.
- Verify loaders/toasts visually.
- Capture console errors.
- Capture screenshots.
- Confirm UI state changes after mutations.

## Application Bugs Found

None confirmed.

## Fixes Applied

None.

## Remaining Bug Discovery Required

A human or a session with working browser automation must still test:

- Auth/session/logout/invalid credentials behavior.
- Superadmin pages and save/test buttons.
- HR employee/job/workflow CRUD dialogs.
- Payroll table and workflow screens.
- Manager/employee/recruiter forbidden route behavior.
- Notification dropdown read/read-all behavior.
- File upload/download UI behavior.
- Responsive layout and Arabic/English visual quality.

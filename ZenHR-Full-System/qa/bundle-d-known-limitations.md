# Bundle D Known Limitations

## Browser UAT

Browser automation was not available through a callable tool in this session, so no real click-level browser UAT was claimed. Manual browser testing remains required for navigation, drawers, buttons, exports, dark mode, RTL, and responsive behavior.

## PDF Typography

The new production export endpoint emits valid downloadable PDFs using a lightweight built-in PDF generator. This is acceptable for smoke validation, but it uses Helvetica and does not embed an Arabic-capable font. Arabic text in generated PDFs may not render as production-quality Arabic. A proper PDF renderer with embedded Arabic fonts is still needed for final official HR letters, contracts, and payslips.

## Export Coverage

Bundle D added binary export support for the validated datasets:

- employees
- attendance
- payroll
- recruitment
- evaluations
- workflows
- reports

The endpoint is intentionally generic and capped at 500 rows per export. Large enterprise exports should move to background export jobs with persisted files and progress tracking.

## Frontend Build Warning

Angular production build passes, but `layout.component.scss` exceeds the warning budget. It is below the error budget and does not block production build, but the stylesheet should be split into smaller component styles in a later cleanup pass.

## Search Ranking

Global search is functional and RBAC-aware. Ranking is heuristic rather than full-text indexed. For very large tenants, PostgreSQL full-text/trigram indexes or a dedicated search backend should be added.

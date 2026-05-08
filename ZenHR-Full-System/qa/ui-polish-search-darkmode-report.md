# UI Polish Search + Dark Mode Report

Date: 2026-05-06

## Status

GO for code/build/API validation. Browser click validation is still not claimed because no browser automation tool was exposed in this session.

## Fixes Applied

### 1. Header Search Actions

Root cause:
- The search icon and `Ctrl K` affordance were static inline elements inside the search label.
- Enter behavior relied only on the document-level key handler.

Fix:
- Converted the search icon and `Ctrl K` affordance into real buttons.
- Added explicit `keydown.enter` handling on the search input.
- Kept document-level Ctrl/Cmd+K, Escape, ArrowUp, ArrowDown, and Enter support.
- Search result clicks call `openSearchResult()` and navigate via `router.navigateByUrl()`.

Files:
- `frontend/src/app/layout/layout.component.html`
- `frontend/src/app/layout/layout.component.ts`
- `frontend/src/app/layout/layout.component.scss`

### 2. Dark Mode Menu Text Borders

Root cause:
- Broad dark-mode overlay selectors applied surface/border styles too aggressively to nested menu/dropdown content, making some labels look boxed.

Fix:
- Added dark-mode resets for menu/dropdown/popover text children.
- Kept useful hover/active states on rows and menu items.
- Restyled command result active states with dark-compatible background and border.

File:
- `frontend/src/styles.scss`

### 3. Dark Mode Card Readability

Root cause:
- Several feature-specific cards used local light backgrounds, especially payroll run/detail cards and newly added admin panels.

Fix:
- Extended dark surface coverage to payroll cards, payslip cards, run metrics, detail cards, chart wrappers, automation panels, provider cards, health cards, module cards, and wizard/step cards.
- Dark surfaces now use centralized tokens and readable foreground colors.

File:
- `frontend/src/styles.scss`

### 4. Arabic Localization

Root cause:
- Search and new admin surfaces still had hardcoded English or corrupted Arabic copy.

Fix:
- Replaced search panel labels, empty/loading states, notification labels, group labels, and quick actions with clean Arabic/English strings.
- Localized visible Automation page sections: storage, email service, notification QA, background jobs, tables, buttons, and metrics.
- Localized the most visible Subscription/Plans page labels, metrics, tabs, wizard labels, subscription editor, and charts.

Files:
- `frontend/src/app/layout/layout.component.html`
- `frontend/src/app/layout/layout.component.ts`
- `frontend/src/app/features/admin-automation/admin-automation.component.ts`
- `frontend/src/app/features/system-admin/system-admin-v1.component.ts`

### 5. Search UX Polish

Fix:
- Result rows now have clearer hover/active states.
- Category labels are translated.
- Loading and empty states are translated.
- Escape and click-outside close the panel.
- Small-screen search panel now uses a fixed viewport-safe layout.

Files:
- `frontend/src/app/layout/layout.component.scss`
- `frontend/src/app/layout/layout.component.ts`

## Validation

| Check | Result |
| --- | --- |
| `pnpm.cmd run typecheck` | PASS |
| Angular development build | PASS |
| Backend listening on `:3001` | PASS |
| Frontend listening on `:5000` | PASS |
| Backend health `/api/healthz` | PASS |
| Admin `/api/search?q=zen` | PASS, 8 results, first route `/admin/companies` |
| HR `/api/search?q=EMP` | PASS, 6 results, first route `/app/employees/9` |
| Employee `/api/search?q=payroll` | PASS, 0 payroll results |

## Manual Browser Validation

Not performed in this session because browser automation is not available through the exposed tools.

Manual items still recommended:
- Toggle dark mode and open nav dropdowns/profile/notifications/search.
- Open payroll run details and payslip details in dark mode.
- Click search icon and `Ctrl K` button.
- Test Ctrl/Cmd+K, ArrowUp/Down, Enter, Escape.
- Click employee/company/admin search results and confirm navigation.
- Switch Arabic/English and spot-check new admin pages.

## Remaining Risks

- Older modules outside the new admin/search/login surfaces still contain local copy patterns and may need a broader i18n audit later.
- Visual issues that only appear in real browser rendering still need one manual click-through pass.

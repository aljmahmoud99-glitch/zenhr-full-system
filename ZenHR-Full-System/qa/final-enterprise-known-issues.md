# Final Enterprise Known Issues

## Open Non-Blocking Items

1. **Angular style budget warning**
   - Severity: Low
   - Detail: Production build passes, but `src/app/layout/layout.component.scss` exceeds the warning budget by about 3.89 kB. It remains below the configured error budget and does not block release.

2. **Browser automation fallback**
   - Severity: Low
   - Detail: The Browser Use in-app Node REPL tool was not available in this session, so final UAT used a real local Chrome/CDP harness under `qa/final-enterprise-uat-browser.cjs`.

3. **Manual exploratory depth**
   - Severity: Low
   - Detail: Final pass validated role login, route loading, search, dark mode sampling, responsive sampling, exports, and console/runtime health. Deep create/edit/delete workflows were already validated in prior phase/bundle QA passes and were not exhaustively repeated for every form in this final pass.

## Closed During Final UAT

1. Recruiter login route loop: fixed by routing recruiter default home to `/app/recruitment`.
2. Recruiter unauthorized approvals calls: fixed by hiding/skipping recruitment approvals for roles without access.
3. Dashboard chart 500s: fixed in backend employee dashboard chart endpoints.
4. Arabic central i18n mojibake: fixed in `frontend/src/app/core/i18n/translations.ts`.
5. CDP harness hang after successful runs: fixed by clearing completed command timers.

## Critical Blockers

None remaining.

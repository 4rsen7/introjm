# Research UI review

## 2026-09-28 — study context and visual consistency

Status: implemented and verified locally. This pass addresses the owner's screenshots of clipped workspace selection, preview-label alignment, duplicated AI preparation context, and the static study overview. Pre-existing repository changes are preserved.

### Result

- The study keeps one saved goal, brief, and plan. AI preparation is a collapsed action inside that context card, with optional clarification answers; there is no second required study description. The server already supplies the saved study version to preparation jobs. A proposal still requires explicit review and acceptance before becoming shared context.
- The static overview and numbered instructions are removed. Compact interview and test-task counts remain beside the context heading; loading/error counts show an unknown value rather than a misleading zero.
- Workspace and language selectors now use custom header menus with consistent spacing and touch targets. Long workspace names truncate in the trigger and wrap in the menu. Workspace-change guards remain intact. The initial native-select implementation was corrected after the owner's open-menu screenshot (details below).
- Preview indicators, task numbers, wrapped form buttons, and results metrics align. Results numbers remain on the same row even when their labels wrap. No fixed text-card heights were added.
- Back navigation, section navigation, and study cards share one content width. Anchor offsets follow the actual sticky-header height, including mobile wrapping and language changes.
- Existing Research focus trapping, dialog scrolling, unsaved-change protection, summary rendering, revision checks, and explicit proposal acceptance are retained. Main-app source and backend contracts were not modified by this pass.

### Main-product comparison

Reused the existing `client/src/index.css` surfaces and input styling. The main app's workspace menu (`client/src/App.jsx:159–205`) is custom, with white background, orange selection, role metadata, and bounded scrolling; it does not offer workspace switching when there is only one workspace. Research now follows this pattern through a header-only select component. Language selection uses the same component with Research's existing i18next behavior. Native form selects remain, as in the main product's forms. The existing Research dialog already provides the required focus and unsaved-change behavior.

### Header-menu correction after owner review

- Replaced the native workspace and language popups with `HeaderSelect`. A single workspace is a noninteractive name without a chevron. Multiple workspaces show role labels and a selected state.
- The select-only combobox supports arrow keys, Home/End, Enter/Space, Escape, Tab, and typeahead. Outside interaction closes the menu; choosing an option retains the existing unsaved-change confirmation. Canceled switching preserves the current workspace.
- Open menus adjust their position and available height to the viewport. The review caught and fixed an 18px left-edge overflow of the mobile language menu. Options scroll into view for keyboard navigation.
- The full suite exposed an existing invitation timing race: an in-flight workspace response from before acceptance could be reused afterward. Acceptance now cancels that stale request before fetching current memberships. The invitation regression deliberately delays the initial response to reproduce the original failure and verify the fix; refresh errors retain the invitation error/retry state.
- Final correction validation: **25 scenarios passed (47.6s)** using `RESEARCH_UI_PORT=5175 node node_modules/@playwright/test/cli.js test --config=/tmp/iterojm-dropdown-20260928/playwright.config.cjs`. The four new header scenarios cover single/multiple workspaces, language selection on both auth and signed-in screens, keyboard/outside close, long names, scrolling, and bounds at 320×844 and 320×240.
- Final correction build passed: `npm run build --workspace=research -- --outDir /tmp/iterojm-dropdown-20260928/build --emptyOutDir`. Existing bundle-size/Browserslist notices remain.
- Inspected opened Ukrainian menus at 1440px and 320px, including temporary browser-only mock workspaces for the multi-workspace case. No viewport overflow or uncaught page errors. Screenshots, logs, and `visual-report.json` are in `/tmp/iterojm-dropdown-20260928/`.
- Correction files: `research/src/components/HeaderSelect.jsx`, `research/src/app/App.jsx`, `research/src/components/UI.jsx`, `research/src/styles.css`, `research/tests/header-dropdowns.spec.js`, `research/tests/navigation.spec.js`, `research/tests/workflows.spec.js`, and this report. Routing: one Sol/medium implementer; Architect-Orchestrator reviewed, fixed edge cases, and performed final validation.

### Validation

- Initial polish run: **21 passed (48.2s)**; superseded by the 25-scenario correction run above. Includes the existing authentication/recovery, summary/transcript, revision-conflict, polling, evidence, invitation, pagination, keyboard, and unsaved-navigation scenarios. New/extended coverage checks AI requests without a duplicated description, explicit acceptance, unknown interview counts, long labels at 390/320px, section-anchor visibility, aligned metrics, and equal form-action heights.
- Command: `RESEARCH_UI_PORT=5175 node node_modules/@playwright/test/cli.js test --config=/tmp/iterojm-ui-polish-20260928/playwright.config.cjs`. The temporary wrapper uses the repository configuration with installed Chrome and isolated test output because the default Playwright browser is absent.
- Final build: `npm run build --workspace=research -- --outDir /tmp/iterojm-ui-polish-20260928/build --emptyOutDir` — passed. Existing bundle-size and Browserslist-data notices remain.
- English/Ukrainian locale keys match: 331 keys; all 173 literal Research translation references resolve. Research diff whitespace check passes.
- Browser inspection covers the study at 1440, 768, 390, and 320px; English/Ukrainian layouts; preparation, plan dialog, results, interview, and team controls. Inspected pages have no horizontal viewport overflow or uncaught page errors. Section anchors clear the header by approximately 16px; result counts align when labels wrap at 320px.
- Local evidence is in `/tmp/iterojm-ui-polish-20260928/`: final test/build logs, `visual-report.json`, and screenshots. These temporary artifacts are not product source.
- Agent routing: mapper Luna/low; implementer Sol/medium (including scoped regression tests); Architect-Orchestrator completed final review, fixes, and verification. The separate Astra/high reviewer stopped on a usage limit and produced no review result.

### Files changed in this pass

- `research/src/app/App.jsx`
- `research/src/components/UI.jsx`
- `research/src/components/HeaderSelect.jsx`
- `research/src/components/PreparationPanel.jsx`
- `research/src/components/StudyPlanPanel.jsx`
- `research/src/components/ResultsPanel.jsx`
- `research/src/pages/StudyPage.jsx`
- `research/src/styles.css`
- `research/src/locales/en.json`
- `research/src/locales/uk.json`
- `research/tests/workflows.spec.js`
- `research/tests/header-dropdowns.spec.js`
- `research/tests/navigation.spec.js`
- `docs/research-ui-review.md`

Vault updates: `01 Product/Prototype Testing Summaries.md` and `99 Changelog.md` in the sibling `iterojm-obsidian` vault.

The tests use mocked APIs and the preview uses synthetic in-memory data. This is local UI validation, not evidence of live authentication, AI-provider quality, uploads, deployment, or Safari/Firefox compatibility. Admin was left running for reference; its earlier checks below were not rerun in this pass.

## 2026-09-25 — earlier workflow review

Scope: polish the implemented Research workflows and the Research section of the admin app on `codex/research-service-architecture`. Preserve the existing interview summary renderer and analysis contracts.

## Changes

- Study pages gained direct navigation to the plan, interviews, task comparison, and overall findings. The overview/next-steps presentation from that pass was subsequently replaced by the compact context described above.
- Interview summaries lead the page, with copy and study-results actions. Recordings, participant linking, and supporting tools have consistent expandable panels.
- Transcript edits have explicit save/discard actions, revision conflict feedback, and navigation protection. Forms protect unsaved changes when closed or navigated away from, including immediate browser-back navigation after typing.
- Dialogs render outside blurred cards, remain inside the viewport, scroll independently, retain keyboard focus, and keep form actions reachable.
- Shared results show coverage, full task names, accessible evidence actions, and readable chart legends. Deep links open the results section directly.
- Authentication/recovery screens have contextual headings, accessible password visibility, and matching Ukrainian/English copy.
- The mobile header, participant/team forms, recording chooser, error/empty states, and narrow tables use consistent spacing and controls.
- Admin access uses MB/minutes and a date picker; job types and feedback are readable; each data section reports its own loading errors. Tables have explicit column widths and desktop action columns. Worker cards stay within the mobile viewport; dark-theme tabs and metrics retain contrast.

## Validation

- Research Playwright suite: all 19 scenarios pass, including mobile dialog bounds, focus trapping, keyboard tabs, unsaved navigation, task evidence, revisions, synthesis sources, and account/recovery screens. The final run uses installed Chrome through a temporary config because the default Playwright browser binary is not installed.
- Research and admin Vite builds pass. Existing large-chunk and Browserslist-data notices remain.
- Research admin ESLint passes; Ukrainian and English keys match, with no missing literal Research translation keys.
- Visual checks cover study/summary/results, long mobile dialogs, authentication, admin limits, jobs, worker empty states, and light/dark mobile admin layouts. Fixed a discovered 778px worker grid overflow at a 390px viewport; the page now measures 390px.

## Local preview boundary

The preview on ports 5174 (Research) and 3000 (admin) uses the actual UI with synthetic, in-memory data. Its banner states that changes last only until restart. AI processing and recording uploads are disabled in the preview. No production credentials, migrations, deployment, or real provider calls are part of this UI review.

The browser scenarios use mocked API responses; they do not verify live authentication, storage uploads, or provider quality. Full production acceptance still requires the separate infrastructure/integration stage.

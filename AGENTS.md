# IteroJM Codex Project Rules

## Project Identity

- IteroJM is a premium B2B SaaS for customer journey mapping, personas, metrics, interview transcription, AI insights, learning materials, and workspace collaboration.
- This is not a Next.js app. Do not invent App Router, server components, or Next-specific conventions.
- The source of truth is a workspace-based monorepo with separate client, server, admin, and Research workspaces, plus an e2e layer.

## Monorepo Structure

- `client/`: main product SPA. React 19 + Vite + Tailwind + React Router + TanStack Query + Supabase browser auth + Recharts + DnD Kit.
- `server/`: primary backend. Node/Express CommonJS + Supabase server client + Google APIs + billing/exports/integrations.
- `admin/`: separate Vite admin SPA. Refine + Ant Design + TypeScript + Supabase.
- `research/`: separate Research SPA. React + Vite + React Router + TanStack Query + Supabase + i18next; follow its existing Research patterns.
- `e2e/`: Playwright tests, helpers, and seeded smoke flows.
- `server/migrations/`: SQL schema changes. Treat this as required for any schema update.
- `server/public/client`, `server/public/admin`, and `server/public/research`: build artifacts. Never hand-edit generated files there.
- `server/app/main.py`: placeholder FastAPI stub, not the main production backend.

## Architectural Ground Truth

- The root `package.json` uses npm workspaces for `client`, `server`, `admin`, and `research`.
- The product app is a React Router SPA. `client/src/App.jsx` is the main routing, auth, workspace, and shell coordinator.
- The Express server owns `/api/*`, static asset serving, canonical host redirects, OAuth callbacks, exports, and production routing behavior.
- `client` builds into `server/public/client`; `admin` builds into `server/public/admin`; `research` builds into `server/public/research`.
- Research is a separate product surface; its Vite dev server uses port `5174` and proxies `/api` to Express on `5005`.
- Local Vite dev proxies `/api` to the Express server on port `5005`.
- Public marketing, authenticated app, and admin are separate surfaces with different visual languages but shared product identity.

## Key Files To Follow

- `client/src/App.jsx`: auth gating, public vs protected routes, workspace switching, mutation flows.
- `client/src/index.css`: shared app surfaces, glassmorphism primitives, inputs, article styles.
- `client/src/hooks/useQueries.js`: query keys, fetch helpers, snake_case-to-client mapping.
- `client/src/pages/LandingPage.jsx`: premium marketing/SEO visual reference.
- `client/src/pages/Dashboard.jsx`, `LearningMaterialsPage.jsx`, `PortraitDetails.jsx`: good product-surface references.
- `server/index.js`: API contract, auth checks, integrations, export routes, host/origin logic.
- `server/billing/entitlements.js`: canonical subscription, capacity, and quota logic.
- `admin/src/App.tsx` and `admin/src/providers/*`: admin resource wiring and Supabase access patterns.
- `playwright.config.js` and `e2e/helpers/*`: test conventions and stable selectors.

## Product UI Rules

- Maintain a premium B2B SaaS feel. The app should look precise, expensive, calm, and intentional.
- Preserve the existing glassmorphism language in the product app:
  - use `app-shell-bg`, `app-surface`, `app-surface-soft`, `app-modal-panel`, `app-empty-state`
  - prefer translucent whites, soft borders, backdrop blur, layered shadows, and large radii
  - avoid flat default gray cards when a premium surface is expected
- Preserve the dark, cinematic, premium marketing aesthetic on landing/SEO pages.
- Preserve the cleaner Ant Design admin aesthetic in `admin/`; do not force product glassmorphism into the admin panel.

## Layout And Spacing Rules

- Use generous spacing. Default to `gap-4`, `gap-6`, `gap-8`, `p-6`, `p-8`, and `leading-6`/`leading-7` before tightening layouts.
- Use `tracking-tight`, bold/black headings, and clean visual hierarchy for premium readability.
- Keep cards, sections, and modal interiors breathable. Do not stack controls too tightly.
- Align action rows, badges, and metadata carefully. Premium UI depends on rhythm and spacing consistency.

## Non-Negotiable Height Rule

- NEVER use fixed heights for text-driven cards, feature blocks, list rows, or modal bodies when the content can grow.
- Do not create layouts where longer titles, translated copy, or dynamic data can overlap, clip, or visually collide.
- Prefer:
  - `min-h-*` instead of `h-*`
  - natural height with padding
  - `overflow-y-auto` for bounded panels
  - `line-clamp` only when intentional
  - flex/grid layouts that expand safely with content
- Acceptable fixed-height exceptions:
  - viewport shells like `h-screen`
  - icon buttons and small control affordances
  - skeleton placeholders
  - chart canvases or export-only rendering boxes
  - journey grid/lane scaffolding where dimensions are structural
  - modals capped by viewport height, as long as inner content scrolls
- If you touch an older fixed-height card that risks overlap, improve it rather than copying the pattern forward.

## Color And Typography Rules

- The main app uses a light premium shell with slate/gray neutrals, white translucent surfaces, orange creation emphasis, blue system/info accents, emerald success, and red destructive states.
- Violet can appear in marketing or selected premium accent moments, but do not let the UI drift into generic purple startup styling.
- Stick with the existing Inter-led typography and strong heading weights.
- Prefer refined gradients and subtle glow/shadow layers over loud saturation.

## Frontend Structure Rules

- Reusable UI belongs in `client/src/components`, grouped by domain:
  - `common/`
  - `journey/`
  - `metrics/`
  - `personas/`
- Route/page-level orchestration belongs in `client/src/pages`.
- Shared config belongs in `client/src/config`.
- Shared transforms and parsing belong in `client/src/utils` or `client/src/hooks/useQueries.js`, not inline in many components.
- Static rich content belongs in `client/src/content` or `client/src/locales`.

## React And Client Coding Conventions

- The client is JS/JSX-first. Do not force broad TypeScript conversion in `client/` unless explicitly requested.
- Use function components and hooks.
- Follow existing patterns:
  - route/page components can own orchestration and mutation logic
  - reusable display components should stay focused and reasonably dumb
  - derived collections and workspace-filtered data can use `useMemo`
  - effects should be purposeful, usually for auth/session, fetching side effects, or URL-driven state
- Keep new abstractions lightweight. This codebase favors pragmatic local helpers over deep framework layers.
- Preserve scroll behavior intentionally. The app shell uses `h-screen` with controlled scroll containers.
- Use `useBodyScrollLock` or similar patterns for overlays that should freeze background scroll.

## Data Fetching And Mutation Rules

- Read-heavy app data should flow through TanStack Query hooks in `client/src/hooks/useQueries.js`.
- Keep existing query keys stable unless there is a good reason to change them.
- Use mapping helpers like `mapJourneyToClient`, `mapPersonaToClient`, `mapMetricToClient`, and similar helpers to normalize server data.
- Do not scatter snake_case-to-camelCase conversions across random components.
- Imperative `fetch` inside pages/components is an accepted mutation pattern here.
- After successful mutations, invalidate the relevant queries with `queryClient.invalidateQueries(...)`.
- Always use `API_BASE_URL`/`API_URL`. Never hardcode localhost or production URLs directly in feature code.

## Auth And Session Rules

- Browser auth is Supabase-driven.
- Use `getAuthToken()` from `client/src/services/auth.js` for authenticated fetches.
- Send `Authorization: Bearer ${token}` for protected API requests.
- For JSON writes, send `Content-Type: application/json`.
- Do not reintroduce legacy custom auth token or user objects in localStorage. The repo intentionally moved away from that.
- Respect the existing auth/session cleanup behavior in `services/auth.js`.

## Workspace And Domain Rules

- Workspaces are a core domain boundary. Most product data is workspace-scoped.
- Preserve workspace switching, owner/member roles, and filtering behavior.
- When adding new entities or actions, think about:
  - `workspace_id`
  - owner/member permissions
  - archive vs delete behavior
  - limits/quotas
- Archived content is a first-class pattern in this app. Do not hard-delete when archive semantics already exist.

## i18n And Content Rules

- User-facing product copy should support English and Ukrainian where appropriate.
- Update `client/src/locales/en.json` and `client/src/locales/uk.json` for app UI strings.
- For rich legal/marketing/article content, follow the existing `content/` and landing-page patterns.
- Preserve SEO and head-management behavior already implemented in `LandingPage.jsx`; do not assume React Helmet is in use.

## Charts And Export Rules

- Recharts is used in the product client.
- Be careful with `ResponsiveContainer` in export/headless contexts. Export rendering may require deterministic dimensions.
- Do not regress the signed export flow or PDF generation behavior.
- When touching export-specific chart rendering, prefer explicit dimensions and stable layout boxes over fragile responsive assumptions.

## Server Rules

- `server/` is CommonJS. Keep server files in the existing module style unless the repo intentionally migrates.
- `server/index.js` is large, but it is the authoritative backend entrypoint today. Respect existing route naming and response shapes.
- Check auth early in routes. Existing routes commonly return:
  - success: `{ status: 'success', data: ... }`
  - error: `{ status: 'error', message: ... }` or `{ error: ... }`
- Preserve host/origin logic for canonical landing, app, and admin domains.
- Preserve CORS behavior and proxy awareness.
- Do not leak secrets to the browser.

## Supabase Rules

- Browser clients use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Server privileged work uses `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY`.
- Never expose service-role keys to client code.
- Use `supabase.auth.getUser(token)` or the existing helper flow to validate bearer tokens on the server.
- Use `supabaseAdmin` only for privileged operations, RLS bypass, admin flows, storage init, billing, and system-managed writes.
- Keep RLS and ownership assumptions intact when designing new queries or tables.
- Schema changes must ship with SQL migrations under `server/migrations`.

## Billing And Entitlements Rules

- `server/billing/entitlements.js` is the canonical place for subscription resolution, capacity limits, and billing-period quotas.
- Do not duplicate quota logic in random route handlers or client code.
- If a feature consumes quota or capacity, wire it through the existing entitlement helpers.
- If the schema changes for billing, also update:
  - migrations
  - client limit displays
  - admin plan forms
  - any server enforcement logic

## Google Sheets And Excel Integration Rules

- External metric integrations are already modeled in the app. Follow the existing flow instead of inventing a new one.
- Google APIs are used in two different ways here:
  - Google Sheets OAuth/data sync for metrics
  - Gemini server-side generation/transcription work for interview workflows
- Google Sheets:
  - OAuth starts at `/api/integrations/google_sheets/authorize`
  - callback is handled server-side
  - metric config uses `integrationConfig.spreadsheetId` and `integrationConfig.range`
  - sheet discovery uses `/api/integrations/google_sheets/spreadsheet-info`
- Microsoft Excel:
  - modeled similarly with `fileId`, `sheetName`, and `range`
  - UI is currently intentionally disabled via `MS_EXCEL_DISABLED`
  - do not present Excel as fully available until the Azure registration issue is actually resolved
- Persisted external metric sync should go through `/api/metrics/:id/sync`.
- Pre-save or preview-style fetches should use the existing `/api/integrations/fetch-data` path.
- OAuth tokens in `user_integrations` should remain encrypted at the application layer.

## Interview AI Pipeline Rules

- Interview summary/transcription logic lives on the server, not in the browser.
- Keep Gemini/OpenAI keys and prompt construction server-side only.
- Preserve the structured JSON-output contract used for interview summaries and portraits.
- Do not casually change summary section keys, transcript normalization behavior, or system-state metadata without tracing the downstream UI and storage impact.
- If you touch interview generation flows, verify quota enforcement, transcription metadata, and fallback behavior together.

## Admin App Rules

- The admin app is TypeScript-first and uses Refine + Ant Design + Supabase.
- Keep explicit typing at provider/page boundaries in `admin/`.
- Follow existing admin conventions:
  - `React.FC`
  - local interfaces/types near page modules
  - Refine resources and providers for CRUD/admin wiring
- Preserve the extra admin role gate enforced through `profiles.role === 'admin'`.
- Keep the admin UI crisp and restrained, with clean borders and controlled shadows, not marketing-style glassmorphism.

## Playwright And Testing Rules

- Playwright smoke coverage is important in this repo.
- Prefer stable selectors based on `data-testid` for new critical interactions.
- Do not casually remove or rename existing `data-testid` attributes used by e2e flows.
- High-risk flows already covered include auth, admin access, settings, interviews, workspace switching, editor autosave, content, and export-adjacent behaviors.
- Use the existing local helper commands when validating locally:
  - `npm run seed:e2e:local`
  - `npm run test:e2e:local`
  - `npm run test:e2e:smoke:local`
- After meaningful changes, prefer keeping the smoke suite green.

## Things To Avoid

- Do not add Next.js patterns or assume SSR.
- Do not add a second API client abstraction unless there is a compelling repo-wide reason.
- Do not replace the current auth/session model with custom storage.
- Do not hand-edit generated bundles in `server/public/*`.
- Do not flatten premium UI into generic placeholder SaaS cards.
- Do not introduce fixed text-card heights that can break under longer copy or translation.
- Do not bypass the existing workspace, quota, or role logic.

## Default Change Strategy

- Start from the existing structure and visual language before introducing new patterns.
- Prefer incremental improvements that match the repo over greenfield rewrites.
- If you change data shape or schema, follow through across server, client, admin, migrations, and tests.
- If you touch premium UI, make it feel more polished, not more generic.


## Manual Agent Orchestra

- The owner starts product tasks manually. The main agent is authorized and instructed to choose single-agent work or delegate according to the routing rules, without asking for approval of each subtask. Read relevant sections of [docs/agent-orchestra.md](docs/agent-orchestra.md) when needed. There are no hooks, schedules, or automatic task starters.
- Small, clear, low-risk changes in 1–3 files stay with the main agent or one implementer. Medium scoped tasks use serial implementation, testing, and independent review. Large, unclear, multi-module, or high-risk work requires a plan and owner approval before writing.
- At most two subagents run concurrently, excluding the main agent. Independent read-only investigations may run in parallel on stable files; exactly one writer total (including main, output-generating tests, and vault keeper) owns an explicit file allowlist at a time. Subagents must not spawn agents.
- Record a frozen baseline and ownership handoff; preserve pre-existing changes. Reserve `server/index.js`, `package-lock.json`, and shared interview contracts explicitly before changes.
- No autonomous deployment, migrations, seeding, production network actions, changes beyond the packet, or weakened tests. After two failed attempts, report evidence and escalate.
- Choose validation for the actual change. Root `npm run build` installs dependencies, downloads Chromium, and deletes generated client/admin output; do not use it as routine validation. E2E seeding writes a database. Migration checks require a named empty disposable local database and explicit owner authorization.
- Read-only reviewers consume validation evidence and request executable checks from the test writer. Mock passes do not establish production readiness.
- Obsidian updates are sequential and only to explicitly approved Markdown paths in the sibling vault; never edit vault settings. The detailed permission, evidence, and final-report rules are in the orchestra guide.

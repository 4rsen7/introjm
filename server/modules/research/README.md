# Research closed-beta core

This slice implements separate product workspaces, explicit bootstrap, studies
with a required shared goal and optional brief, transcript-backed sessions, source
revisions, conservative summary staleness and soft archival. The separate jobs router and worker generate prototype summaries and study
synthesis. Recording processing, invitations and paid plans are not included.
See `docs/research-implementation-status.md` for the current contract and runbook.

`createResearchRouter({supabaseAdmin, authenticate, enabled, onError})` takes the
**raw** privileged database client and an async bearer-token validator returning
`{user,error}`. Mount at `/api/research`. `enabled` defaults to false. Do not turn
it on unless legacy product scoping is also on and verified. Flag-off requests
touch neither Auth nor the database, so old installations need no new schema.

## Staging prerequisites

1. Audit the live schema, all SECURITY DEFINER functions, triggers, policies,
   views and grants; the repo is not the full schema source. In particular,
   an unknown SECURITY DEFINER writer can bypass table RLS and must be audited.
2. Apply `20260924_research_core.sql`, then `20260924_research_legacy_views.sql`,
   then `20260924_research_jobs.sql`.
   The core migration aborts if `workspaces.owner_id` has a single-column unique
   index. An operator must review that constraint and the account provisioning
   triggers before replacing it; this migration never guesses a destructive fix.
   Confirm whether a product-specific unique constraint fits the intended model;
   onboarding itself uses a lock and ledger without forbidding future workspaces.
3. Run database tests and test actual staging owner/member/outsider identities
   against both legacy API and direct Supabase access. All Research tables and
   Research rows in shared tables are browser-inaccessible; Research reads and
   writes go through the server. Admin direct CRUD is intentionally legacy-only.
4. Provision an explicit `research_access_grants` row through a trusted service
   operation for each beta owner. Choose `expires_at`, `max_studies` and
   `max_interviews` and `max_analyses` for the actual beta; no billing subscription is created.
5. Enable product scoping before Research. Disable Research before rollback.
   After Research data exists, never roll back to code without product scoping.

## Access, limits and edits

Read access follows workspace ownership/membership. Writes additionally require
the owner's active beta grant. Database write RPCs recheck this and lock the
grant row; simultaneous creates cannot exceed its allocation across workspaces.
Archived rows still count. Reads remain available after a grant expires.

Bootstrap is explicit and idempotent; it returns an existing owned/member
Research workspace or creates one with a valid grant. It never returns an IteroJM
workspace or accepts cross-product invitations. A removed previous workspace
requires operator action rather than silent recreation.

Study changes require `revision`. Session changes require `research_revision`,
`transcript_revision` and `summary_revision`; conflicts return HTTP 409. Source
edits retain the saved summary. Whitespace-only source changes do not newly mark
it stale; all other changes conservatively do. This is not an AI assessment of
semantic importance. Goal or brief edits also mark existing session summaries
stale. No automatic generation or quota consumption is hidden in reads/edits.

List responses are bounded: `limit` defaults to 50, maximum 100; use the last
returned row's `id` as `before` for the next page. IDs sort descending (stable,
not chronological). Session lists omit transcript and summary bodies.

Every new writer RPC is service-only. Known legacy usage-increment RPCs also lose
browser EXECUTE privilege; existing server usage uses the service role. Unknown
live RPCs still require the schema audit above.

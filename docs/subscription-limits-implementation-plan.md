# Subscription Limits Implementation Plan

## Goal

Rework subscription limits so billing periods are enforced consistently, workspace entitlements are computed from a single source of truth, and the admin panel can safely manage both capacity limits and period-based quotas.

## Implementation Status

### Implemented in code

- centralized entitlement resolution in `server/billing/entitlements.js`
- subscription validity now respects `current_period_end`
- `/api/workspace/limits` now returns normalized `billing`, `capacity`, and `quotas`
- period quota plan fields were added to the migration set:
  - `max_portraits_per_period`
  - `max_ai_summaries_per_period`
  - `max_exports_per_period`
- `workspace_period_usage` migration and increment function were added
- interview usage now prefers billing-period usage with legacy fallback
- quota enforcement is wired for:
  - interview creation
  - portrait generation
  - AI insight generation
  - PDF export generation
- admin plans pages now expose the new quota fields
- admin user billing history now distinguishes active / expired / canceled / scheduled-end states
- client Settings now shows separate billing-period quota rows for all tracked quota features
- client-side limit handling now respects quota errors for portrait generation, AI summaries, and PDF export

### Still operationally pending

- apply the new SQL migrations in each environment
- verify backfilled interview usage against production subscriptions/workspaces
- finish provider-authoritative Lemon Squeezy sync so cancellation and renewal states are persisted locally
- remove legacy `workspace_usage_counters` only after parity checks

## Current State Summary

### What works today

- Workspace limits are derived from the workspace owner's active subscription in `server/index.js`.
- `members`, `journeys`, `personas`, and `metrics` are effectively capacity limits based on current row counts.
- `interviews` are enforced through `workspace_usage_counters.interviews_created`, which behaves like cumulative consumption.
- The client reads limits through `/api/workspace/limits` and shows them in Settings.
- The admin panel already manages plan caps through the `plans` resource.

### Main problems

- `current_period_end` is stored but not enforced as part of active entitlement resolution.
- `subscription_cancelled` and other provider state transitions are not fully reflected in local access rules.
- Capacity limits and period quotas are mixed inside one `usage` payload without clear semantics.
- `interviews` behave differently from the other features, but the UI and admin labels do not explain that difference.
- Limit checks are duplicated inline in several endpoints instead of going through one entitlement layer.

## Product Decision

### Capacity limits

These should remain based on the current amount of data in a workspace:

- members
- journeys
- personas
- metrics

Rule:

- deleting an item frees a slot
- no monthly reset is needed

### Period quotas

These should be enforced per billing period:

- interviews created
- portrait generations
- AI insight generations
- export jobs

Rule:

- usage resets at the start of a new billing period
- deleting an item does not refund quota by default

## Recommended Delivery Strategy

Use an incremental approach that fits the current codebase and admin UI.

### Phase 1: Centralize entitlement resolution

Create one server-side billing/entitlements module responsible for:

- resolving the workspace owner
- resolving the current active subscription
- checking that the subscription is still valid for `now`
- returning one normalized object with:
  - plan metadata
  - billing period boundaries
  - capacity usage
  - quota usage

Target extraction from:

- `server/index.js`

Suggested module split:

- `server/billing/entitlements.js`
- `server/billing/usage.js`
- `server/billing/subscriptions.js`

Key rule:

- a subscription is active only when `status = 'active'` and `current_period_end > now`

### Phase 2: Introduce period usage storage

Add a dedicated table for usage that is tied to a billing period.

Suggested table:

- `workspace_period_usage`

Suggested columns:

- `id`
- `workspace_id`
- `feature_key`
- `period_start`
- `period_end`
- `used`
- `created_at`
- `updated_at`

Unique constraint:

- `(workspace_id, feature_key, period_start, period_end)`

Suggested initial `feature_key` values:

- `interviews_created`
- `portrait_generations`
- `ai_summaries`
- `pdf_exports`

This removes the need for cron-based resets. A new billing period naturally produces a new usage row.

### Phase 3: Keep plans incremental, but clarify semantics

For the first delivery, keep the existing `plans` table model and avoid a full dynamic entitlement system.

Keep these columns as capacity:

- `max_members`
- `max_journeys`
- `max_personas`
- `max_metrics`

Reinterpret or replace `max_interviews` as a period quota:

- either rename to `max_interviews_per_period`
- or keep the column temporarily and document its meaning clearly in admin and client

If we add more quota-based features soon, add explicit plan columns as part of the same migration:

- `max_portraits_per_period`
- `max_ai_summaries_per_period`
- `max_exports_per_period`

This is less abstract than a generic entitlement table, but much safer for the current admin implementation.

### Phase 4: Update all enforcement points

Move all limit checks behind one server helper such as:

- `getWorkspaceEntitlements(workspaceId, now)`
- `assertWorkspaceCanUseFeature({ workspaceId, featureKey, delta })`

Apply it to:

- journey creation
- persona creation
- metric creation
- member invite / member acceptance
- interview creation
- portrait generation
- AI insights generation
- export generation

This is required so the system no longer depends on each route interpreting limits differently.

### Phase 5: Make provider sync authoritative

Update Lemon Squeezy handling so local subscriptions reflect provider truth.

Required changes:

- persist provider subscription identifier
- persist billing interval
- update `current_period_start` and `current_period_end` from provider events
- handle cancellation and renewal explicitly
- stop treating `current_period_end` as informational only

Important product rule:

- cancellation should usually keep access until the end of the paid period
- failed renewal should move the subscription into a restricted or grace state, not silently remain active forever

## Admin Panel Changes

Admin work is part of this implementation, not a follow-up.

### Plans pages

Files involved:

- `admin/src/pages/plans/create.tsx`
- `admin/src/pages/plans/edit.tsx`
- `admin/src/pages/plans/list.tsx`

Required changes:

- clearly separate capacity limits from billing-period quotas in labels and grouping
- rename current interview field label to show period semantics
- add any new quota fields introduced in the migration
- update helper text so admins know whether a value is "per workspace" or "per billing period"

Recommended UI structure:

- `Workspace Capacity`
- `Billing Period Quotas`

### Admin user billing actions

Current manual assignment flows must continue to work, but need better semantics.

Required changes:

- make sure manual assignment writes a valid billing period
- show period boundaries in admin user detail
- display whether the current subscription is active, expired, canceled, or scheduled to end

## Client Changes

### Settings and usage display

Files involved:

- `client/src/pages/SettingsPage.jsx`
- `client/src/hooks/useQueries.js`

Required changes:

- show the billing period end clearly
- split visual presentation between capacity and period quota when applicable
- avoid showing all limits as if they behaved the same way

Recommended display:

- `Workspace capacity`
- `This billing period`

Example:

- Members: `3 / 5`
- Interviews this period: `7 / 20`

### Upgrade and downgrade behavior

Client should reflect these rules:

- upgrade applies immediately
- downgrade never deletes data automatically
- if a workspace is above the new capacity limit, creation is blocked but existing items stay visible

## API Shape Recommendation

Keep `/api/workspace/limits` but evolve the payload.

Recommended response shape:

- `planName`
- `planId`
- `billing`
  - `status`
  - `currentPeriodStart`
  - `currentPeriodEnd`
  - `interval`
- `capacity`
  - `members`
  - `journeys`
  - `personas`
  - `metrics`
- `quotas`
  - `interviewsCreated`
  - `portraitGenerations`
  - `aiSummaries`
  - `pdfExports`

Each item should contain:

- `used`
- `limit`
- `remaining`

This lets the client stay simple and removes UI-side guessing.

## Data Migration Plan

### Required migrations

1. Add any missing subscription/provider fields needed for authoritative billing state.
2. Create `workspace_period_usage`.
3. Add or rename quota-related plan fields.
4. Backfill current interview quota into the current billing period for active subscriptions.

### Backfill strategy

For `interviews_created`:

- resolve the current active subscription period for each workspace owner
- map workspaces to owners
- seed one `workspace_period_usage` row for the active period using the current `workspace_usage_counters.interviews_created`

Do not delete `workspace_usage_counters` in the same deployment.

Keep it temporarily for rollback and parity checks.

## Rollout Plan

### Step 1

- land the entitlement module behind the current `/api/workspace/limits`
- no client behavior change yet

### Step 2

- add period usage table and dual-write interview usage to old and new counters

### Step 3

- switch interview enforcement to the new period usage source

### Step 4

- add portrait / AI / export quotas if product confirms they should be period-based

### Step 5

- clean up legacy interview counter code after verification

## Testing Plan

### Server/API

Cover:

- workspace owner with active monthly plan
- workspace owner with expired plan
- member inheriting owner entitlements
- downgrade while usage is already above cap
- interview quota at period boundary
- manual admin assignment with custom end date
- Lemon Squeezy renewal and cancellation transitions

### E2E / smoke

Add or extend smoke for:

- settings page shows normalized limits payload correctly
- creating an interview consumes period quota
- hitting interview quota blocks creation with the correct message
- portrait generation is blocked when its quota is exhausted
- admin plan edit persists the new labels/fields

### Manual QA

- owner upgrades plan and sees larger limits immediately
- owner downgrades plan and existing data remains available
- member sees the same workspace limits as owner
- expired subscription loses entitlement without manual cleanup

## Recommended First Implementation Slice

The safest first coding slice is:

1. extract entitlement resolution from `server/index.js`
2. enforce `current_period_end > now`
3. define the normalized `/api/workspace/limits` payload
4. update Settings UI to display capacity vs quota explicitly
5. update admin labels for interview limits to indicate billing-period semantics

This gives immediate product clarity before deeper quota migrations.

# Playwright E2E

This suite covers the highest-risk browser flows first:

- sign in and sign out
- admin access control
- settings plan visibility
- interview creation modal
- workspace-switch isolation for interviews
- seeded journeys, personas, and metrics visibility

## 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

## 2. Seed reusable test fixtures

The safest flow is to create dedicated E2E users and workspaces once and re-run the seed whenever needed:

```bash
cp e2e/.env.example .env.e2e
# update values only if you want different test accounts
npm run seed:e2e:local
```

The seed script:

- creates or updates owner/member/admin auth users
- upserts `profiles.role`
- ensures owner, member, and shared workspaces exist
- adds the member into the shared workspace
- seeds one journey, persona, metric, and shared interview for stable smoke tests

It requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your environment.

The repo already has a local ignored file at [/.env.e2e](/Users/avrdnn/Desktop/iterojm/iterojm/.env.e2e) with dedicated test accounts:

- `e2e-auth@iterojm.test`
- `e2e-owner@iterojm.test`
- `e2e-member@iterojm.test`
- `e2e-admin@iterojm.test`

When you run the seed script with your Supabase service role key, those accounts will be created or updated automatically.

For local work you do not need to export everything manually every time. The repo now has helper commands that auto-load both [/.env.e2e](/Users/avrdnn/Desktop/iterojm/iterojm/.env.e2e) and [server/.env](/Users/avrdnn/Desktop/iterojm/iterojm/server/.env):

```bash
npm run seed:e2e:local
npm run test:e2e:local
npm run test:e2e:smoke:local
```

## 3. Configure test users

Set these variables manually only if you want to run without the local helper scripts:

```bash
export E2E_OWNER_EMAIL="owner@example.com"
export E2E_OWNER_PASSWORD="your-password"
```

Optional dedicated auth smoke user:

```bash
export E2E_AUTH_EMAIL="auth@example.com"
export E2E_AUTH_PASSWORD="your-password"
```

Optional workspace-isolation test variables:

```bash
export E2E_MEMBER_EMAIL="member@example.com"
export E2E_MEMBER_PASSWORD="your-password"
export E2E_MEMBER_SHARED_WORKSPACE="Client Workspace"
export E2E_MEMBER_PERSONAL_WORKSPACE="My Workspace"
export E2E_SHARED_INTERVIEW_TITLE="Interview - Shared"
```

If the optional variables are missing, the workspace-switch test is skipped.

Optional admin variables:

```bash
export E2E_ADMIN_EMAIL="admin@example.com"
export E2E_ADMIN_PASSWORD="your-password"
export PLAYWRIGHT_ADMIN_URL="http://127.0.0.1:3000"
```

If admin credentials are missing, admin tests are skipped.

## 4. Run

```bash
npm run test:e2e:smoke
```

For the full suite:

```bash
npm run test:e2e
```

If you already started the app manually, skip the embedded dev server:

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e
```

## CI setup

A GitHub Actions workflow is ready at [/.github/workflows/playwright.yml](/Users/avrdnn/Desktop/iterojm/iterojm/.github/workflows/playwright.yml).

Add these repository secrets in GitHub:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `E2E_AUTH_EMAIL`
- `E2E_AUTH_PASSWORD`
- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`
- `E2E_OWNER_WORKSPACE`
- `E2E_OWNER_JOURNEY_TITLE`
- `E2E_OWNER_PERSONA_NAME`
- `E2E_OWNER_METRIC_NAME`
- `E2E_MEMBER_EMAIL`
- `E2E_MEMBER_PASSWORD`
- `E2E_MEMBER_PERSONAL_WORKSPACE`
- `E2E_MEMBER_SHARED_WORKSPACE`
- `E2E_SHARED_INTERVIEW_TITLE`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`

The easiest way is to mirror the values from [/.env.e2e](/Users/avrdnn/Desktop/iterojm/iterojm/.env.e2e) into GitHub Secrets, and use your real Supabase keys for the three Supabase secrets.

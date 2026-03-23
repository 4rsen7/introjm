# Hostinger Deploy Automation

This repo uses a practical deployment split:

- `iterojm.com` backend is deployed by Hostinger from the repository
- `app.iterojm.com` is served from `public_html/app`
- `admin.iterojm.com` is served from `public_html/admin`

The reliable automation path for this setup is:

1. build `client` and `admin` inside GitHub Actions
2. upload the built static bundles to Hostinger over SSH/SCP
3. optionally run a backend restart command after a short settle delay

This avoids depending on `node`/`npm` availability in the Hostinger SSH shell.

## Default Production Flow

Production deploys should normally happen like this:

1. merge or push the change to `main`
2. let GitHub Actions run `Deploy To Hostinger`
3. verify the workflow succeeded in GitHub
4. smoke-check production

For day-to-day work, this is the canonical path.

If GitHub Actions is configured correctly, you should not need to run a local deploy command from your laptop just to release a normal change.

## What To Use

Use this for normal production releases:

- push to `main`
- GitHub Actions workflow: `/Users/avrdnn/Desktop/iterojm/iterojm/.github/workflows/deploy-hostinger.yml`

Use the local SSH scripts only as a fallback:

- GitHub Actions is unavailable
- you are doing infrastructure recovery
- you intentionally want a one-off manual deploy from a trusted machine

Do not assume `npm run deploy:hostinger:ssh` is the standard path in local development shells. It requires explicit SSH env vars and is not expected to work unless that machine is prepared for manual deployment.

## Manual SSH Helpers

Server-side script:

- `/Users/avrdnn/Desktop/iterojm/iterojm/scripts/deploy-hostinger.sh`

Local SSH wrapper:

- `/Users/avrdnn/Desktop/iterojm/iterojm/scripts/deploy-hostinger-over-ssh.sh`

These helpers are intentionally secondary. Keep them for break-glass or operator use, not as the default team workflow.

## GitHub Actions after push to main

Workflow:

- `/Users/avrdnn/Desktop/iterojm/iterojm/.github/workflows/deploy-hostinger.yml`

### Required GitHub secrets

SSH / destination:

- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_USER`
- `HOSTINGER_SSH_KEY`
- `HOSTINGER_SSH_PORT`
- `HOSTINGER_PUBLIC_HTML_DIR`
- `HOSTINGER_SERVER_RESTART_COMMAND` (optional)
- `HOSTINGER_DEPLOY_SETTLE_SECONDS` (optional)

Frontend build secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- `VITE_LANDING_ORIGIN`
- `VITE_APP_ORIGIN`

Recommended values:

- `HOSTINGER_PUBLIC_HTML_DIR=/home/<user>/domains/iterojm.com/public_html`
- `HOSTINGER_DEPLOY_SETTLE_SECONDS=120`
- `VITE_API_BASE_URL=https://iterojm.com/api`
- `VITE_LANDING_ORIGIN=https://iterojm.com`
- `VITE_APP_ORIGIN=https://app.iterojm.com`

### How the workflow now works

On every push to `main`, GitHub Actions:

1. checks out the repository
2. installs dependencies in GitHub Actions
3. writes `client/.env.production.local` and `admin/.env.production.local` from GitHub secrets
4. builds `client` and `admin`
5. archives:
   - `server/public/client`
   - `server/public/admin`
6. uploads those archives to Hostinger
7. extracts them into:
   - `public_html/app`
   - `public_html/admin`
8. optionally waits a bit and runs a backend restart command

This means:

- no File Manager uploads
- no manual asset cleanup
- no `npm install` on Hostinger over SSH
- no need to trigger a local manual deploy for routine application changes

## Backend vs Static Deploy

The deploy is intentionally split:

- backend code deployment is handled by your Hostinger Node app / git integration
- frontend static bundles for `app` and `admin` are deployed by the GitHub Actions workflow

That means a push to `main` can involve two pieces of automation:

- Hostinger updates backend code from git
- GitHub Actions uploads the built `app` and `admin` bundles

This is expected for this setup.

## Post-Deploy Check

After the workflow finishes, verify:

1. the GitHub Actions job is green
2. `iterojm.com` API still responds
3. `app.iterojm.com` loads the new frontend
4. `admin.iterojm.com` loads the new admin bundle
5. the changed feature works in production

## Notes

- The workflow deletes old contents inside `public_html/app` and `public_html/admin` before extracting the new bundles, so stale hashed assets do not linger.
- Hidden files such as `.htaccess` are preserved because the deploy uploads tar archives, not a shallow file copy.
- The backend restart is intentionally optional because Hostinger setups vary.
- The workflow only automates the static `app` and `admin` deployments plus an optional restart hook.

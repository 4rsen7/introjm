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

## Manual SSH deploy helper

Server-side script:

- `/Users/avrdnn/Desktop/iterojm/iterojm/scripts/deploy-hostinger.sh`

Local SSH wrapper:

- `/Users/avrdnn/Desktop/iterojm/iterojm/scripts/deploy-hostinger-over-ssh.sh`

These helpers are still useful when you are deploying from a machine that already has Node available, but the primary production path is now GitHub Actions.

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

## Notes

- The workflow deletes old contents inside `public_html/app` and `public_html/admin` before extracting the new bundles, so stale hashed assets do not linger.
- Hidden files such as `.htaccess` are preserved because the deploy uploads tar archives, not a shallow file copy.
- The backend restart is intentionally optional because Hostinger setups vary.
- Backend code deployment is still handled by your Hostinger Node app / git integration. The workflow only automates the static `app` and `admin` deployments plus an optional restart hook.

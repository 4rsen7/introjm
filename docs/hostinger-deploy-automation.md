# Hostinger Deploy Automation

This repo uses a practical deployment split:

- `iterojm.com` backend is deployed from the repository
- `app.iterojm.com` is served from `public_html/app`
- `admin.iterojm.com` is served from `public_html/admin`

The missing automation step is syncing freshly built static assets from:

- `server/public/client`
- `server/public/admin`

into the live Hostinger directories.

## Stage 1: One-command deploy over SSH

Server-side script:

- `/Users/avrdnn/Desktop/iterojm/iterojm/scripts/deploy-hostinger.sh`

Local SSH wrapper:

- `/Users/avrdnn/Desktop/iterojm/iterojm/scripts/deploy-hostinger-over-ssh.sh`

### What the server-side deploy script does

1. Optionally pulls latest `main`
2. Loads env from:
   - `server/.env`
   - optional `.env.hostinger.deploy`
3. Generates:
   - `client/.env.production.local`
   - `admin/.env.production.local`
4. Installs dependencies
5. Installs Playwright Chromium
6. Builds `client` and `admin`
7. Syncs:
   - `server/public/client/` -> `public_html/app/`
   - `server/public/admin/` -> `public_html/admin/`
8. Optionally runs a restart command

### Required server-side env

Minimum values required for the static frontend build:

- `VITE_SUPABASE_URL` or `SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` or `CANONICAL_ORIGIN`
- `VITE_LANDING_ORIGIN` or `CANONICAL_ORIGIN`
- `VITE_APP_ORIGIN` or `APP_ORIGIN`

If your SSH shell does not expose the same env vars as hPanel, create:

- `.env.hostinger.deploy`

from:

- `.env.hostinger.deploy.example`

Do not commit that file.

### Running the deploy manually

On the Hostinger server:

```bash
cd /path/to/repository
bash scripts/deploy-hostinger.sh
```

From your local machine over SSH:

```bash
export HOSTINGER_SSH_HOST=your.host
export HOSTINGER_SSH_USER=your-user
export HOSTINGER_SSH_PORT=22
export HOSTINGER_REPO_DIR=/home/your-user/domains/iterojm.com/nodejs
export HOSTINGER_PUBLIC_HTML_DIR=/home/your-user/domains/iterojm.com/public_html
bash scripts/deploy-hostinger-over-ssh.sh
```

Optional:

```bash
export HOSTINGER_SERVER_RESTART_COMMAND='touch /home/your-user/domains/iterojm.com/public_html/tmp/restart.txt'
```

## Stage 2: GitHub Actions after push to main

Workflow:

- `/Users/avrdnn/Desktop/iterojm/iterojm/.github/workflows/deploy-hostinger.yml`

Required GitHub secrets:

- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_USER`
- `HOSTINGER_SSH_KEY`
- `HOSTINGER_SSH_PORT`
- `HOSTINGER_REPO_DIR`
- `HOSTINGER_PUBLIC_HTML_DIR`
- `HOSTINGER_SERVER_RESTART_COMMAND` (optional)
- `HOSTINGER_DEPLOY_SETTLE_SECONDS` (optional)

Frontend build secrets (recommended, so SSH deploy does not depend on hPanel env visibility):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- `VITE_LANDING_ORIGIN`
- `VITE_APP_ORIGIN`

Optional fallback secrets if you prefer reusing server-style names:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `CANONICAL_ORIGIN`
- `APP_ORIGIN`

Recommended values:

- `HOSTINGER_REPO_DIR=/home/<user>/domains/iterojm.com/nodejs`
- `HOSTINGER_PUBLIC_HTML_DIR=/home/<user>/domains/iterojm.com/public_html`
- `HOSTINGER_DEPLOY_SETTLE_SECONDS=120` (optional, useful if Hostinger updates the `nodejs` checkout shortly after push)
- `VITE_API_BASE_URL=https://iterojm.com/api`
- `VITE_LANDING_ORIGIN=https://iterojm.com`
- `VITE_APP_ORIGIN=https://app.iterojm.com`

If you accidentally set `HOSTINGER_REPO_DIR` to `public_html`, the workflow now tries to auto-detect `.builds/source/repository`, but it is still better to store the exact repository path in the secret.

### How it works

On every push to `main`, GitHub Actions:

1. connects to the Hostinger server over SSH
2. enters the deployment repo
3. optionally waits a bit for Hostinger's own git sync to settle
4. runs `bash scripts/deploy-hostinger.sh`

This means:

- no File Manager uploads
- no manual asset cleanup
- no manual syncing of `app` and `admin`

## Notes

- The script uses `rsync --delete` when available, so old hashed assets are removed automatically.
- If `rsync` is unavailable, it falls back to cleaning the target directory and copying files.
- The backend restart is intentionally optional because Hostinger setups vary.
- If you see `fatal: not a git repository`, it usually means `HOSTINGER_REPO_DIR` points to the wrong folder. For your Hostinger setup, the correct repository path is `/home/<user>/domains/iterojm.com/nodejs`.
- The workflow intentionally skips `git fetch/pull` on the server because the Hostinger-managed `nodejs` checkout may not have non-interactive GitHub credentials. It builds from whatever revision Hostinger has already synced there.

#!/usr/bin/env bash

set -Eeuo pipefail

log() {
  printf '[deploy-hostinger] %s\n' "$*"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$name" >&2
    exit 1
  fi
}

write_env_file() {
  local target="$1"
  shift
  : > "$target"
  while (($#)); do
    printf '%s\n' "$1" >> "$target"
    shift
  done
}

sync_dir() {
  local source_dir="$1"
  local target_dir="$2"

  mkdir -p "$target_dir"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$source_dir"/ "$target_dir"/
    return
  fi

  find "$target_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "$source_dir"/. "$target_dir"/
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_DIR"

if [[ -f "$REPO_DIR/server/.env" ]]; then
  set -a
  . "$REPO_DIR/server/.env"
  set +a
fi

if [[ -f "$REPO_DIR/.env.hostinger.deploy" ]]; then
  set -a
  . "$REPO_DIR/.env.hostinger.deploy"
  set +a
fi

GIT_REMOTE="${DEPLOY_GIT_REMOTE:-origin}"
GIT_BRANCH="${DEPLOY_GIT_BRANCH:-main}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"

if [[ "$SKIP_GIT_PULL" != "1" ]]; then
  log "Fetching latest ${GIT_BRANCH} from ${GIT_REMOTE}"
  git fetch "$GIT_REMOTE" "$GIT_BRANCH"
  git pull --ff-only "$GIT_REMOTE" "$GIT_BRANCH"
fi

PUBLIC_HTML_DIR="${PUBLIC_HTML_DIR:-}"
if [[ -z "$PUBLIC_HTML_DIR" ]]; then
  if [[ "$REPO_DIR" == *"/.builds/source/repository" ]]; then
    PUBLIC_HTML_DIR="$(cd "$REPO_DIR/../../.." && pwd)"
  elif [[ "$REPO_DIR" == *"/nodejs" ]] && [[ -d "$REPO_DIR/../public_html" ]]; then
    PUBLIC_HTML_DIR="$(cd "$REPO_DIR/../public_html" && pwd)"
  elif [[ -d "$REPO_DIR/public_html" ]]; then
    PUBLIC_HTML_DIR="$REPO_DIR/public_html"
  else
    printf 'Unable to infer PUBLIC_HTML_DIR. Set PUBLIC_HTML_DIR explicitly.\n' >&2
    exit 1
  fi
fi

APP_STATIC_DIR="${APP_STATIC_DIR:-$PUBLIC_HTML_DIR/app}"
ADMIN_STATIC_DIR="${ADMIN_STATIC_DIR:-$PUBLIC_HTML_DIR/admin}"
RESEARCH_STATIC_DIR="${RESEARCH_STATIC_DIR:-$PUBLIC_HTML_DIR/research}"

VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}"
VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-${CANONICAL_ORIGIN:-https://iterojm.com}/api}"
VITE_LANDING_ORIGIN="${VITE_LANDING_ORIGIN:-${CANONICAL_ORIGIN:-https://iterojm.com}}"
VITE_APP_ORIGIN="${VITE_APP_ORIGIN:-${APP_ORIGIN:-https://app.iterojm.com}}"
VITE_PADDLE_CLIENT_TOKEN="${VITE_PADDLE_CLIENT_TOKEN:-}"
VITE_PADDLE_ENV="${VITE_PADDLE_ENV:-production}"

require_env VITE_SUPABASE_URL
require_env VITE_SUPABASE_ANON_KEY
require_env VITE_API_BASE_URL
require_env VITE_LANDING_ORIGIN
require_env VITE_APP_ORIGIN

log "Writing client/admin/research local production env overrides"
write_env_file "$REPO_DIR/client/.env.production.local" \
  "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" \
  "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" \
  "VITE_API_BASE_URL=${VITE_API_BASE_URL}" \
  "VITE_LANDING_ORIGIN=${VITE_LANDING_ORIGIN}" \
  "VITE_APP_ORIGIN=${VITE_APP_ORIGIN}" \
  "VITE_PADDLE_CLIENT_TOKEN=${VITE_PADDLE_CLIENT_TOKEN}" \
  "VITE_PADDLE_ENV=${VITE_PADDLE_ENV}"

write_env_file "$REPO_DIR/admin/.env.production.local" \
  "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" \
  "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" \
  "VITE_API_BASE_URL=${VITE_API_BASE_URL}"

write_env_file "$REPO_DIR/research/.env.production.local" \
  "VITE_SUPABASE_URL=${VITE_SUPABASE_URL}" \
  "VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}" \
  "VITE_API_BASE_URL=${VITE_API_BASE_URL}"

log "Installing dependencies"
npm install --include=dev

log "Installing Playwright Chromium runtime"
npm run install:playwright:chromium

PLAYWRIGHT_LOCAL_BROWSERS_DIR="$REPO_DIR/node_modules/playwright-core/.local-browsers"
if [[ -d "$PLAYWRIGHT_LOCAL_BROWSERS_DIR" ]]; then
  log "Ensuring Playwright browser binaries are executable"
  while IFS= read -r browser_binary; do
    chmod 755 "$browser_binary"
  done < <(find "$PLAYWRIGHT_LOCAL_BROWSERS_DIR" -type f \( -name 'chrome-headless-shell' -o -name 'chrome' -o -name 'headless_shell' \))
fi

log "Building client, admin, and research bundles"
rm -rf "$REPO_DIR/server/public/client" "$REPO_DIR/server/public/admin" "$REPO_DIR/server/public/research"
npm run build --workspace=client
npm run build --workspace=admin
npm run build --workspace=research

log "Syncing client build to ${APP_STATIC_DIR}"
sync_dir "$REPO_DIR/server/public/client" "$APP_STATIC_DIR"

log "Syncing admin build to ${ADMIN_STATIC_DIR}"
sync_dir "$REPO_DIR/server/public/admin" "$ADMIN_STATIC_DIR"

log "Syncing research build to ${RESEARCH_STATIC_DIR}"
sync_dir "$REPO_DIR/server/public/research" "$RESEARCH_STATIC_DIR"

if [[ -n "${SERVER_RESTART_COMMAND:-}" ]]; then
  log "Running server restart command"
  bash -lc "$SERVER_RESTART_COMMAND"
else
  log "No SERVER_RESTART_COMMAND provided, skipping backend restart"
fi

log "Deploy finished"

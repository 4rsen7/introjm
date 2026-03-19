#!/usr/bin/env bash

set -Eeuo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$name" >&2
    exit 1
  fi
}

require_env HOSTINGER_SSH_HOST
require_env HOSTINGER_SSH_USER
require_env HOSTINGER_REPO_DIR

HOSTINGER_SSH_PORT="${HOSTINGER_SSH_PORT:-22}"
REMOTE_PUBLIC_HTML_DIR="${HOSTINGER_PUBLIC_HTML_DIR:-}"
REMOTE_RESTART_COMMAND="${HOSTINGER_SERVER_RESTART_COMMAND:-}"
REMOTE_REPO_DIR="${HOSTINGER_REPO_DIR}"

ssh -p "$HOSTINGER_SSH_PORT" "${HOSTINGER_SSH_USER}@${HOSTINGER_SSH_HOST}" \
  "repo_dir='${REMOTE_REPO_DIR}'; \
   if [ ! -d \"\$repo_dir/.git\" ] && [ -d \"\$repo_dir/.builds/source/repository/.git\" ]; then \
     repo_dir=\"\$repo_dir/.builds/source/repository\"; \
   fi; \
   if [ ! -d \"\$repo_dir/.git\" ] && [ -d \"\$(dirname \"\$repo_dir\")/nodejs/.git\" ]; then \
     repo_dir=\"\$(dirname \"\$repo_dir\")/nodejs\"; \
   fi; \
   if [ ! -d \"\$repo_dir/.git\" ]; then \
     echo \"HOSTINGER_REPO_DIR is not a git repository: \$repo_dir\" >&2; \
     exit 1; \
   fi; \
   export PUBLIC_HTML_DIR='${REMOTE_PUBLIC_HTML_DIR}'; \
   export SERVER_RESTART_COMMAND='${REMOTE_RESTART_COMMAND}'; \
   export HOSTINGER_DEPLOY_SETTLE_SECONDS='${HOSTINGER_DEPLOY_SETTLE_SECONDS:-}'; \
   cd \"\$repo_dir\" && \
   if [ -n \"\$HOSTINGER_DEPLOY_SETTLE_SECONDS\" ]; then \
     echo \"Waiting \$HOSTINGER_DEPLOY_SETTLE_SECONDS seconds for Hostinger repo sync...\" && \
     sleep \"\$HOSTINGER_DEPLOY_SETTLE_SECONDS\"; \
   fi && \
   export SKIP_GIT_PULL='1' && \
   bash scripts/deploy-hostinger.sh"

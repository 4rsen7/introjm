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
   if [ ! -d \"\$repo_dir/.git\" ]; then \
     echo \"HOSTINGER_REPO_DIR is not a git repository: \$repo_dir\" >&2; \
     exit 1; \
   fi; \
   export PUBLIC_HTML_DIR='${REMOTE_PUBLIC_HTML_DIR}'; \
   export SERVER_RESTART_COMMAND='${REMOTE_RESTART_COMMAND}'; \
   cd \"\$repo_dir\" && \
   git fetch origin main && \
   git pull --ff-only origin main && \
   export SKIP_GIT_PULL='1' && \
   bash scripts/deploy-hostinger.sh"

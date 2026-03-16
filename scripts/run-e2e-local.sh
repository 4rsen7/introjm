#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_ENV="$ROOT_DIR/server/.env"
E2E_ENV="$ROOT_DIR/.env.e2e"

if [[ ! -f "$SERVER_ENV" ]]; then
  echo "Missing $SERVER_ENV"
  exit 1
fi

if [[ ! -f "$E2E_ENV" ]]; then
  echo "Missing $E2E_ENV"
  exit 1
fi

set -a
. "$SERVER_ENV"
. "$E2E_ENV"
set +a

cd "$ROOT_DIR"

case "${1:-}" in
  seed)
    npm run seed:e2e
    ;;
  test)
    npx playwright test
    ;;
  smoke)
    npx playwright test --grep @smoke --workers=1
    ;;
  *)
    echo "Usage: bash ./scripts/run-e2e-local.sh {seed|test|smoke}"
    exit 1
    ;;
esac

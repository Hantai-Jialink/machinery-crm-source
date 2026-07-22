#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: healthcheck.sh /secure/path/.env.production}"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
export PRODUCTION_ENV_FILE="$env_file"
curl --fail --silent --show-error "$FORMAL_FASTGPT_HEALTH_URL" >/dev/null
curl --fail --silent --show-error "$FASTGPT_CANARY_HEALTH_URL" >/dev/null
curl --fail --silent --show-error http://127.0.0.1:3010/api/mcp/health >/dev/null
mcp_container="$(docker compose -p dachuan-mcp-prod --env-file "$env_file" -f "$deploy_dir/docker-compose.yml" ps -q dachuanpro-mcp)"
test -n "$mcp_container"
echo "PRODUCTION_HEALTHCHECK=PASS"

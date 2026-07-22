#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: deploy.sh /secure/path/.env.production}"
"$deploy_dir/preflight.sh" "$env_file"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
export PRODUCTION_ENV_FILE="$env_file"
curl --fail --silent --show-error "$FASTGPT_CANARY_HEALTH_URL" >/dev/null || { echo "FastGPT 4.15.2 Canary is not healthy; refusing deployment." >&2; exit 1; }
test -f "$deploy_dir/.last-backup-path" || { echo "Run backup.sh in this deployment directory first." >&2; exit 1; }
docker compose -p dachuan-mcp-prod --env-file "$env_file" -f "$deploy_dir/docker-compose.yml" up -d --no-build --wait
curl --fail --silent --show-error http://127.0.0.1:3010/api/mcp/health >/dev/null
echo "PRODUCTION_MCP_DEPLOY=PASS"

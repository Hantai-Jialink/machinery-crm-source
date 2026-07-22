#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: preflight.sh /secure/path/.env.production}"
test -f "$env_file" || { echo "Missing production environment file." >&2; exit 1; }
env_mode="$(stat -c '%a' "$env_file")"
(( (8#$env_mode & 8#077) == 0 )) || { echo "Production environment file permissions must deny group and other access." >&2; exit 1; }
node "$deploy_dir/validate-production-env.mjs" "$env_file"
set -a
# The caller creates and owns this 0600 file; it must not be supplied by an untrusted party.
# shellcheck source=/dev/null
source "$env_file"
set +a
export PRODUCTION_ENV_FILE="$env_file"
command -v docker >/dev/null
command -v curl >/dev/null
command -v nginx >/dev/null
command -v mysqldump >/dev/null
test -d "$FASTGPT_DIR" || { echo "Formal FastGPT directory is missing." >&2; exit 1; }
test -d "$CRM_DIR" || { echo "Formal CRM directory is missing." >&2; exit 1; }
test -f "$MYSQL_CLIENT_DEFAULTS_FILE" || { echo "Restricted MySQL client configuration is missing." >&2; exit 1; }
docker image inspect "$MCP_IMAGE" >/dev/null
curl --fail --silent --show-error "$FORMAL_FASTGPT_HEALTH_URL" >/dev/null
docker compose -p dachuan-mcp-prod --env-file "$env_file" -f "$deploy_dir/docker-compose.yml" config --quiet
docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" config --quiet
nginx -t
if ss -ltn '( sport = :3010 )' | grep -q ':3010'; then
  echo "Port 3010 is already in use; refusing to overlap an existing service." >&2
  exit 1
fi
echo "PRODUCTION_PREFLIGHT=PASS"

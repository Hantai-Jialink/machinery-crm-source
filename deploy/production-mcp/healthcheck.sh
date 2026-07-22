#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: healthcheck.sh /secure/path/.env.production}"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
export PRODUCTION_ENV_FILE="$env_file"
for url in "$FORMAL_FASTGPT_HEALTH_URL" "$FASTGPT_CANARY_HEALTH_URL" http://127.0.0.1:3010/api/mcp/health; do
  curl --fail --silent --show-error "$url" >/dev/null
done
for service in fastgpt-canary fastgpt-canary-mongo fastgpt-canary-redis fastgpt-canary-minio fastgpt-canary-aiproxy; do
  id="$(docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" ps -q "$service")"
  test -n "$id"
  test "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id")" = healthy
done
mcp_container="$(docker compose -p dachuan-mcp-prod --env-file "$env_file" -f "$deploy_dir/docker-compose.yml" ps -q dachuanpro-mcp)"
test -n "$mcp_container"
test "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$mcp_container")" = healthy
echo "PRODUCTION_HEALTHCHECK=PASS"

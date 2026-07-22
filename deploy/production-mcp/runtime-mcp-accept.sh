#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: runtime-mcp-accept.sh /secure/path/.env.runtime}"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
export PRODUCTION_ENV_FILE="$env_file"
compose=(docker compose -p dachuan-mcp-prod --env-file "$env_file" -f "$deploy_dir/ci/mcp-runtime-compose.yml")
sentinel_name="formal-fastgpt-3100-sentinel-${GITHUB_RUN_ID:-local}"
temporary_dir="$(mktemp -d)"
backup_pointer="$deploy_dir/.last-backup-path"
cleanup() {
  rm -f "$backup_pointer"
  "${compose[@]}" --profile acceptance down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$sentinel_name" >/dev/null 2>&1 || true
  rm -rf "$temporary_dir"
}
trap cleanup EXIT

docker run -d --name "$sentinel_name" -p 127.0.0.1:3100:8080 \
  -v "$deploy_dir/ci/model-mock.mjs:/mock/model-mock.mjs:ro" node:20-alpine node /mock/model-mock.mjs >/dev/null
for _ in $(seq 1 30); do
  curl --fail --silent http://127.0.0.1:3100/health >/dev/null && break
  sleep 1
done
curl --fail --silent --show-error "$FORMAL_FASTGPT_HEALTH_URL" >/dev/null
sentinel_before="$(docker inspect -f '{{.Id}}' "$sentinel_name")"

"${compose[@]}" up -d --build --wait --wait-timeout 300 mysql dachuanpro-mcp-redis fastgpt-gateway-upstream db-init dachuanpro-mcp
"${compose[@]}" --profile acceptance run --rm mcp-runtime-acceptance

mkdir -p "$temporary_dir/backup" "$temporary_dir/bin"
printf '%s\n' "$temporary_dir/backup" > "$backup_pointer"
printf '%s\n' '#!/usr/bin/env sh' 'test "$1" = "-t"' > "$temporary_dir/bin/nginx"
printf '%s\n' '#!/usr/bin/env sh' 'test "$1 $2" = "reload nginx"' > "$temporary_dir/bin/systemctl"
chmod +x "$temporary_dir/bin/nginx" "$temporary_dir/bin/systemctl"
PATH="$temporary_dir/bin:$PATH" bash "$deploy_dir/rollback.sh" "$env_file"

sentinel_after="$(docker inspect -f '{{.Id}}' "$sentinel_name")"
test "$sentinel_before" = "$sentinel_after"
curl --fail --silent --show-error "$FORMAL_FASTGPT_HEALTH_URL" >/dev/null
test -z "$(docker ps -q --filter label=com.docker.compose.project=dachuan-mcp-prod)"
echo 'DEPLOY_AND_ROLLBACK_FORMAL_FASTGPT_3100=PASS'

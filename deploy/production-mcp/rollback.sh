#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: rollback.sh /secure/path/.env.production}"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
export PRODUCTION_ENV_FILE="$env_file"
backup_dir="$(cat "$deploy_dir/.last-backup-path")"
test -d "$backup_dir" || { echo "Recorded backup directory is missing." >&2; exit 1; }
docker compose -p dachuan-mcp-prod --env-file "$env_file" -f "$deploy_dir/docker-compose.yml" down --remove-orphans
if [[ -f "$backup_dir/nginx-gateway.include" ]]; then cp -a "$backup_dir/nginx-gateway.include" "$NGINX_GATEWAY_INCLUDE"; fi
nginx -t
systemctl reload nginx
curl --fail --silent --show-error "$FORMAL_FASTGPT_HEALTH_URL" >/dev/null
echo "PRODUCTION_ROLLBACK=PASS"

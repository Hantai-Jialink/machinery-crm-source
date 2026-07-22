#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: backup.sh /secure/path/.env.production}"
"$deploy_dir/preflight.sh" "$env_file"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
backup_dir="$BACKUP_ROOT/mcp-production-$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "$backup_dir"
tar -C "$(dirname "$FASTGPT_DIR")" -czf "$backup_dir/fastgpt.tar.gz" "$(basename "$FASTGPT_DIR")"
tar -C "$(dirname "$CRM_DIR")" -czf "$backup_dir/crm-release.tar.gz" "$(basename "$CRM_DIR")"
if [[ -e "$NGINX_GATEWAY_INCLUDE" ]]; then cp -a "$NGINX_GATEWAY_INCLUDE" "$backup_dir/nginx-gateway.include"; else : > "$backup_dir/nginx-gateway.include.absent"; fi
mysqldump --defaults-extra-file="$MYSQL_CLIENT_DEFAULTS_FILE" --single-transaction --routines --triggers --no-tablespaces "$CRM_DATABASE" > "$backup_dir/${CRM_DATABASE}.sql"
test -s "$backup_dir/${CRM_DATABASE}.sql"
printf '%s\n' "$backup_dir" > "$deploy_dir/.last-backup-path"
echo "PRODUCTION_BACKUP=PASS path=$backup_dir"

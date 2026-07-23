#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: preflight.sh /secure/path/.env.production}"
fail() { echo "PRODUCTION_PREFLIGHT=FAIL: $*" >&2; exit 1; }
test -f "$env_file" || fail "Missing production environment file."
env_mode="$(stat -c '%a' "$env_file")"
(( (8#$env_mode & 8#077) == 0 )) || fail "Production environment file permissions must deny group and other access."
node "$deploy_dir/validate-production-env.mjs" "$env_file"
set -a
# The caller creates and owns this 0600 file; it must not be supplied by an untrusted party.
# shellcheck source=/dev/null
source "$env_file"
set +a
export PRODUCTION_ENV_FILE="$env_file"

for command in docker curl nginx mysqldump ss; do command -v "$command" >/dev/null || fail "Required command is missing: $command"; done
test -d "$FASTGPT_DIR" || fail "Formal FastGPT directory is missing."
test -d "$CRM_DIR" || fail "Formal CRM directory is missing."
test -f "$MYSQL_CLIENT_DEFAULTS_FILE" || fail "Restricted read-only MySQL client configuration is missing."
test -f "$MCP_AUDIT_MYSQL_CLIENT_DEFAULTS_FILE" || fail "Restricted audit MySQL client configuration is missing."
test -f "$CANARY_MONGO_REPLICA_KEY_FILE" || fail "Canary Mongo replica-set keyfile is missing."
test -f "$FASTGPT_CANARY_ARCHIVE" || fail "FastGPT Canary Docker archive is missing."
test -f "$MCP_IMAGE_ARCHIVE" || fail "MCP Docker archive is missing."
mongo_key_mode="$(stat -c '%a' "$CANARY_MONGO_REPLICA_KEY_FILE")"
(( (8#$mongo_key_mode & 8#077) == 0 )) || fail "Canary Mongo keyfile permissions must deny group and other access."

node "$deploy_dir/ci/verify-fastgpt-artifact.mjs" "$env_file" || fail "FastGPT Canary archive identity verification failed."
node "$deploy_dir/ci/verify-mcp-artifact.mjs" "$env_file" || fail "MCP image archive identity verification failed."
docker image inspect "$MCP_IMAGE" >/dev/null || fail "MCP_IMAGE is not present locally."
docker image inspect "$FASTGPT_CANARY_IMAGE" >/dev/null || fail "FASTGPT_CANARY_IMAGE is not present locally."
docker image inspect "$CANARY_AIPROXY_IMAGE" >/dev/null || fail "CANARY_AIPROXY_IMAGE is not present locally."
docker image inspect "$MYSQL_CLIENT_IMAGE" >/dev/null || fail "MYSQL_CLIENT_IMAGE is not present locally."
for image in "$MCP_IMAGE" "$FASTGPT_CANARY_IMAGE" "$CANARY_AIPROXY_IMAGE" "$MYSQL_CLIENT_IMAGE"; do
  test "$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')" = linux/amd64 || fail "Image is not linux/amd64: $image"
done
docker compose -p dachuan-mcp-prod --env-file "$env_file" -f "$deploy_dir/docker-compose.yml" config --quiet
docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" config --quiet

if ss -ltnH '( sport = :3010 )' | grep -q .; then fail "Port 3010 is already in use; refusing overlap."; fi
canary_id="$(docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" ps -q fastgpt-canary)"
test -n "$canary_id" || fail "FastGPT Canary does not exist. Start the Canary before running preflight."
test "$(docker inspect -f '{{.State.Status}}' "$canary_id")" = running || fail "FastGPT Canary is not running."
test "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$canary_id")" = healthy || fail "FastGPT Canary is not healthy."

for service in fastgpt-canary-mongo fastgpt-canary-redis fastgpt-canary-minio fastgpt-canary-aiproxy; do
  id="$(docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" ps -q "$service")"
  test -n "$id" || fail "Canary service is absent: $service"
  test "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id")" = healthy || fail "Canary service is not healthy: $service"
done
for service in fastgpt-canary-mongo-key-init fastgpt-canary-mongo-init fastgpt-canary-minio-init; do
  id="$(docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" ps -q --all "$service")"
  test -n "$id" || fail "Canary initializer is absent: $service"
  test "$(docker inspect -f '{{.State.ExitCode}}' "$id")" = 0 || fail "Canary initializer failed: $service"
done
mongo_key_init_id="$(docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" ps -q --all fastgpt-canary-mongo-key-init)"
mongo_init_id="$(docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" ps -q --all fastgpt-canary-mongo-init)"
minio_init_id="$(docker compose -p dachuan-fastgpt-canary --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml" ps -q --all fastgpt-canary-minio-init)"
docker logs "$mongo_key_init_id" 2>&1 | grep -qx 'CANARY_MONGO_KEYFILE_INIT=PASS' || fail "Canary Mongo keyfile proof is missing."
docker logs "$mongo_init_id" 2>&1 | grep -qx 'CANARY_MONGO_REPLICA_INIT=PASS' || fail "Canary Mongo replica-set proof is missing."
docker logs "$minio_init_id" 2>&1 | grep -qx 'CANARY_MINIO_BUCKET_INIT=PASS' || fail "Canary MinIO bucket proof is missing."
ss -ltnH '( sport = :3110 )' | grep -q . || fail "Canary port 3110 is not listening."
docker port "$canary_id" 3000 | grep -Fx '127.0.0.1:3110' >/dev/null || fail "Port 3110 is not owned by the Canary container."

curl --fail --silent --show-error "$FORMAL_FASTGPT_HEALTH_URL" >/dev/null || fail "Formal FastGPT health check failed."
curl --fail --silent --show-error "$FASTGPT_CANARY_HEALTH_URL" >/dev/null || fail "FastGPT Canary health check failed."

mcp_network_created=0
cleanup_preflight_network() {
  if [[ "$mcp_network_created" == 1 ]]; then
    docker network rm dachuan-mcp-prod >/dev/null 2>&1 || true
  fi
}
trap cleanup_preflight_network EXIT
if docker network inspect dachuan-mcp-prod >/dev/null 2>&1; then
  network_subnet="$(docker network inspect dachuan-mcp-prod --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')"
  test "$network_subnet" = 172.30.31.0/28 || fail "Existing dachuan-mcp-prod network has an unexpected subnet."
else
  docker network create --driver bridge --subnet 172.30.31.0/28 dachuan-mcp-prod >/dev/null
  mcp_network_created=1
fi
mysql_from_mcp_source() {
  local defaults_file="$1"
  shift
  docker run --rm \
    --network dachuan-mcp-prod \
    --ip "$MCP_DATABASE_GRANT_HOST" \
    --add-host host.docker.internal:host-gateway \
    --mount "type=bind,source=$defaults_file,target=/run/dachuan/mysql.cnf,readonly" \
    "$MYSQL_CLIENT_IMAGE" \
    mysql --defaults-extra-file=/run/dachuan/mysql.cnf "$@"
}
read_identity="$(mysql_from_mcp_source "$MYSQL_CLIENT_DEFAULTS_FILE" --batch --skip-column-names "$CRM_DATABASE" -e 'SELECT CURRENT_USER()')"
audit_identity="$(mysql_from_mcp_source "$MCP_AUDIT_MYSQL_CLIENT_DEFAULTS_FILE" --batch --skip-column-names "$CRM_DATABASE" -e 'SELECT CURRENT_USER()')"
test "$read_identity" = "${MCP_DATABASE_READ_USER}@${MCP_DATABASE_GRANT_HOST}" || fail "Read account Host does not match the actual Docker source."
test "$audit_identity" = "${MCP_DATABASE_AUDIT_USER}@${MCP_DATABASE_GRANT_HOST}" || fail "Audit account Host does not match the actual Docker source."
read_grants="$(mysql_from_mcp_source "$MYSQL_CLIENT_DEFAULTS_FILE" "$CRM_DATABASE" -e 'SHOW GRANTS')"
audit_grants="$(mysql_from_mcp_source "$MCP_AUDIT_MYSQL_CLIENT_DEFAULTS_FILE" "$CRM_DATABASE" -e 'SHOW GRANTS')"
for table in users customers customer_quotes follow_records contracts contract_items contract_payments shipments; do
  printf '%s\n' "$read_grants" | grep -Eqi "GRANT SELECT ON .*${table}" || fail "Read account lacks required ${table} SELECT."
done
printf '%s\n' "$read_grants" | grep -Eqi 'INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FILE|PROCESS|GRANT OPTION' && fail "Read account has forbidden privileges."
printf '%s\n' "$audit_grants" | grep -Eqi 'GRANT INSERT ON .*operation_logs' || fail "Audit account lacks operation_logs INSERT."
printf '%s\n' "$audit_grants" | grep -Eqi 'SELECT ON .*machinery_crm|UPDATE|DELETE|CREATE|ALTER|DROP|FILE|PROCESS|GRANT OPTION' && fail "Audit account has forbidden privileges."
nginx -t
echo "PRODUCTION_PREFLIGHT=PASS"

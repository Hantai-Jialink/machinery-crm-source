#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: runtime-canary-accept.sh /secure/path/.env.runtime}"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
compose=(docker compose -p dachuan-fastgpt-canary-runtime --profile ci --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml")
plugin_image='ghcr.io/labring/fastgpt-plugin:v1.0.2@sha256:a1a63eeef3d49c2a81db466243cf3ac88d9156b158076d4eece13e892dcd007f'
docker pull --platform linux/amd64 "$plugin_image"
test "$(docker image inspect "$plugin_image" --format '{{.Os}}/{{.Architecture}}')" = linux/amd64
actual_plugin_digest="$(docker image inspect "$plugin_image" --format '{{index .RepoDigests 0}}' | sed 's/^.*@//')"
test "$actual_plugin_digest" = "${plugin_image#*@}"
if [[ "${CANARY_RUNTIME_CI_OVERLAY:-0}" == "1" ]]; then
  compose+=( -f "$deploy_dir/fastgpt-canary-compose.ci.yml" )
fi
cleanup() { "${compose[@]}" down --volumes --remove-orphans; }
trap cleanup EXIT
if "${compose[@]}" up -d --wait --wait-timeout 600; then
  :
else
  status=$?
  echo "Canary Compose startup failed; diagnostic state follows." >&2
  "${compose[@]}" ps -a >&2 || true
  "${compose[@]}" logs --no-color fastgpt-canary-mongo-key-init fastgpt-canary-mongo fastgpt-canary-mongo-init fastgpt-canary-minio fastgpt-canary-minio-init fastgpt-canary-aiproxy fastgpt-canary-plugin fastgpt-canary-pg-init fastgpt-canary >&2 || true
  "${compose[@]}" logs --no-color --tail 100 fastgpt-canary >&2 || true
  echo "--- fastgpt-canary 实际存活响应 (${FASTGPT_CANARY_HEALTH_URL}) ---" >&2
  curl -sS -o /tmp/hc-body.txt -w 'HTTP_STATUS=%{http_code}\n' "$FASTGPT_CANARY_HEALTH_URL" >&2 || echo "curl 连接失败: $?" >&2
  echo "--- body (前20行) ---" >&2
  head -20 /tmp/hc-body.txt 2>/dev/null >&2 || true
  echo "--- fastgpt-canary 端口监听检查 ---" >&2
  "${compose[@]}" ps fastgpt-canary >&2 || true
  exit "$status"
fi
for service in fastgpt-canary fastgpt-canary-mongo fastgpt-canary-redis fastgpt-canary-minio fastgpt-canary-aiproxy fastgpt-canary-plugin fastgpt-canary-model-mock; do
  id="$("${compose[@]}" ps -q "$service")"
  test -n "$id"
  test "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id")" = healthy
done
for service in fastgpt-canary-mongo-key-init fastgpt-canary-mongo-init fastgpt-canary-minio-init fastgpt-canary-pg-init; do
  id="$("${compose[@]}" ps -q --all "$service")"
  test -n "$id"
  test "$(docker inspect -f '{{.State.ExitCode}}' "$id")" = 0
done
mongo_key_init_id="$("${compose[@]}" ps -q --all fastgpt-canary-mongo-key-init)"
mongo_init_id="$("${compose[@]}" ps -q --all fastgpt-canary-mongo-init)"
minio_init_id="$("${compose[@]}" ps -q --all fastgpt-canary-minio-init)"
docker logs "$mongo_key_init_id" 2>&1 | grep -qx 'CANARY_MONGO_KEYFILE_INIT=PASS'
docker logs "$mongo_init_id" 2>&1 | grep -qx 'CANARY_MONGO_REPLICA_INIT=PASS'
docker logs "$minio_init_id" 2>&1 | grep -qx 'CANARY_MINIO_BUCKET_INIT=PASS'
"${compose[@]}" exec -T fastgpt-canary-mongo bash -ec 'test -r /etc/mongo-key/mongodb-keyfile; test "$(stat -c "%a" /etc/mongo-key/mongodb-keyfile)" = 400'
"${compose[@]}" exec -T fastgpt-canary-redis sh -ec 'redis-cli -a "$CANARY_REDIS_PASSWORD" ping | grep -x PONG'
"${compose[@]}" exec -T fastgpt-canary-mongo mongosh --username "$CANARY_MONGO_ROOT_USER" --password "$CANARY_MONGO_ROOT_PASSWORD" --authenticationDatabase admin --quiet --eval 'rs.status().ok' | grep -x 1
"${compose[@]}" run --rm --no-deps fastgpt-canary-minio-init | grep -x 'CANARY_MINIO_BUCKET_INIT=PASS'
curl --fail --silent --show-error "$FASTGPT_CANARY_HEALTH_URL" >/dev/null
node "$deploy_dir/ci/fastgpt-canary-probe.mjs"
echo 'CANARY_RUNTIME_REDIS_MONGO_MINIO_FASTGPT_MODEL=PASS'

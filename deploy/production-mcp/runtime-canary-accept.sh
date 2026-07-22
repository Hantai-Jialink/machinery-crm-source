#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${1:?usage: runtime-canary-accept.sh /secure/path/.env.runtime}"
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
compose=(docker compose -p dachuan-fastgpt-canary-runtime --profile ci --env-file "$env_file" -f "$deploy_dir/fastgpt-canary-compose.yml")
if [[ "${CANARY_RUNTIME_CI_OVERLAY:-0}" == "1" ]]; then
  compose+=( -f "$deploy_dir/fastgpt-canary-compose.ci.yml" )
fi
cleanup() { "${compose[@]}" down --volumes --remove-orphans; }
trap cleanup EXIT
"${compose[@]}" up -d --wait --wait-timeout 300
for service in fastgpt-canary fastgpt-canary-mongo fastgpt-canary-redis fastgpt-canary-minio fastgpt-canary-aiproxy fastgpt-canary-model-mock; do
  id="$("${compose[@]}" ps -q "$service")"
  test -n "$id"
  test "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id")" = healthy
done
"${compose[@]}" exec -T fastgpt-canary-redis sh -ec 'redis-cli -a "$CANARY_REDIS_PASSWORD" ping | grep -x PONG'
"${compose[@]}" exec -T fastgpt-canary-mongo mongosh --username "$CANARY_MONGO_ROOT_USER" --password "$CANARY_MONGO_ROOT_PASSWORD" --authenticationDatabase admin --quiet --eval 'rs.status().ok' | grep -x 1
"${compose[@]}" run --rm --no-deps fastgpt-canary-minio-init >/dev/null
curl --fail --silent --show-error "$FASTGPT_CANARY_HEALTH_URL" >/dev/null

login="$(curl --fail --silent --show-error -H 'content-type: application/json' -d "{\"username\":\"root\",\"password\":\"${CANARY_FASTGPT_ROOT_PASSWORD}\"}" "$FASTGPT_CANARY_ADMIN_URL/api/support/user/account/loginByPassword")"
token="$(node -e 'const input=JSON.parse(process.argv[1]); if(!input.token) process.exit(1); process.stdout.write(input.token)' "$login")"
model_config='[{"model":"canary-ci-model","metadata":{"provider":"custom","model":"canary-ci-model","name":"canary-ci-model","type":"llm","isActive":true,"maxContext":4096,"maxResponse":256,"quoteMaxToken":256,"functionCall":false,"toolChoice":false,"requestUrl":"http://fastgpt-canary-model-mock:8080/v1/chat/completions"}}]'
curl --fail --silent --show-error -H "token: $token" -H 'content-type: application/json' -d "{\"config\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$model_config")}" "$FASTGPT_CANARY_ADMIN_URL/api/core/ai/model/updateWithJson" >/dev/null
curl --fail --silent --show-error -H "token: $token" -X POST "$FASTGPT_CANARY_ADMIN_URL/api/core/ai/model/test?model=canary-ci-model" | grep -q 'canary-model-ok'
echo 'CANARY_RUNTIME_REDIS_MONGO_MINIO_FASTGPT_MODEL=PASS'

#!/usr/bin/env bash
set -euo pipefail

acceptance_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$acceptance_dir/../.." && pwd)"
env_file="$acceptance_dir/.env.identity-acceptance"
command -v docker >/dev/null || { echo "Docker is required for isolated acceptance." >&2; exit 1; }
docker compose version >/dev/null
if [[ ! -f "$env_file" ]]; then
  node "$acceptance_dir/prepare-env.mjs" "$acceptance_dir/.env.identity-acceptance.example" "$env_file"
fi
node "$acceptance_dir/validate-env.mjs" "$env_file"
"$acceptance_dir/build-fastgpt.sh" "${1:-}"
docker build --progress=plain -f "$acceptance_dir/Dockerfile.mcp" -t "dachuanpro-crm-erp-mcp:1.2.0-identity-acceptance.1" "$repo_root"
docker build --progress=plain -f "$acceptance_dir/Dockerfile.acceptance" -t "dachuanpro-identity-acceptance-runner:1.0.0" "$repo_root"
pushd "$acceptance_dir" >/dev/null
compose=(docker compose -p dachuan-identity-acceptance --env-file "$env_file")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --no-build --wait --wait-timeout 300 mysql identity-redis
"${compose[@]}" create --force-recreate db-init

expected_data_network="dachuan-identity-acceptance_identity-data"
db_init_container="$("${compose[@]}" ps -q --all db-init)"
mysql_container="$("${compose[@]}" ps -q mysql)"
[[ -n "$db_init_container" && -n "$mysql_container" ]] || { echo "Isolated database containers are missing." >&2; exit 1; }
network_internal="$(docker network inspect "$expected_data_network" --format '{{.Internal}}')"
db_init_networks="$(docker inspect "$db_init_container" --format '{{range $key, $value := .NetworkSettings.Networks}}{{println $key}}{{end}}' | sed '/^$/d')"
mysql_networks="$(docker inspect "$mysql_container" --format '{{range $key, $value := .NetworkSettings.Networks}}{{println $key}}{{end}}' | sed '/^$/d')"
db_init_ports="$(docker inspect "$db_init_container" --format '{{json .HostConfig.PortBindings}}')"
mysql_ports="$(docker inspect "$mysql_container" --format '{{json .HostConfig.PortBindings}}')"
[[ "$network_internal" == "true" && "$db_init_networks" == "$expected_data_network" && "$mysql_networks" == "$expected_data_network" && ( "$db_init_ports" == "null" || "$db_init_ports" == "{}" ) && ( "$mysql_ports" == "null" || "$mysql_ports" == "{}" ) ]] || {
  echo "Refusing migration: database containers are not isolated on the expected internal Docker network." >&2
  exit 1
}
echo "IDENTITY_ACCEPTANCE_DATABASE_NETWORK=VERIFIED"

"${compose[@]}" start db-init
db_init_exit_code="$(docker wait "$db_init_container")"
[[ "$db_init_exit_code" == "0" ]] || { echo "Isolated migration/seed failed with exit code $db_init_exit_code." >&2; exit 1; }
echo "IDENTITY_ACCEPTANCE_DB_INIT_EXIT_CODE=0"

"${compose[@]}" up -d --no-build --wait --wait-timeout 900
"${compose[@]}" ps
popd >/dev/null
echo "CRM=http://127.0.0.1:18080"
echo "FastGPT=http://127.0.0.1:18081"
echo "MCP=http://127.0.0.1:18080/api/mcp"
echo "Create the isolated FastGPT Agent/API key, update AGENT_GATEWAY_FASTGPT_API_KEY, recreate crm, then run accept.sh."

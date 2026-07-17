#!/usr/bin/env bash
set -euo pipefail

acceptance_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="$acceptance_dir/.env.identity-acceptance"
command -v docker >/dev/null || { echo "Docker is required for isolated acceptance." >&2; exit 1; }
docker compose version >/dev/null
if [[ ! -f "$env_file" ]]; then
  node "$acceptance_dir/prepare-env.mjs" "$acceptance_dir/.env.identity-acceptance.example" "$env_file"
fi
node "$acceptance_dir/validate-env.mjs" "$env_file"
"$acceptance_dir/build-fastgpt.sh" "${1:-}"
(cd "$acceptance_dir" && docker compose -p dachuan-identity-acceptance --env-file "$env_file" config --quiet)
(cd "$acceptance_dir" && docker compose -p dachuan-identity-acceptance --env-file "$env_file" up -d --build --wait --wait-timeout 900)
(cd "$acceptance_dir" && docker compose -p dachuan-identity-acceptance --env-file "$env_file" ps)
echo "CRM=http://127.0.0.1:18080"
echo "FastGPT=http://127.0.0.1:18081"
echo "MCP=http://127.0.0.1:18080/api/mcp"
echo "Create the isolated FastGPT Agent/API key, update AGENT_GATEWAY_FASTGPT_API_KEY, recreate crm, then run accept.sh."

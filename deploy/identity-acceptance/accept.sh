#!/usr/bin/env bash
set -euo pipefail

acceptance_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="$acceptance_dir/.env.identity-acceptance"
test -f "$env_file" || { echo "Missing $env_file; run start.sh first." >&2; exit 1; }
grep -qx 'MCP_TOOL_MODE=IDENTITY_POC' "$env_file" || { echo "Acceptance requires IDENTITY_POC." >&2; exit 1; }
! grep -q '^AGENT_GATEWAY_FASTGPT_API_KEY=REPLACE_' "$env_file" || { echo "Configure the isolated FastGPT Agent/API key first." >&2; exit 1; }
node "$acceptance_dir/validate-env.mjs" "$env_file"
fastgpt_image="$(sed -n 's/^FASTGPT_IMAGE=//p' "$env_file")"
expected_revision="$(sed -n 's/^FASTGPT_SOURCE_COMMIT=//p' "$env_file")"
image_revision="$(docker image inspect "$fastgpt_image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
image_tests="$(docker image inspect "$fastgpt_image" --format '{{ index .Config.Labels "dachuan.identity.tests" }}')"
image_acceptance="$(docker image inspect "$fastgpt_image" --format '{{ index .Config.Labels "dachuan.identity.acceptance" }}')"
image_id="$(docker image inspect "$fastgpt_image" --format '{{ .Id }}')"
fastgpt_container="$(cd "$acceptance_dir" && docker compose -p dachuan-identity-acceptance --env-file "$env_file" ps -q fastgpt)"
[[ -n "$fastgpt_container" ]] || { echo "The isolated FastGPT container is not running." >&2; exit 1; }
running_image_id="$(docker inspect "$fastgpt_container" --format '{{ .Image }}')"
[[ "$image_revision" == "$expected_revision" && "$image_tests" == "mcp-and-context-97-pass" && "$image_acceptance" == "true" && "$image_id" == sha256:* && "$running_image_id" == "$image_id" ]] || { echo "FastGPT image gate failed." >&2; exit 1; }
output_dir="$acceptance_dir/acceptance-output"
mkdir -p "$output_dir"
stamp="$(date +%Y%m%d-%H%M%S)"
runner_output="$output_dir/$stamp-runner.log"
service_logs="$output_dir/$stamp-services.log"
(cd "$acceptance_dir" && docker compose -p dachuan-identity-acceptance --env-file "$env_file" --profile acceptance run --rm acceptance-runner) 2>&1 | tee "$runner_output"
(cd "$acceptance_dir" && docker compose -p dachuan-identity-acceptance --env-file "$env_file" logs --no-color crm fastgpt nginx identity-redis mysql fastgpt-mongo fastgpt-redis fastgpt-pg fastgpt-minio) > "$service_logs"
node - "$env_file" "$runner_output" "$service_logs" <<'NODE'
const fs = require('fs');
const [envPath, ...logs] = process.argv.slice(2);
const settings = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).filter(x => x && !x.startsWith('#')).map(x => { const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1)]; }));
const keyPart = JSON.parse(settings.AGENT_AUTH_KEYS_JSON)[0].privateJwk.d;
const secrets = ['MCP_SERVICE_KEY','MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD','REDIS_PASSWORD','AUTH_SECRET','AGENT_GATEWAY_FASTGPT_API_KEY','ACCEPTANCE_USER_PASSWORD','FASTGPT_ROOT_PASSWORD','FASTGPT_ROOT_KEY','FASTGPT_TOKEN_KEY','FASTGPT_FILE_TOKEN_KEY','FASTGPT_AES_KEY','FASTGPT_INVOKE_TOKEN_SECRET','FASTGPT_MONGO_PASSWORD','FASTGPT_REDIS_PASSWORD','FASTGPT_MINIO_PASSWORD','FASTGPT_PG_PASSWORD','FASTGPT_AIPROXY_API_TOKEN'].map(k => settings[k]).concat(keyPart).filter(x => x && x.length >= 8 && !x.startsWith('REPLACE_'));
const text = logs.map(x => fs.readFileSync(x, 'utf8')).join('\n');
if (secrets.some(x => text.includes(x))) throw new Error('Sensitive information scan failed.');
if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text) || /x-dachuan-user-assertion\s*[:=]\s*\S+/i.test(text)) throw new Error('Dynamic assertion found in logs.');
if (!text.includes('IDENTITY_ACCEPTANCE_RESULT=PASS')) throw new Error('Acceptance PASS marker missing.');
NODE
echo "IDENTITY_ISOLATED_ACCEPTANCE=PASS"
echo "FASTGPT_IMAGE_ID=$image_id"
echo "Evidence directory: $output_dir"

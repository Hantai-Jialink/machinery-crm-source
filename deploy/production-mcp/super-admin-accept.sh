#!/usr/bin/env bash
set -euo pipefail

env_file="${1:?usage: super-admin-accept.sh /secure/path/.env.production}"
request_file="${2:?usage: super-admin-accept.sh /secure/path/.env.production /secure/path/agent-request.json}"
cookie_jar="${3:?usage: super-admin-accept.sh /secure/path/.env.production /secure/path/agent-request.json /secure/path/admin-cookie.jar}"
test -s "$request_file" && test -s "$cookie_jar" || { echo "Use a real, short-lived SUPER_ADMIN browser session and a preconfigured identity-only FastGPT Agent request." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT
curl --fail --silent --show-error --cookie "$cookie_jar" --header 'content-type: application/json' --data-binary "@$request_file" --dump-header "$headers" "$AUTH_URL/api/agent-gateway/chat" >/dev/null
request_id="$(awk 'BEGIN{IGNORECASE=1} /^x-dachuan-request-id:/{print $2}' "$headers" | tr -d '\r' | tail -n 1)"
[[ "$request_id" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$ ]] || { echo "Gateway did not return a valid request ID." >&2; exit 1; }
mysql --defaults-extra-file="$MYSQL_CLIENT_DEFAULTS_FILE" --batch --skip-column-names "$CRM_DATABASE" -e "SELECT COUNT(*) FROM operation_logs WHERE entityId='${request_id}' AND action='MCP_CALL';" | grep -Eq '^[1-9][0-9]*$'
echo "SUPER_ADMIN_GRAY_ACCEPTANCE=PASS requestId=$request_id"

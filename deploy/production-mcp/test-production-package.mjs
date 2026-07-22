import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(directory, name), 'utf8');

const validator = read('validate-production-env.mjs');
assert.match(validator, /b9b6e2305e70823c9706291de4b19c4dc3ae05f6/);
assert.match(validator, /8f09f9dd41c17aecec6bbe69a332432fdf4e686546f050d65e670bda60aa2033/);
assert.match(validator, /fastAgent/);
assert.doesNotMatch(validator, /\['default', 'pi'\]/);
for (const resource of ['MONGO', 'REDIS', 'OBJECT_STORAGE', 'APP', 'USER', 'SESSION', 'API_KEY', 'AI_PROXY', 'MODEL_SERVICE']) {
  assert.match(validator, new RegExp(`FORMAL_FASTGPT_${resource}_FINGERPRINT`));
  assert.match(validator, new RegExp(`CANARY_FASTGPT_${resource}_FINGERPRINT`));
}

const compose = read('fastgpt-canary-compose.yml');
for (const required of ['dachuan-fastgpt-canary-data', 'dachuan-fastgpt-canary-ai-egress', 'dachuan-fastgpt-canary-mongo', 'dachuan-fastgpt-canary-redis', 'dachuan-fastgpt-canary-minio', 'fastgpt-canary-mongo-key-init', 'fastgpt-canary-mongo-init', 'fastgpt-canary-minio-init', 'fastgpt-canary-aiproxy']) {
  assert.match(compose, new RegExp(required));
}
assert.match(compose, /AGENT_ENGINE: \$\{FASTGPT_CANARY_AGENT_ENGINE:-fastAgent\}/);
assert.match(compose, /CANARY_REDIS_PASSWORD: \$\{CANARY_REDIS_PASSWORD\}/);
assert.match(compose, /redis-cli -a \\\"\$\$CANARY_REDIS_PASSWORD\\\" ping/);
assert.match(compose, /replicaSet=rs0/);
assert.match(compose, /rs\.status\(\)\.ok/);
assert.match(compose, /--keyFile/);
assert.match(compose, /CANARY_MONGO_REPLICA_KEY_FILE/);
assert.match(compose, /install -m 0400 -o "\$\$mongo_uid" -g "\$\$mongo_gid"/);
assert.match(compose, /mc mb --ignore-existing/);
assert.match(compose, /minio\/health\/live/);
assert.match(compose, /failed after \$\$attempt attempts/);
assert.match(compose, /until mc alias set/);
assert.match(compose, /AIPROXY_API_ENDPOINT: http:\/\/fastgpt-canary-aiproxy:3000/);
assert.doesNotMatch(compose, /fastgpt:3100|\/opt\/fastgpt|FORMAL_FASTGPT_/);
const canaryRuntime = read('runtime-canary-accept.sh');
assert.match(canaryRuntime, /CANARY_RUNTIME_REDIS_MONGO_MINIO_FASTGPT_MODEL=PASS/);
assert.match(canaryRuntime, /updateWithJson/);
assert.match(canaryRuntime, /logs --no-color fastgpt-canary-mongo-key-init fastgpt-canary-mongo fastgpt-canary-mongo-init fastgpt-canary-minio fastgpt-canary-minio-init/);
assert.match(read('fastgpt-canary-compose.ci.yml'), /model-mock/);

const mcpCompose = read('docker-compose.yml');
assert.match(mcpCompose, /subnet: 172\.30\.31\.0\/28/);
assert.match(mcpCompose, /ipv4_address: 172\.30\.31\.10/);
const mcpRuntimeCompose = read('ci/mcp-runtime-compose.yml');
assert.match(mcpRuntimeCompose, /mysql:8\.0\.44/);
assert.match(mcpRuntimeCompose, /ipv4_address: 172\.30\.31\.10/);
assert.match(mcpRuntimeCompose, /prepare-mysql-grants\.mjs/);
assert.match(mcpRuntimeCompose, /run-mcp-runtime-acceptance\.ts/);
const mcpRuntime = read('runtime-mcp-accept.sh');
assert.match(mcpRuntime, /127\.0\.0\.1:3100:8080/);
assert.match(mcpRuntime, /rollback\.sh/);
assert.match(mcpRuntime, /sentinel_before/);
assert.match(mcpRuntime, /sentinel_after/);
assert.match(mcpRuntime, /DEPLOY_AND_ROLLBACK_FORMAL_FASTGPT_3100=PASS/);
const mcpRuntimeAcceptance = read('ci/run-mcp-runtime-acceptance.ts');
for (const gate of [
  'MCP_RUNTIME_MINIMUM_DB_QUERY=PASS',
  'MCP_RUNTIME_AUDIT_INSERT_AND_FAIL_CLOSED=PASS',
  'MCP_RUNTIME_ASSERTION_GATEWAY_REPLAY_ALLOWLIST=PASS',
  'MCP_RUNTIME_CONCURRENCY=PASS',
]) assert.match(mcpRuntimeAcceptance, new RegExp(gate));
assert.match(mcpRuntimeAcceptance, /REVOKE INSERT/);
assert.match(mcpRuntimeAcceptance, /salesGateway\.status === 403/);
assert.match(mcpRuntimeAcceptance, /wrong-audience/);

const deploy = read('deploy.sh');
const rollback = read('rollback.sh');
const health = read('healthcheck.sh');
assert.doesNotMatch(deploy, /systemctl|pm2|docker compose[^\n]*down/);
assert.match(rollback, /docker compose -p dachuan-mcp-prod/);
assert.doesNotMatch(rollback, /fastgpt-canary|fastgpt.*down|systemctl stop/);
assert.match(health, /FORMAL_FASTGPT_HEALTH_URL/);
for (const required of ['FASTGPT_CANARY_IMAGE', 'FASTGPT_CANARY_HEALTH_URL', 'Port 3010', 'Canary port 3110', 'MCP_DATABASE_GRANT_HOST']) {
  assert.match(deploy + health + read('preflight.sh'), new RegExp(required));
}

const grants = read('mysql-grants.expected.sql');
assert.match(grants, /INSERT ON machinery_crm.`operation_logs`/);
assert.match(grants, /'dachuan_mcp_read'@'172\.30\.31\.10'/);
for (const table of ['users', 'customers', 'customer_quotes', 'follow_records', 'contracts', 'contract_items', 'contract_payments', 'shipments']) {
  assert.match(grants, new RegExp(`SELECT ON machinery_crm.\\\`${table}\\\``));
}
assert.match(grants, /UPDATE、DELETE、CREATE、ALTER、DROP、FILE、PROCESS/);
assert.match(grants, /GRANT OPTION/);
console.log('PRODUCTION_PACKAGE_GUARDS=PASS');

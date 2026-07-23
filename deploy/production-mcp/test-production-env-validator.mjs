import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dachuan-production-env-'));
const validator = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-production-env.mjs');
const sourceCommit = 'b9b6e2305e70823c9706291de4b19c4dc3ae05f6';
const baseImage = 'ghcr.io/labring/fastgpt:v4.15.2@sha256:8f09f9dd41c17aecec6bbe69a332432fdf4e686546f050d65e670bda60aa2033';
const canaryImage = 'dachuan-fastgpt:v4.15.2-dachuan-12345';
const canaryManifestDigest = `sha256:${'d'.repeat(64)}`;
const mongoReplicaKeyFile = path.join(directory, 'canary-mongo-replica.key');
const proof = { sourceCommit, sourceImageDigest: baseImage.split('@')[1], patchedImage: `${canaryImage}@${canaryManifestDigest}`, patchedImageTag: canaryImage, patchedManifestDigest: canaryManifestDigest, patchedConfigDigest: `sha256:${'b'.repeat(64)}`, patchedArchiveSha256: `sha256:${'a'.repeat(64)}`, patchSha256: 'c'.repeat(64), focusedTests: 'PASS', concurrencyAcceptance: 'PASS', canaryIsolation: 'PASS', agentEngine: 'fastAgent', sourcePatchApply: 'PASS', runtimeAcceptance: 'PASS', rollbackProof: 'PASS' };
const mcpImage = 'dachuanpro-mcp-runtime:12345';
const mcpProof = { format: 'docker-archive', repoTag: mcpImage, configDigest: `sha256:${'e'.repeat(64)}`, archiveSha256: `sha256:${'f'.repeat(64)}`, os: 'linux', architecture: 'amd64' };
const values = {
  NODE_ENV: 'production', PORT: '3010', HOSTNAME: '0.0.0.0', MCP_IMAGE: `dachuanpro-mcp@sha256:${'e'.repeat(64)}`, PRODUCTION_ENV_FILE: './.env.production', CRM_DATABASE: 'machinery_crm', DATABASE_URL: 'mysql://reader@db/machinery_crm', MCP_AUDIT_DATABASE_URL: 'mysql://audit@db/machinery_crm', MYSQL_CLIENT_DEFAULTS_FILE: '/secure/mysql.cnf', MCP_AUDIT_MYSQL_CLIENT_DEFAULTS_FILE: '/secure/mysql-audit.cnf', MCP_DATABASE_GRANT_HOST: '172.30.31.10', MCP_DATABASE_READ_USER: 'dachuan_mcp_read', MCP_DATABASE_AUDIT_USER: 'dachuan_mcp_audit', AUTH_SECRET: 'test-secret', AUTH_URL: 'https://crm.example.com', MCP_AUDIT_USER_ID: 'admin-id', MCP_API_KEYS_JSON: '[{"name":"fastgpt","keyHash":"abc"}]', MCP_LEGACY_USER_BOUND_AUTH: 'false', MCP_TOOL_MODE: 'FULL_READ_ONLY', MCP_TOOL_ALLOWLIST: 'dachuan_identity_who_am_i,crm_customer_get,crm_contract_get', MCP_QUERY_TIMEOUT_MS: '5000', MCP_ALLOWED_HOSTS: 'mcp.example.com', MCP_ALLOWED_ORIGINS: 'https://fastgpt.example.com', AGENT_AUTH_ISSUER: 'https://crm.example.com', AGENT_AUTH_AUDIENCE: 'dachuan-mcp', AGENT_AUTH_TOKEN_TTL_SECONDS: '600', AGENT_AUTH_ACTIVE_KID: 'prod-k1', AGENT_AUTH_KEYS_JSON: '[{"kid":"prod-k1"}]', REDIS_PASSWORD: 'dedicated-redis-password', AGENT_AUTH_REDIS_URL: 'redis://:dedicated-redis-password@dachuanpro-mcp-redis:6379', AGENT_AUTH_REDIS_PREFIX: 'dachuan:prod', AGENT_GATEWAY_FASTGPT_CHAT_URL: 'http://127.0.0.1:3110/api/v1/chat/completions', AGENT_GATEWAY_FASTGPT_API_KEY: 'agent-key', AGENT_GATEWAY_MAX_REQUEST_BYTES: '1048576', AGENT_GATEWAY_RATE_LIMIT_PER_MINUTE: '10', AGENT_GATEWAY_ALLOWED_ORIGINS: 'https://crm.example.com', AGENT_GATEWAY_ALLOWED_ROLES: 'SUPER_ADMIN', FORMAL_FASTGPT_HEALTH_URL: 'http://127.0.0.1:3100', FASTGPT_CANARY_HEALTH_URL: 'http://127.0.0.1:3110/health', FASTGPT_CANARY_COMPATIBILITY_PROOF: './proof.json', FASTGPT_SOURCE_COMMIT: sourceCommit, FASTGPT_BASE_IMAGE: baseImage, FASTGPT_CANARY_IMAGE: canaryImage, FASTGPT_CANARY_AGENT_ENGINE: 'fastAgent', FASTGPT_DIR: '/opt/fastgpt', CRM_DIR: '/opt/crm', NGINX_GATEWAY_INCLUDE: '/etc/nginx/conf.d/mcp.conf', BACKUP_ROOT: '/opt/crm-backups',
  FORMAL_FASTGPT_MONGO_FINGERPRINT: '1'.repeat(64), CANARY_FASTGPT_MONGO_FINGERPRINT: '2'.repeat(64), FORMAL_FASTGPT_REDIS_FINGERPRINT: '3'.repeat(64), CANARY_FASTGPT_REDIS_FINGERPRINT: '4'.repeat(64), FORMAL_FASTGPT_OBJECT_STORAGE_FINGERPRINT: '5'.repeat(64), CANARY_FASTGPT_OBJECT_STORAGE_FINGERPRINT: '6'.repeat(64), FORMAL_FASTGPT_APP_FINGERPRINT: '7'.repeat(64), CANARY_FASTGPT_APP_FINGERPRINT: '8'.repeat(64), FORMAL_FASTGPT_USER_FINGERPRINT: '9'.repeat(64), CANARY_FASTGPT_USER_FINGERPRINT: 'a'.repeat(64), FORMAL_FASTGPT_SESSION_FINGERPRINT: 'b'.repeat(64), CANARY_FASTGPT_SESSION_FINGERPRINT: 'c'.repeat(64), FORMAL_FASTGPT_API_KEY_FINGERPRINT: 'd'.repeat(64), CANARY_FASTGPT_API_KEY_FINGERPRINT: 'e'.repeat(64), FORMAL_FASTGPT_AI_PROXY_FINGERPRINT: 'f'.repeat(64), CANARY_FASTGPT_AI_PROXY_FINGERPRINT: '0'.repeat(64), FORMAL_FASTGPT_MODEL_SERVICE_FINGERPRINT: '1'.repeat(63) + 'a', CANARY_FASTGPT_MODEL_SERVICE_FINGERPRINT: '2'.repeat(63) + 'b',
  CANARY_MONGO_ROOT_USER: 'canary-mongo', CANARY_MONGO_ROOT_PASSWORD: 'canary-mongo-password', CANARY_MONGO_DATABASE: 'dachuan_fastgpt_canary_4152', CANARY_MONGO_REPLICA_KEY_FILE: mongoReplicaKeyFile, CANARY_REDIS_PASSWORD: 'canary-redis-password', CANARY_MINIO_ROOT_USER: 'canary-minio', CANARY_MINIO_ROOT_PASSWORD: 'canary-minio-password', CANARY_STORAGE_PUBLIC_BUCKET: 'dachuan-fastgpt-canary-4152-public', CANARY_STORAGE_PRIVATE_BUCKET: 'dachuan-fastgpt-canary-4152-private', CANARY_FASTGPT_ROOT_PASSWORD: 'canary-root-password', CANARY_FASTGPT_ROOT_KEY: 'canary-root-key', CANARY_FASTGPT_TOKEN_KEY: 'canary-token-key', CANARY_FASTGPT_FILE_TOKEN_KEY: 'canary-file-token-key', CANARY_FASTGPT_AES_KEY: 'canary-aes-key', CANARY_FASTGPT_INVOKE_TOKEN_SECRET: 'canary-invoke-token-secret-at-least-32-characters', CANARY_FASTGPT_PLUGIN_TOKEN: 'canary-plugin-token-secret-at-least-32-characters', CANARY_AIPROXY_IMAGE: 'ghcr.io/labring/aiproxy:v0.6.5@sha256:e96073363ac3e38fd0c28b7653aa18916e93c57a688452450c619023b7811e4d', CANARY_AIPROXY_ADMIN_KEY: 'canary-aiproxy-admin-key', CANARY_AIPROXY_POSTGRES_PASSWORD: 'canary-aiproxy-postgres-password', CANARY_MODEL_UPSTREAM_ENDPOINT: 'https://canary-model.example.com/v1', CANARY_MODEL_UPSTREAM_API_KEY: 'canary-model-api-key',
};
values.MYSQL_CLIENT_IMAGE = `mysql:8.0.44@sha256:${'a'.repeat(64)}`;
values.FASTGPT_CANARY_ARCHIVE = '/secure/fastgpt-canary.tar';
values.MCP_IMAGE = mcpImage;
values.MCP_IMAGE_ARCHIVE = '/secure/dachuanpro-mcp.tar';
values.MCP_IMAGE_IDENTITY_PROOF = './mcp-proof.json';

function run(file) { return spawnSync(process.execPath, [validator, file], { encoding: 'utf8' }); }

try {
  fs.writeFileSync(mongoReplicaKeyFile, `${'ab'.repeat(48)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(directory, 'proof.json'), JSON.stringify(proof));
  fs.writeFileSync(path.join(directory, 'mcp-proof.json'), JSON.stringify(mcpProof));
  const valid = path.join(directory, '.env.production');
  fs.writeFileSync(valid, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const pass = run(valid);
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /PRODUCTION_ENV=PASS/);
  assert.match(pass.stdout, /FASTGPT_4152_COMPATIBILITY_PROOF=PASS/);
  const rejected = path.join(directory, '.env.rejected');
  fs.writeFileSync(rejected, `${Object.entries({ ...values, AGENT_GATEWAY_ALLOWED_ROLES: 'SUPER_ADMIN,SALES' }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const fail = run(rejected);
  assert.notEqual(fail.status, 0);
  assert.match(fail.stderr, /SUPER_ADMIN/);
  const formalTarget = path.join(directory, '.env.formal-target');
  fs.writeFileSync(formalTarget, `${Object.entries({ ...values, AGENT_GATEWAY_FASTGPT_CHAT_URL: 'http://127.0.0.1:3100/api/v1/chat/completions' }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const formalTargetFail = run(formalTarget);
  assert.notEqual(formalTargetFail.status, 0);
  assert.match(formalTargetFail.stderr, /formal FastGPT origin/);
  const localhostGrantHost = path.join(directory, '.env.localhost-grant-host');
  fs.writeFileSync(localhostGrantHost, `${Object.entries({ ...values, MCP_DATABASE_GRANT_HOST: 'localhost' }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const localhostGrantHostFail = run(localhostGrantHost);
  assert.notEqual(localhostGrantHostFail.status, 0);
  assert.match(localhostGrantHostFail.stderr, /fixed MCP container address/);
  const wrongRedis = path.join(directory, '.env.wrong-redis');
  fs.writeFileSync(wrongRedis, `${Object.entries({ ...values, AGENT_AUTH_REDIS_URL: 'redis://:wrong-password@dachuanpro-mcp-redis:6379' }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const wrongRedisFail = run(wrongRedis);
  assert.notEqual(wrongRedisFail.status, 0);
  assert.match(wrongRedisFail.stderr, /dedicated password-protected/);
  const wrongCanaryHealth = path.join(directory, '.env.wrong-canary-health');
  fs.writeFileSync(wrongCanaryHealth, `${Object.entries({ ...values, FASTGPT_CANARY_HEALTH_URL: 'http://127.0.0.1:3110/api/health' }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const wrongCanaryHealthFail = run(wrongCanaryHealth);
  assert.notEqual(wrongCanaryHealthFail.status, 0);
  assert.match(wrongCanaryHealthFail.stderr, /use \/health/);
  const invalidMongoKey = path.join(directory, 'canary-mongo-invalid.key');
  fs.writeFileSync(invalidMongoKey, 'not-a-valid-key\n', { mode: 0o600 });
  const invalidMongoKeyEnv = path.join(directory, '.env.invalid-mongo-key');
  fs.writeFileSync(invalidMongoKeyEnv, `${Object.entries({ ...values, CANARY_MONGO_REPLICA_KEY_FILE: invalidMongoKey }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const invalidMongoKeyFail = run(invalidMongoKeyEnv);
  assert.notEqual(invalidMongoKeyFail.status, 0);
  assert.match(invalidMongoKeyFail.stderr, /replica keyfile/);
  const missingInvokeValues = { ...values };
  delete missingInvokeValues.CANARY_FASTGPT_INVOKE_TOKEN_SECRET;
  const missingInvokeSecret = path.join(directory, '.env.missing-invoke-secret');
  fs.writeFileSync(missingInvokeSecret, `${Object.entries(missingInvokeValues).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const missingInvokeSecretFail = run(missingInvokeSecret);
  assert.notEqual(missingInvokeSecretFail.status, 0);
  assert.match(missingInvokeSecretFail.stderr, /CANARY_FASTGPT_INVOKE_TOKEN_SECRET is missing/);
  const shortInvokeSecret = path.join(directory, '.env.short-invoke-secret');
  fs.writeFileSync(shortInvokeSecret, `${Object.entries({ ...values, CANARY_FASTGPT_INVOKE_TOKEN_SECRET: 'too-short' }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const shortInvokeSecretFail = run(shortInvokeSecret);
  assert.notEqual(shortInvokeSecretFail.status, 0);
  assert.match(shortInvokeSecretFail.stderr, /at least 32 characters/);
  const reusedInvokeSecret = path.join(directory, '.env.reused-invoke-secret');
  fs.writeFileSync(reusedInvokeSecret, `${Object.entries({ ...values, CANARY_FASTGPT_AES_KEY: values.CANARY_FASTGPT_INVOKE_TOKEN_SECRET }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const reusedInvokeSecretFail = run(reusedInvokeSecret);
  assert.notEqual(reusedInvokeSecretFail.status, 0);
  assert.match(reusedInvokeSecretFail.stderr, /must be distinct/);
  const missingPluginValues = { ...values };
  delete missingPluginValues.CANARY_FASTGPT_PLUGIN_TOKEN;
  const missingPluginToken = path.join(directory, '.env.missing-plugin-token');
  fs.writeFileSync(missingPluginToken, `${Object.entries(missingPluginValues).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const missingPluginTokenFail = run(missingPluginToken);
  assert.notEqual(missingPluginTokenFail.status, 0);
  assert.match(missingPluginTokenFail.stderr, /CANARY_FASTGPT_PLUGIN_TOKEN is missing/);
  const shortPluginToken = path.join(directory, '.env.short-plugin-token');
  fs.writeFileSync(shortPluginToken, `${Object.entries({ ...values, CANARY_FASTGPT_PLUGIN_TOKEN: 'too-short' }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const shortPluginTokenFail = run(shortPluginToken);
  assert.notEqual(shortPluginTokenFail.status, 0);
  assert.match(shortPluginTokenFail.stderr, /at least 32 characters/);
  const reusedPluginToken = path.join(directory, '.env.reused-plugin-token');
  fs.writeFileSync(reusedPluginToken, `${Object.entries({ ...values, CANARY_FASTGPT_PLUGIN_TOKEN: values.CANARY_FASTGPT_INVOKE_TOKEN_SECRET }).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  const reusedPluginTokenFail = run(reusedPluginToken);
  assert.notEqual(reusedPluginTokenFail.status, 0);
  assert.match(reusedPluginTokenFail.stderr, /must be distinct/);
  process.stdout.write('PRODUCTION_ENV_VALIDATOR=PASS\n');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

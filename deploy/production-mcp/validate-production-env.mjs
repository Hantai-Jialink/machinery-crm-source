import fs from 'node:fs';
import path from 'node:path';

const [envFile] = process.argv.slice(2);
if (!envFile) throw new Error('Usage: validate-production-env.mjs <.env.production>');
const values = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith('#'))
  .map((line) => {
    const index = line.indexOf('=');
    if (index < 1) throw new Error(`Invalid environment line: ${line}`);
    return [line.slice(0, index), line.slice(index + 1)];
  }));
const required = [
  'MCP_IMAGE', 'MCP_IMAGE_ARCHIVE', 'MCP_IMAGE_IDENTITY_PROOF', 'CRM_DATABASE', 'DATABASE_URL', 'MCP_AUDIT_DATABASE_URL', 'MYSQL_CLIENT_DEFAULTS_FILE', 'MCP_AUDIT_MYSQL_CLIENT_DEFAULTS_FILE', 'MYSQL_CLIENT_IMAGE', 'MCP_DATABASE_GRANT_HOST', 'MCP_DATABASE_READ_USER', 'MCP_DATABASE_AUDIT_USER', 'AUTH_SECRET', 'AUTH_URL', 'MCP_AUDIT_USER_ID',
  'MCP_API_KEYS_JSON', 'MCP_TOOL_MODE', 'MCP_TOOL_ALLOWLIST', 'MCP_ALLOWED_HOSTS', 'AGENT_AUTH_ISSUER', 'AGENT_AUTH_AUDIENCE',
  'AGENT_AUTH_ACTIVE_KID', 'AGENT_AUTH_KEYS_JSON', 'REDIS_PASSWORD', 'AGENT_AUTH_REDIS_URL', 'AGENT_GATEWAY_FASTGPT_CHAT_URL',
  'AGENT_GATEWAY_FASTGPT_API_KEY', 'AGENT_GATEWAY_ALLOWED_ORIGINS', 'AGENT_GATEWAY_ALLOWED_ROLES',
  'FORMAL_FASTGPT_HEALTH_URL', 'FASTGPT_CANARY_HEALTH_URL', 'FASTGPT_CANARY_COMPATIBILITY_PROOF', 'FASTGPT_SOURCE_COMMIT', 'FASTGPT_BASE_IMAGE', 'FASTGPT_CANARY_IMAGE', 'FASTGPT_CANARY_ARCHIVE', 'FASTGPT_DIR', 'CRM_DIR',
  'NGINX_GATEWAY_INCLUDE', 'BACKUP_ROOT',
  'FORMAL_FASTGPT_MONGO_FINGERPRINT', 'CANARY_FASTGPT_MONGO_FINGERPRINT', 'FORMAL_FASTGPT_REDIS_FINGERPRINT', 'CANARY_FASTGPT_REDIS_FINGERPRINT',
  'FORMAL_FASTGPT_OBJECT_STORAGE_FINGERPRINT', 'CANARY_FASTGPT_OBJECT_STORAGE_FINGERPRINT', 'FORMAL_FASTGPT_APP_FINGERPRINT', 'CANARY_FASTGPT_APP_FINGERPRINT',
  'FORMAL_FASTGPT_USER_FINGERPRINT', 'CANARY_FASTGPT_USER_FINGERPRINT', 'FORMAL_FASTGPT_SESSION_FINGERPRINT', 'CANARY_FASTGPT_SESSION_FINGERPRINT',
  'FORMAL_FASTGPT_API_KEY_FINGERPRINT', 'CANARY_FASTGPT_API_KEY_FINGERPRINT', 'FORMAL_FASTGPT_AI_PROXY_FINGERPRINT', 'CANARY_FASTGPT_AI_PROXY_FINGERPRINT', 'FORMAL_FASTGPT_MODEL_SERVICE_FINGERPRINT', 'CANARY_FASTGPT_MODEL_SERVICE_FINGERPRINT',
  'CANARY_MONGO_ROOT_USER', 'CANARY_MONGO_ROOT_PASSWORD', 'CANARY_MONGO_DATABASE', 'CANARY_MONGO_REPLICA_KEY_FILE', 'CANARY_REDIS_PASSWORD', 'CANARY_MINIO_ROOT_USER', 'CANARY_MINIO_ROOT_PASSWORD', 'CANARY_STORAGE_PUBLIC_BUCKET', 'CANARY_STORAGE_PRIVATE_BUCKET',
  'CANARY_FASTGPT_ROOT_PASSWORD', 'CANARY_FASTGPT_ROOT_KEY', 'CANARY_FASTGPT_TOKEN_KEY', 'CANARY_FASTGPT_FILE_TOKEN_KEY', 'CANARY_FASTGPT_AES_KEY', 'CANARY_AIPROXY_IMAGE', 'CANARY_AIPROXY_ADMIN_KEY', 'CANARY_AIPROXY_POSTGRES_PASSWORD', 'CANARY_MODEL_UPSTREAM_ENDPOINT', 'CANARY_MODEL_UPSTREAM_API_KEY',
];
for (const name of required) {
  const value = String(values[name] || '').trim();
  if (!value || /REPLACE_WITH|GENERATE_|identity-acceptance|dachuan_identity_acceptance/i.test(value)) {
    throw new Error(`${name} is missing or contains a non-production placeholder`);
  }
}
if (values.NODE_ENV !== 'production' || values.MCP_TOOL_MODE !== 'FULL_READ_ONLY' || values.MCP_LEGACY_USER_BOUND_AUTH !== 'false') {
  throw new Error('Production mode, FULL_READ_ONLY, and disabled legacy identity are required');
}
if (values.AGENT_GATEWAY_ALLOWED_ROLES !== 'SUPER_ADMIN') throw new Error('Phase one must allow only SUPER_ADMIN');
const tools = values.MCP_TOOL_ALLOWLIST.split(',').map((value) => value.trim()).filter(Boolean);
const phaseOneTools = new Set(['dachuan_identity_who_am_i', 'crm_customer_get', 'crm_contract_get']);
if (!tools.includes('dachuan_identity_who_am_i') || tools.length > 3 || tools.some((tool) => !phaseOneTools.has(tool))) {
  throw new Error('Phase one permits who_am_i and at most two exact-ID read-only tools');
}
if (!/^dachuanpro-mcp-runtime:[0-9]+$/.test(values.MCP_IMAGE)) throw new Error('MCP_IMAGE must use the fixed RepoTag from the approved artifact');
if (!path.isAbsolute(values.MCP_IMAGE_ARCHIVE)) throw new Error('MCP_IMAGE_ARCHIVE must be an absolute path');
if (!/^mysql:8\.0\.44@sha256:[a-f0-9]{64}$/i.test(values.MYSQL_CLIENT_IMAGE)) throw new Error('MYSQL_CLIENT_IMAGE must pin MySQL 8.0.44 by digest');
if (values.CANARY_AIPROXY_IMAGE !== 'ghcr.io/labring/aiproxy:v0.6.5@sha256:e96073363ac3e38fd0c28b7653aa18916e93c57a688452450c619023b7811e4d') throw new Error('CANARY_AIPROXY_IMAGE must use the approved v0.6.5 AMD64 digest');
let agentRedis;
try {
  agentRedis = new URL(values.AGENT_AUTH_REDIS_URL);
} catch {
  throw new Error('AGENT_AUTH_REDIS_URL must be a valid absolute URL');
}
if (agentRedis.protocol !== 'redis:' || agentRedis.hostname !== 'dachuanpro-mcp-redis' || agentRedis.password !== values.REDIS_PASSWORD) {
  throw new Error('Agent assertion Redis must use the dedicated password-protected production container');
}
if (values.MCP_DATABASE_GRANT_HOST !== '172.30.31.10') throw new Error('MCP_DATABASE_GRANT_HOST must match the fixed MCP container address 172.30.31.10');
if (!path.isAbsolute(values.CANARY_MONGO_REPLICA_KEY_FILE)) throw new Error('CANARY_MONGO_REPLICA_KEY_FILE must be an absolute path');
let mongoReplicaKey;
try {
  mongoReplicaKey = fs.readFileSync(values.CANARY_MONGO_REPLICA_KEY_FILE, 'utf8').trim();
} catch {
  throw new Error('CANARY_MONGO_REPLICA_KEY_FILE is missing or unreadable');
}
if (!/^[a-f0-9]{64,1024}$/i.test(mongoReplicaKey)) throw new Error('Canary Mongo replica keyfile must contain 64-1024 hexadecimal characters');
if (mongoReplicaKey === values.CANARY_MONGO_ROOT_PASSWORD) throw new Error('Canary Mongo replica key must differ from the root password');
for (const name of ['CANARY_MONGO_ROOT_USER', 'CANARY_MONGO_ROOT_PASSWORD', 'CANARY_REDIS_PASSWORD', 'CANARY_AIPROXY_POSTGRES_PASSWORD']) {
  if (!/^[A-Za-z0-9._~-]+$/.test(values[name])) {
    throw new Error(`${name} must use URI-safe characters because Compose embeds it in a connection URL`);
  }
}
if (values.FASTGPT_SOURCE_COMMIT !== 'b9b6e2305e70823c9706291de4b19c4dc3ae05f6') throw new Error('FastGPT source must be exact v4.15.2 commit b9b6e2305e70823c9706291de4b19c4dc3ae05f6');
if (values.FASTGPT_BASE_IMAGE !== 'ghcr.io/labring/fastgpt:v4.15.2@sha256:8f09f9dd41c17aecec6bbe69a332432fdf4e686546f050d65e670bda60aa2033') throw new Error('FastGPT base image must be the approved v4.15.2 AMD64 digest');
if (!/^dachuan-fastgpt:v4\.15\.2-dachuan-[0-9]+$/.test(values.FASTGPT_CANARY_IMAGE)) throw new Error('FastGPT Canary must use the fixed RepoTag from the approved artifact');
if (!path.isAbsolute(values.FASTGPT_CANARY_ARCHIVE)) throw new Error('FASTGPT_CANARY_ARCHIVE must be an absolute path');
const agentEngine = String(values.FASTGPT_CANARY_AGENT_ENGINE || '').trim();
if (agentEngine && !['fastAgent', 'piAgent'].includes(agentEngine)) throw new Error('FASTGPT_CANARY_AGENT_ENGINE may be only fastAgent, piAgent, or unset');
for (const resource of ['MONGO', 'REDIS', 'OBJECT_STORAGE', 'APP', 'USER', 'SESSION', 'API_KEY', 'AI_PROXY', 'MODEL_SERVICE']) {
  if (values[`FORMAL_FASTGPT_${resource}_FINGERPRINT`] === values[`CANARY_FASTGPT_${resource}_FINGERPRINT`]) {
    throw new Error(`Canary must not share formal FastGPT ${resource} data`);
  }
}
let formalFastGpt;
let canaryFastGpt;
let gatewayFastGpt;
try {
  formalFastGpt = new URL(values.FORMAL_FASTGPT_HEALTH_URL);
  canaryFastGpt = new URL(values.FASTGPT_CANARY_HEALTH_URL);
  gatewayFastGpt = new URL(values.AGENT_GATEWAY_FASTGPT_CHAT_URL);
} catch {
  throw new Error('FastGPT health and gateway URLs must be valid absolute URLs');
}
if (formalFastGpt.origin === canaryFastGpt.origin || formalFastGpt.origin === gatewayFastGpt.origin) {
  throw new Error('Canary and gateway targets must not share the formal FastGPT origin');
}
if (canaryFastGpt.pathname !== '/health') throw new Error('FastGPT v4.15.2 Canary health URL must use /health');
if (canaryFastGpt.origin !== gatewayFastGpt.origin) {
  throw new Error('Agent Gateway must target the same FastGPT Canary origin checked by preflight');
}
console.log(`PRODUCTION_ENV=PASS phaseOneTools=${tools.length}`);
const mcpProofPath = path.resolve(path.dirname(envFile), values.MCP_IMAGE_IDENTITY_PROOF);
const mcpProof = JSON.parse(fs.readFileSync(mcpProofPath, 'utf8'));
if (mcpProof.repoTag !== values.MCP_IMAGE || !/^sha256:[a-f0-9]{64}$/i.test(mcpProof.configDigest) || !/^sha256:[a-f0-9]{64}$/i.test(mcpProof.archiveSha256) || mcpProof.os !== 'linux' || mcpProof.architecture !== 'amd64') {
  throw new Error('MCP image archive identity proof is not approved');
}
console.log('MCP_IMAGE_ARCHIVE_PROOF=PASS');
const proofPath = path.resolve(path.dirname(envFile), values.FASTGPT_CANARY_COMPATIBILITY_PROOF);
const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
for (const name of ['sourceCommit', 'sourceImageDigest', 'patchedImage', 'patchedManifestDigest', 'patchedConfigDigest', 'patchedArchiveSha256', 'patchSha256', 'focusedTests', 'concurrencyAcceptance', 'canaryIsolation', 'agentEngine', 'sourcePatchApply', 'runtimeAcceptance', 'rollbackProof']) {
  if (!proof[name]) throw new Error(`FastGPT compatibility proof is missing ${name}`);
}
if (proof.sourceCommit !== values.FASTGPT_SOURCE_COMMIT || proof.sourceImageDigest !== values.FASTGPT_BASE_IMAGE.split('@')[1] || proof.patchedImageTag !== values.FASTGPT_CANARY_IMAGE || proof.patchedImage !== `${proof.patchedImageTag}@${proof.patchedManifestDigest}` || !String(proof.patchedImage).includes('v4.15.2') || !/^sha256:[a-f0-9]{64}$/i.test(proof.patchedManifestDigest) || !/^sha256:[a-f0-9]{64}$/i.test(proof.patchedConfigDigest) || !/^sha256:[a-f0-9]{64}$/i.test(proof.patchedArchiveSha256) || proof.focusedTests !== 'PASS' || proof.concurrencyAcceptance !== 'PASS' || proof.canaryIsolation !== 'PASS' || proof.sourcePatchApply !== 'PASS' || proof.runtimeAcceptance !== 'PASS' || proof.rollbackProof !== 'PASS' || (proof.agentEngine && !['fastAgent', 'piAgent'].includes(proof.agentEngine)) || (agentEngine && proof.agentEngine !== agentEngine)) {
  throw new Error('FastGPT 4.15.2 compatibility proof is not approved');
}
console.log('FASTGPT_4152_COMPATIBILITY_PROOF=PASS');

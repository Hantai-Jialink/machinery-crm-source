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
  'MCP_IMAGE', 'CRM_DATABASE', 'DATABASE_URL', 'MCP_AUDIT_DATABASE_URL', 'MYSQL_CLIENT_DEFAULTS_FILE', 'AUTH_SECRET', 'AUTH_URL', 'MCP_AUDIT_USER_ID',
  'MCP_API_KEYS_JSON', 'MCP_TOOL_MODE', 'MCP_TOOL_ALLOWLIST', 'MCP_ALLOWED_HOSTS', 'AGENT_AUTH_ISSUER', 'AGENT_AUTH_AUDIENCE',
  'AGENT_AUTH_ACTIVE_KID', 'AGENT_AUTH_KEYS_JSON', 'AGENT_AUTH_REDIS_URL', 'AGENT_GATEWAY_FASTGPT_CHAT_URL',
  'AGENT_GATEWAY_FASTGPT_API_KEY', 'AGENT_GATEWAY_ALLOWED_ORIGINS', 'AGENT_GATEWAY_ALLOWED_ROLES',
  'FORMAL_FASTGPT_HEALTH_URL', 'FASTGPT_CANARY_HEALTH_URL', 'FASTGPT_CANARY_COMPATIBILITY_PROOF', 'FASTGPT_SOURCE_COMMIT', 'FASTGPT_BASE_IMAGE', 'FASTGPT_CANARY_IMAGE', 'FASTGPT_DIR', 'CRM_DIR',
  'NGINX_GATEWAY_INCLUDE', 'BACKUP_ROOT',
  'FORMAL_FASTGPT_MONGO_FINGERPRINT', 'CANARY_FASTGPT_MONGO_FINGERPRINT', 'FORMAL_FASTGPT_REDIS_FINGERPRINT', 'CANARY_FASTGPT_REDIS_FINGERPRINT',
  'FORMAL_FASTGPT_OBJECT_STORAGE_FINGERPRINT', 'CANARY_FASTGPT_OBJECT_STORAGE_FINGERPRINT', 'FORMAL_FASTGPT_APP_FINGERPRINT', 'CANARY_FASTGPT_APP_FINGERPRINT',
  'FORMAL_FASTGPT_USER_FINGERPRINT', 'CANARY_FASTGPT_USER_FINGERPRINT', 'FORMAL_FASTGPT_SESSION_FINGERPRINT', 'CANARY_FASTGPT_SESSION_FINGERPRINT',
  'FORMAL_FASTGPT_API_KEY_FINGERPRINT', 'CANARY_FASTGPT_API_KEY_FINGERPRINT',
  'CANARY_MONGO_ROOT_USER', 'CANARY_MONGO_ROOT_PASSWORD', 'CANARY_MONGO_DATABASE', 'CANARY_REDIS_PASSWORD', 'CANARY_MINIO_ROOT_USER', 'CANARY_MINIO_ROOT_PASSWORD', 'CANARY_STORAGE_S3_BUCKET',
  'CANARY_FASTGPT_ROOT_KEY', 'CANARY_FASTGPT_TOKEN_KEY', 'CANARY_FASTGPT_FILE_TOKEN_KEY', 'CANARY_FASTGPT_AES_KEY',
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
if (!/@sha256:[a-f0-9]{64}$/i.test(values.MCP_IMAGE)) throw new Error('MCP_IMAGE must use an immutable @sha256 digest');
if (values.FASTGPT_SOURCE_COMMIT !== 'b9b6e2305e70823c9706291de4b19c4dc3ae05f6') throw new Error('FastGPT source must be exact v4.15.2 commit b9b6e2305e70823c9706291de4b19c4dc3ae05f6');
if (values.FASTGPT_BASE_IMAGE !== 'ghcr.io/labring/fastgpt:v4.15.2@sha256:8f09f9dd41c17aecec6bbe69a332432fdf4e686546f050d65e670bda60aa2033') throw new Error('FastGPT base image must be the approved v4.15.2 AMD64 digest');
if (!/@sha256:[a-f0-9]{64}$/i.test(values.FASTGPT_CANARY_IMAGE) || values.FASTGPT_CANARY_IMAGE === values.FASTGPT_BASE_IMAGE) throw new Error('FastGPT Canary must be a separately built immutable image');
const agentEngine = String(values.FASTGPT_CANARY_AGENT_ENGINE || '').trim();
if (agentEngine && !['fastAgent', 'piAgent'].includes(agentEngine)) throw new Error('FASTGPT_CANARY_AGENT_ENGINE may be only fastAgent, piAgent, or unset');
for (const resource of ['MONGO', 'REDIS', 'OBJECT_STORAGE', 'APP', 'USER', 'SESSION', 'API_KEY']) {
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
if (canaryFastGpt.origin !== gatewayFastGpt.origin) {
  throw new Error('Agent Gateway must target the same FastGPT Canary origin checked by preflight');
}
console.log(`PRODUCTION_ENV=PASS phaseOneTools=${tools.length}`);
const proofPath = path.resolve(path.dirname(envFile), values.FASTGPT_CANARY_COMPATIBILITY_PROOF);
const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
for (const name of ['sourceCommit', 'sourceImageDigest', 'patchedImage', 'patchSha256', 'focusedTests', 'concurrencyAcceptance', 'canaryIsolation', 'agentEngine', 'sourcePatchApply']) {
  if (!proof[name]) throw new Error(`FastGPT compatibility proof is missing ${name}`);
}
if (proof.sourceCommit !== values.FASTGPT_SOURCE_COMMIT || proof.sourceImageDigest !== values.FASTGPT_BASE_IMAGE.split('@')[1] || proof.patchedImage !== values.FASTGPT_CANARY_IMAGE || !String(proof.patchedImage).includes('v4.15.2') || proof.focusedTests !== 'PASS' || proof.concurrencyAcceptance !== 'PASS' || proof.canaryIsolation !== 'PASS' || proof.sourcePatchApply !== 'PASS' || (proof.agentEngine && !['fastAgent', 'piAgent'].includes(proof.agentEngine)) || (agentEngine && proof.agentEngine !== agentEngine)) {
  throw new Error('FastGPT 4.15.2 compatibility proof is not approved');
}
console.log('FASTGPT_4152_COMPATIBILITY_PROOF=PASS');

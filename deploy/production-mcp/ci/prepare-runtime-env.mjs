import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [mode, outputArg, imageArg = ""] = process.argv.slice(2);
if (!new Set(["canary", "mcp"]).has(mode) || !outputArg) {
  throw new Error("Usage: node prepare-runtime-env.mjs <canary|mcp> <output> [mcp-image]");
}

const output = resolve(outputArg);
const secret = (bytes = 24) => randomBytes(bytes).toString("base64url");
const write = (values) => {
  const content = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  writeFileSync(output, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(`Created secret runtime environment: ${output}`);
};

if (mode === "canary") {
  const mongoReplicaKeyFile = `${output}.mongo-key`;
  writeFileSync(mongoReplicaKeyFile, `${randomBytes(48).toString("hex")}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  write({
    FASTGPT_CANARY_IMAGE: "dachuan-fastgpt-canary-ci:runtime",
    CANARY_MONGO_ROOT_USER: "canary_runtime",
    CANARY_MONGO_ROOT_PASSWORD: secret(),
    CANARY_MONGO_DATABASE: "dachuan_fastgpt_canary_4152",
    CANARY_MONGO_REPLICA_KEY_FILE: mongoReplicaKeyFile,
    CANARY_REDIS_PASSWORD: secret(),
    CANARY_MINIO_ROOT_USER: "canaryruntime",
    CANARY_MINIO_ROOT_PASSWORD: secret(),
    CANARY_STORAGE_PUBLIC_BUCKET: "canary-runtime-public",
    CANARY_STORAGE_PRIVATE_BUCKET: "canary-runtime-private",
    CANARY_FASTGPT_ROOT_PASSWORD: secret(),
    CANARY_FASTGPT_ROOT_KEY: secret(),
    CANARY_FASTGPT_TOKEN_KEY: secret(),
    CANARY_FASTGPT_FILE_TOKEN_KEY: secret(),
    CANARY_FASTGPT_AES_KEY: secret(),
    CANARY_FASTGPT_INVOKE_TOKEN_SECRET: secret(32),
    CANARY_AIPROXY_IMAGE: "node:24.16.0-alpine",
    CANARY_AIPROXY_ADMIN_KEY: secret(),
    CANARY_AIPROXY_POSTGRES_PASSWORD: secret(),
    CANARY_MODEL_UPSTREAM_ENDPOINT: "http://fastgpt-canary-model-mock:8080/v1",
    CANARY_MODEL_UPSTREAM_API_KEY: secret(),
    FASTGPT_CANARY_AGENT_ENGINE: "fastAgent",
    FASTGPT_CANARY_HEALTH_URL: "http://127.0.0.1:3110/health",
    FASTGPT_CANARY_ADMIN_URL: "http://127.0.0.1:3110",
    CANARY_RUNTIME_CI_OVERLAY: "1",
  });
  process.exit(0);
}

if (!imageArg) throw new Error("mcp mode requires a fixed runtime image name");
const serviceKey = `dcp_runtime_${secret(32)}`;
const serviceHash = createHash("sha256").update(serviceKey).digest("hex");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const keys = JSON.stringify([{
  kid: "production-runtime-ci-1",
  publicJwk: publicKey.export({ format: "jwk" }),
  privateJwk: privateKey.export({ format: "jwk" }),
}]);
const rootPassword = secret();
const readPassword = secret();
const auditPassword = secret();
const redisPassword = secret();
write({
  PRODUCTION_MCP_RUNTIME_CI: "1",
  MCP_IMAGE: imageArg,
  PRODUCTION_ENV_FILE: output,
  CRM_DATABASE: "dachuan_identity_acceptance",
  MYSQL_ROOT_PASSWORD: rootPassword,
  MCP_DATABASE_READ_USER: "dachuan_mcp_read",
  MCP_DATABASE_READ_PASSWORD: readPassword,
  MCP_DATABASE_AUDIT_USER: "dachuan_mcp_audit",
  MCP_DATABASE_AUDIT_PASSWORD: auditPassword,
  MYSQL_CLIENT_IMAGE: "mysql:8.0.44@sha256:f7878bec832c6be5e61c39d3949651be8aa977daf875089b4560ae1434d2cb9c",
  MCP_DATABASE_GRANT_HOST: "172.30.31.10",
  DATABASE_URL: `mysql://dachuan_mcp_read:${readPassword}@mysql:3306/dachuan_identity_acceptance`,
  MCP_AUDIT_DATABASE_URL: `mysql://dachuan_mcp_audit:${auditPassword}@mysql:3306/dachuan_identity_acceptance`,
  ACCEPTANCE_ADMIN_DATABASE_URL: `mysql://root:${rootPassword}@mysql:3306/dachuan_identity_acceptance`,
  REDIS_PASSWORD: redisPassword,
  AGENT_AUTH_REDIS_URL: `redis://:${redisPassword}@dachuanpro-mcp-redis:6379`,
  AGENT_AUTH_REDIS_PREFIX: "dachuan:production-runtime-ci",
  AUTH_SECRET: secret(48),
  AUTH_URL: "http://dachuanpro-mcp:3010",
  MCP_AUDIT_USER_ID: "identity-acceptance-audit",
  MCP_SERVICE_KEY: serviceKey,
  MCP_API_KEYS_JSON: JSON.stringify([{ name: "fastgpt-production-runtime", keyHash: serviceHash }]),
  MCP_LEGACY_USER_BOUND_AUTH: "false",
  MCP_TOOL_MODE: "FULL_READ_ONLY",
  MCP_TOOL_ALLOWLIST: "dachuan_identity_who_am_i,crm_customer_get,crm_contract_get",
  MCP_QUERY_TIMEOUT_MS: "5000",
  MCP_ALLOWED_HOSTS: "dachuanpro-mcp:3010",
  MCP_ALLOWED_ORIGINS: "http://fastgpt-canary.invalid",
  AGENT_AUTH_ISSUER: "http://production-runtime.crm",
  AGENT_AUTH_AUDIENCE: "dachuanpro-agent-mcp-production-runtime",
  AGENT_AUTH_TOKEN_TTL_SECONDS: "600",
  AGENT_AUTH_ACTIVE_KID: "production-runtime-ci-1",
  AGENT_AUTH_KEYS_JSON: keys,
  AGENT_GATEWAY_FASTGPT_CHAT_URL: "http://fastgpt-gateway-upstream:8080/v1/chat/completions",
  AGENT_GATEWAY_FASTGPT_API_KEY: secret(32),
  AGENT_GATEWAY_MAX_REQUEST_BYTES: "1048576",
  AGENT_GATEWAY_RATE_LIMIT_PER_MINUTE: "120",
  AGENT_GATEWAY_ALLOWED_ORIGINS: "http://crm-runtime.invalid",
  AGENT_GATEWAY_ALLOWED_ROLES: "SUPER_ADMIN",
  ACCEPTANCE_USER_PASSWORD: `Runtime!${secret(18)}`,
  ACCEPTANCE_SALES_A_EMAIL: "runtime-sales-a@dachuan.invalid",
  ACCEPTANCE_SALES_B_EMAIL: "runtime-sales-b@dachuan.invalid",
  ACCEPTANCE_PURCHASE_EMAIL: "runtime-purchase@dachuan.invalid",
  ACCEPTANCE_WAREHOUSE_EMAIL: "runtime-warehouse@dachuan.invalid",
  ACCEPTANCE_ADMIN_EMAIL: "runtime-admin@dachuan.invalid",
  ACCEPTANCE_MCP_URL: "http://dachuanpro-mcp:3010/api/mcp",
  ACCEPTANCE_CRM_URL: "http://dachuanpro-mcp:3010",
  FORMAL_FASTGPT_HEALTH_URL: "http://127.0.0.1:3100/health",
  NGINX_GATEWAY_INCLUDE: "/tmp/production-runtime-nginx.conf",
});

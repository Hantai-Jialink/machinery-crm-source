import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [templateArg, outputArg] = process.argv.slice(2);
if (!templateArg || !outputArg) throw new Error("Usage: node prepare-env.mjs <template> <output>");
const template = resolve(templateArg);
const output = resolve(outputArg);
const secret = (bytes = 32) => randomBytes(bytes).toString("base64url");
const serviceKey = `dcp_accept_${secret(32)}`;
const serviceHash = createHash("sha256").update(serviceKey).digest("hex");
const mysqlPassword = secret(24);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const keys = JSON.stringify([{
  kid: "identity-acceptance-1",
  publicJwk: publicKey.export({ format: "jwk" }),
  privateJwk: privateKey.export({ format: "jwk" }),
}]);
const replacements = {
  GENERATE_MYSQL_PASSWORD: mysqlPassword,
  GENERATE_MYSQL_ROOT_PASSWORD: secret(24),
  GENERATE_REDIS_PASSWORD: secret(24),
  GENERATE_AUTH_SECRET: secret(48),
  GENERATE_MCP_SERVICE_KEY_HASH: serviceHash,
  GENERATE_MCP_SERVICE_KEY: serviceKey,
  GENERATE_AGENT_AUTH_KEYS_JSON: keys,
  GENERATE_ACCEPTANCE_USER_PASSWORD: `Acceptance!${secret(18)}`,
  GENERATE_FASTGPT_ROOT_PASSWORD: `FastGPT!${secret(18)}`,
  GENERATE_FASTGPT_ROOT_KEY: secret(32),
  GENERATE_FASTGPT_TOKEN_KEY: secret(32),
  GENERATE_FASTGPT_FILE_TOKEN_KEY: secret(32),
  GENERATE_FASTGPT_AES_KEY: secret(32),
  GENERATE_FASTGPT_INVOKE_TOKEN_SECRET: secret(48),
  GENERATE_FASTGPT_MONGO_PASSWORD: secret(24),
  GENERATE_FASTGPT_REDIS_PASSWORD: secret(24),
  GENERATE_FASTGPT_MINIO_PASSWORD: secret(24),
  GENERATE_FASTGPT_PG_PASSWORD: secret(24),
};
let content = readFileSync(template, "utf8");
for (const [placeholder, value] of Object.entries(replacements)) content = content.replaceAll(placeholder, value);
writeFileSync(output, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
console.log(`Created isolated environment file: ${output}`);

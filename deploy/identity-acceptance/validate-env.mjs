import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: node validate-env.mjs <env-file>");
const settings = Object.fromEntries(
  readFileSync(resolve(input), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) throw new Error("Invalid acceptance environment line");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const databaseUrl = new URL(settings.DATABASE_URL || "");
const expectedDatabase = "dachuan_identity_acceptance";
const allowedToolModes = new Set(["IDENTITY_POC", "FULL_READ_ONLY"]);
if (
  settings.IDENTITY_ACCEPTANCE_ENV !== "isolated"
  || settings.COMPOSE_PROJECT_NAME !== "dachuan-identity-acceptance"
  || !allowedToolModes.has(settings.MCP_TOOL_MODE)
  || databaseUrl.hostname !== "mysql"
  || databaseUrl.port !== "3306"
  || databaseUrl.pathname !== `/${expectedDatabase}`
  || settings.MYSQL_DATABASE !== expectedDatabase
  || settings.FASTGPT_IMAGE !== "dachuan-fastgpt:v4.15.1-identity-acceptance.1"
  || settings.CRM_IMAGE !== "dachuanpro-crm-erp-mcp:1.2.0-identity-acceptance.1"
  || settings.FASTGPT_AIPROXY_API_ENDPOINT !== "http://fastgpt-aiproxy:3000"
  || [
    "FASTGPT_PLUGIN_TOKEN",
    "FASTGPT_SANDBOX_TOKEN",
    "FASTGPT_AIPROXY_PG_PASSWORD",
    "FASTGPT_AIPROXY_API_TOKEN",
  ].some((name) => !settings[name] || /^(GENERATE_|REPLACE_)/.test(settings[name]))
) {
  throw new Error("Environment does not target the fixed identity-acceptance isolation project");
}
console.log("IDENTITY_ACCEPTANCE_ENVIRONMENT=VERIFIED");

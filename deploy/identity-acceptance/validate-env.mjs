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
if (
  settings.IDENTITY_ACCEPTANCE_ENV !== "isolated"
  || settings.COMPOSE_PROJECT_NAME !== "dachuan-identity-acceptance"
  || settings.MCP_TOOL_MODE !== "IDENTITY_POC"
  || databaseUrl.hostname !== "mysql"
  || databaseUrl.pathname !== `/${expectedDatabase}`
  || settings.MYSQL_DATABASE !== expectedDatabase
) {
  throw new Error("Environment does not target the fixed IDENTITY_POC isolation project");
}
console.log("IDENTITY_ACCEPTANCE_ENVIRONMENT=VERIFIED");

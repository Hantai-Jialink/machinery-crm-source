import type { McpApplicationConfig } from "@/lib/mcp/application";

type McpEnvironment = Record<string, string | undefined>;

function splitCsv(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseApiKeys(value: string | undefined) {
  if (!value) throw new Error("MCP_API_KEYS_JSON is required");

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("MCP_API_KEYS_JSON must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("MCP_API_KEYS_JSON must contain at least one API key");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`MCP API key entry ${index + 1} is invalid`);
    }
    const input = entry as Record<string, unknown>;
    const name = String(input.name || "").trim();
    const userId = String(input.userId || "").trim();
    const keyHash = String(input.keyHash || "").trim().toLowerCase().replace(/^sha256:/, "");
    if (!name || !userId || !/^[a-f0-9]{64}$/.test(keyHash)) {
      throw new Error(`MCP API key entry ${index + 1} requires name, userId and a SHA-256 keyHash`);
    }
    return { name, userId, keyHash };
  });
}

export function loadMcpConfig(environment: McpEnvironment = process.env): McpApplicationConfig {
  const allowedHosts = splitCsv(environment.MCP_ALLOWED_HOSTS);
  if (allowedHosts.length === 0) throw new Error("MCP_ALLOWED_HOSTS is required");
  const rejectedAuditUserId = String(environment.MCP_AUDIT_USER_ID || "").trim();
  if (!rejectedAuditUserId) throw new Error("MCP_AUDIT_USER_ID is required");

  return {
    apiKeys: parseApiKeys(environment.MCP_API_KEYS_JSON),
    rejectedAuditUserId,
    allowedHosts,
    allowedOrigins: splitCsv(environment.MCP_ALLOWED_ORIGINS),
  };
}

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
    if (!name || !/^[a-f0-9]{64}$/.test(keyHash)) {
      throw new Error(`MCP API key entry ${index + 1} requires name and a SHA-256 keyHash`);
    }
    return { name, ...(userId ? { userId } : {}), keyHash };
  });
}

export function loadMcpConfig(environment: McpEnvironment = process.env): McpApplicationConfig {
  const allowedHosts = splitCsv(environment.MCP_ALLOWED_HOSTS);
  if (allowedHosts.length === 0) throw new Error("MCP_ALLOWED_HOSTS is required");
  const rejectedAuditUserId = String(environment.MCP_AUDIT_USER_ID || "").trim();
  if (!rejectedAuditUserId) throw new Error("MCP_AUDIT_USER_ID is required");

  const legacyUserBindingEnabled = environment.MCP_LEGACY_USER_BOUND_AUTH?.trim().toLowerCase() === "true";
  if (legacyUserBindingEnabled && environment.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("Legacy MCP user-bound auth is forbidden in production");
  }
  const apiKeys = parseApiKeys(environment.MCP_API_KEYS_JSON);
  if (legacyUserBindingEnabled && apiKeys.some((entry) => !entry.userId)) {
    throw new Error("Legacy MCP user-bound auth requires userId on every API key entry");
  }
  const toolMode = environment.MCP_TOOL_MODE?.trim().toUpperCase() || "IDENTITY_POC";
  if (!["IDENTITY_POC", "FULL_READ_ONLY"].includes(toolMode)) {
    throw new Error("MCP_TOOL_MODE must be IDENTITY_POC or FULL_READ_ONLY");
  }

  return {
    apiKeys,
    rejectedAuditUserId,
    allowedHosts,
    allowedOrigins: splitCsv(environment.MCP_ALLOWED_ORIGINS),
    legacyUserBindingEnabled,
    toolMode: toolMode === "FULL_READ_ONLY" ? "full-read-only" : "identity-poc",
  };
}

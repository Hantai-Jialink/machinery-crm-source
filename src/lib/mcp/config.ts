import type { McpApplicationConfig } from "@/lib/mcp/application";

type McpEnvironment = Record<string, string | undefined>;

function splitCsv(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseApiKeys(value: string | undefined, forbidUserIdField = false) {
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
    if (forbidUserIdField && "userId" in input) {
      throw new Error(`MCP API key entry ${index + 1} must not contain business identity field userId`);
    }
    for (const forbidden of ["role", "region", "territories", "viewScope"] as const) {
      if (forbidden in input) {
        throw new Error(`MCP API key entry ${index + 1} must not contain business identity field ${forbidden}`);
      }
    }
    const name = String(input.name || "").trim();
    const userId = String(input.userId || "").trim();
    const keyHash = String(input.keyHash || "").trim().toLowerCase().replace(/^sha256:/, "");
    if (!name || !/^[a-f0-9]{64}$/.test(keyHash)) {
      throw new Error(`MCP API key entry ${index + 1} requires name and a SHA-256 keyHash`);
    }
    return { name, ...(userId ? { userId } : {}), keyHash };
  });
}

function parseQueryTimeout(value: string | undefined) {
  const parsed = Number(value || "5000");
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 30_000) {
    throw new Error("MCP_QUERY_TIMEOUT_MS must be an integer between 100 and 30000");
  }
  return parsed;
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
  const toolMode = environment.MCP_TOOL_MODE?.trim().toUpperCase() || "IDENTITY_POC";
  if (!["IDENTITY_POC", "FULL_READ_ONLY"].includes(toolMode)) {
    throw new Error("MCP_TOOL_MODE must be IDENTITY_POC or FULL_READ_ONLY");
  }
  const apiKeys = parseApiKeys(environment.MCP_API_KEYS_JSON, toolMode === "FULL_READ_ONLY");
  if (toolMode === "FULL_READ_ONLY" && legacyUserBindingEnabled) {
    throw new Error("FULL_READ_ONLY forbids API-key-bound user identity");
  }
  if (legacyUserBindingEnabled && apiKeys.some((entry) => !entry.userId)) {
    throw new Error("Legacy MCP user-bound auth requires userId on every API key entry");
  }

  return {
    apiKeys,
    rejectedAuditUserId,
    allowedHosts,
    allowedOrigins: splitCsv(environment.MCP_ALLOWED_ORIGINS),
    legacyUserBindingEnabled,
    toolMode: toolMode === "FULL_READ_ONLY" ? "full-read-only" : "identity-poc",
    queryTimeoutMs: parseQueryTimeout(environment.MCP_QUERY_TIMEOUT_MS),
  };
}

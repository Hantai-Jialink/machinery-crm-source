import { describe, expect, it } from "vitest";
import { loadMcpConfig } from "@/lib/mcp/config";

describe("MCP environment configuration", () => {
  it("loads only hashed API keys and explicit network allowlists", () => {
    const config = loadMcpConfig({
      NODE_ENV: "test",
      MCP_API_KEYS_JSON: JSON.stringify([
        {
          name: "fastgpt-prod",
          keyHash: `sha256:${"a".repeat(64)}`,
        },
      ]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "mcp.dachuan.pro,localhost:3000",
      MCP_ALLOWED_ORIGINS: "https://fastgpt.dachuan.pro",
    });

    expect(config).toEqual({
      apiKeys: [{ name: "fastgpt-prod", keyHash: "a".repeat(64) }],
      rejectedAuditUserId: "audit-user-1",
      allowedHosts: ["mcp.dachuan.pro", "localhost:3000"],
      allowedOrigins: ["https://fastgpt.dachuan.pro"],
      legacyUserBindingEnabled: false,
      toolMode: "identity-poc",
      queryTimeoutMs: 5000,
    });
  });

  it("enables the old user-bound key path only with an explicit compatibility flag", () => {
    const config = loadMcpConfig({
      NODE_ENV: "test",
      MCP_API_KEYS_JSON: JSON.stringify([{ name: "test-only", userId: "user-1", keyHash: "b".repeat(64) }]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "localhost:3000",
      MCP_LEGACY_USER_BOUND_AUTH: "true",
      MCP_TOOL_MODE: "IDENTITY_POC",
    });

    expect(config.legacyUserBindingEnabled).toBe(true);
    expect(config.toolMode).toBe("identity-poc");
    expect(config.apiKeys[0].userId).toBe("user-1");
  });

  it("refuses API-key-bound user identity in FULL_READ_ONLY even outside production", () => {
    expect(() => loadMcpConfig({
      NODE_ENV: "test",
      MCP_API_KEYS_JSON: JSON.stringify([{ name: "forbidden", userId: "user-1", keyHash: "d".repeat(64) }]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "localhost:3000",
      MCP_LEGACY_USER_BOUND_AUTH: "true",
      MCP_TOOL_MODE: "FULL_READ_ONLY",
    })).toThrow(/must not contain business identity field userId/);
  });

  it("refuses even an empty userId field on a FULL_READ_ONLY service key", () => {
    expect(() => loadMcpConfig({
      NODE_ENV: "test",
      MCP_API_KEYS_JSON: JSON.stringify([{ name: "forbidden", userId: "", keyHash: "d".repeat(64) }]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "localhost:3000",
      MCP_TOOL_MODE: "FULL_READ_ONLY",
    })).toThrow(/must not contain business identity field userId/);
  });

  it("refuses business roles embedded in a service-key entry", () => {
    expect(() => loadMcpConfig({
      MCP_API_KEYS_JSON: JSON.stringify([{ name: "forbidden", role: "SUPER_ADMIN", keyHash: "f".repeat(64) }]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "localhost:3000",
    })).toThrow(/must not contain business identity field role/);
  });

  it("validates the application query timeout", () => {
    expect(() => loadMcpConfig({
      MCP_API_KEYS_JSON: JSON.stringify([{ name: "fastgpt", keyHash: "e".repeat(64) }]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "localhost:3000",
      MCP_QUERY_TIMEOUT_MS: "0",
    })).toThrow(/MCP_QUERY_TIMEOUT_MS/);
  });

  it("refuses legacy user-bound keys in production even when the flag is set", () => {
    expect(() => loadMcpConfig({
      NODE_ENV: "production",
      MCP_API_KEYS_JSON: JSON.stringify([
        { name: "forbidden", userId: "admin-user", keyHash: "c".repeat(64) },
      ]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "mcp.dachuan.pro",
      MCP_LEGACY_USER_BOUND_AUTH: "true",
    })).toThrow(/forbidden in production/);
  });
});

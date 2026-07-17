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
    });
  });

  it("enables the old user-bound key path only with an explicit compatibility flag", () => {
    const config = loadMcpConfig({
      NODE_ENV: "test",
      MCP_API_KEYS_JSON: JSON.stringify([{ name: "test-only", userId: "user-1", keyHash: "b".repeat(64) }]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "localhost:3000",
      MCP_LEGACY_USER_BOUND_AUTH: "true",
      MCP_TOOL_MODE: "FULL_READ_ONLY",
    });

    expect(config.legacyUserBindingEnabled).toBe(true);
    expect(config.toolMode).toBe("full-read-only");
    expect(config.apiKeys[0].userId).toBe("user-1");
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

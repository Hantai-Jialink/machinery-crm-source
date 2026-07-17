import { describe, expect, it } from "vitest";
import { loadMcpConfig } from "@/lib/mcp/config";

describe("MCP environment configuration", () => {
  it("loads only hashed API keys and explicit network allowlists", () => {
    const config = loadMcpConfig({
      MCP_API_KEYS_JSON: JSON.stringify([
        {
          name: "fastgpt-prod",
          userId: "user-1",
          keyHash: `sha256:${"a".repeat(64)}`,
        },
      ]),
      MCP_AUDIT_USER_ID: "audit-user-1",
      MCP_ALLOWED_HOSTS: "mcp.dachuan.pro,localhost:3000",
      MCP_ALLOWED_ORIGINS: "https://fastgpt.dachuan.pro",
    });

    expect(config).toEqual({
      apiKeys: [{ name: "fastgpt-prod", userId: "user-1", keyHash: "a".repeat(64) }],
      rejectedAuditUserId: "audit-user-1",
      allowedHosts: ["mcp.dachuan.pro", "localhost:3000"],
      allowedOrigins: ["https://fastgpt.dachuan.pro"],
    });
  });
});

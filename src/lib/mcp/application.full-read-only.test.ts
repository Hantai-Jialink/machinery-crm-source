import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMcpRequestHandler, type McpApplicationDependencies, type McpRole, type McpUser } from "@/lib/mcp/application";
import { MCP_TOOL_NAMES, MCP_TOOL_ROLE_MATRIX } from "@/lib/mcp/tools";

const roles: McpRole[] = ["SUPER_ADMIN", "SALES", "FOREIGN_TRADE", "PURCHASE", "WAREHOUSE"];

const users = Object.fromEntries(roles.map((role) => [role, {
  id: `user-${role.toLowerCase()}`,
  isActive: true,
  role,
  region: role === "SALES" ? "华东" : role === "FOREIGN_TRADE" ? "海外" : "总部",
  territories: role === "SALES"
    ? [{ province: "山东省", cities: ["济南市"] }]
    : role === "FOREIGN_TRADE"
      ? [{ province: "海外", cities: [] }]
      : [],
  viewScope: role === "SUPER_ADMIN" ? "ALL" : "TERRITORY",
} satisfies McpUser])) as Record<McpRole, McpUser>;

const validArguments: Record<(typeof MCP_TOOL_NAMES)[number], Record<string, unknown>> = {
  crm_customers_list: {},
  crm_customer_get: { id: "record-1" },
  crm_customer_follows_list: { customerId: "customer-1" },
  crm_products_list: {},
  crm_product_get: { id: "record-1" },
  crm_contracts_list: {},
  crm_contract_get: { id: "record-1" },
  crm_shipments_list: {},
  crm_shipment_get: { id: "record-1" },
  erp_suppliers_list: {},
  erp_supplier_get: { id: "record-1" },
  erp_purchase_orders_list: {},
  erp_purchase_order_get: { id: "record-1" },
  erp_inventory_list: {},
  erp_stock_documents_list: { direction: "IN" },
  erp_stock_movements_list: {},
  erp_boms_list: {},
  erp_bom_get: { id: "record-1" },
  erp_production_orders_list: {},
  erp_production_order_get: { id: "record-1" },
  erp_kit_check: { productionOrderId: "production-order-1" },
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function dependencies(currentUsers: Map<string, McpUser>): McpApplicationDependencies {
  return {
    config: {
      apiKeys: [{ name: "fastgpt-service", keyHash: sha256("service-secret") }],
      rejectedAuditUserId: "audit-user",
      allowedHosts: ["mcp.example.com"],
      allowedOrigins: [],
      legacyUserBindingEnabled: false,
      toolMode: "full-read-only",
      queryTimeoutMs: 100,
    },
    identityVerifier: {
      async verify(assertion) {
        return { userId: assertion.replace(/^assertion-/, ""), jti: `jti-${assertion}` };
      },
    },
    dataSource: {
      findUser: vi.fn(async (userId: string) => currentUsers.get(userId) ?? null),
      execute: vi.fn().mockResolvedValue({ verified: true }),
      writeAudit: vi.fn().mockResolvedValue(undefined),
    },
    now: () => new Date("2026-07-20T09:00:00.000Z"),
  };
}

function call(toolName: string, args: Record<string, unknown>, user: McpUser, requestId: string) {
  return new Request("https://mcp.example.com/api/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: "Bearer service-secret",
      "content-type": "application/json",
      host: "mcp.example.com",
      "x-dachuan-request-id": requestId,
      "x-dachuan-user-assertion": `assertion-${user.id}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
}

describe("FULL_READ_ONLY 21-tool trusted identity matrix", () => {
  it("defines all 21 business tools against the five real database roles", () => {
    expect(MCP_TOOL_NAMES).toHaveLength(21);
    expect(Object.keys(MCP_TOOL_ROLE_MATRIX).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    for (const toolName of MCP_TOOL_NAMES) {
      expect(MCP_TOOL_ROLE_MATRIX[toolName].length).toBeGreaterThan(0);
      expect(MCP_TOOL_ROLE_MATRIX[toolName].every((role) => roles.includes(role))).toBe(true);
    }
    expect(MCP_TOOL_ROLE_MATRIX).toMatchObject({
      crm_customers_list: ["SUPER_ADMIN", "SALES", "FOREIGN_TRADE"],
      crm_products_list: ["SUPER_ADMIN", "SALES", "FOREIGN_TRADE"],
      crm_contracts_list: ["SUPER_ADMIN", "SALES", "FOREIGN_TRADE"],
      crm_shipments_list: ["SUPER_ADMIN", "SALES", "FOREIGN_TRADE"],
      erp_suppliers_list: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
      erp_supplier_get: ["SUPER_ADMIN", "PURCHASE"],
      erp_purchase_orders_list: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
      erp_inventory_list: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
      erp_stock_documents_list: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
      erp_stock_movements_list: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
      erp_boms_list: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
      erp_bom_get: ["SUPER_ADMIN"],
      erp_production_orders_list: ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
      erp_kit_check: ["SUPER_ADMIN"],
    });
  });

  it("executes the complete five-role permission matrix for every business tool", async () => {
    for (const [index, toolName] of MCP_TOOL_NAMES.entries()) {
      const currentUsers = new Map<string, McpUser>(roles.map((role) => [users[role].id, users[role]]));
      const deps = dependencies(currentUsers);
      const handler = createMcpRequestHandler(deps);
      for (const role of roles) {
        vi.mocked(deps.dataSource.execute).mockClear();
        const response = await handler(call(toolName, validArguments[toolName], users[role], `matrix-${index}-${role.toLowerCase()}`));
        const result = (await response.json()).result;
        if (MCP_TOOL_ROLE_MATRIX[toolName].includes(role)) {
          expect(result?.isError, `${toolName}/${role}`).not.toBe(true);
          expect(deps.dataSource.execute, `${toolName}/${role}`).toHaveBeenCalledOnce();
        } else {
          expect(result, `${toolName}/${role}`).toMatchObject({
            isError: true,
            structuredContent: { error: { code: "FORBIDDEN" } },
          });
          expect(deps.dataSource.execute, `${toolName}/${role}`).not.toHaveBeenCalled();
        }
      }
    }
  });

  it("rejects every trusted identity field as an unknown argument for every business tool", async () => {
    const forgedIdentity = {
      userId: "forged-user",
      role: "SUPER_ADMIN",
      region: "全国",
      territories: [{ province: "任意", cities: [] }],
      viewScope: "ALL",
    };
    for (const [index, toolName] of MCP_TOOL_NAMES.entries()) {
      const role = MCP_TOOL_ROLE_MATRIX[toolName][0];
      const currentUsers = new Map([[users[role].id, users[role]]]);
      const deps = dependencies(currentUsers);
      const response = await createMcpRequestHandler(deps)(call(
        toolName,
        { ...validArguments[toolName], ...forgedIdentity },
        users[role],
        `matrix-forged-${index}`,
      ));
      expect((await response.json()).result, toolName).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "INVALID_ARGUMENT" } },
      });
      expect(deps.dataSource.execute, toolName).not.toHaveBeenCalled();
    }
  });

  it("enforces pagination, search and bounded date ranges before Prisma execution", async () => {
    const admin = users.SUPER_ADMIN;
    const invalidArguments = [
      { pageSize: 101 },
      { search: "x".repeat(101) },
      { dateStart: "2026-01-01" },
      { dateStart: "2025-01-01", dateEnd: "2026-12-31" },
    ];
    for (const [index, args] of invalidArguments.entries()) {
      const deps = dependencies(new Map([[admin.id, admin]]));
      const response = await createMcpRequestHandler(deps)(call(
        "crm_customers_list",
        args,
        admin,
        `bounded-query-${index}`,
      ));
      expect((await response.json()).result).toMatchObject({
        isError: true,
        structuredContent: { error: { code: "INVALID_ARGUMENT" } },
      });
      expect(deps.dataSource.execute).not.toHaveBeenCalled();
    }
  });

  it("re-reads disablement and role changes for every business tool", async () => {
    for (const [index, toolName] of MCP_TOOL_NAMES.entries()) {
      const allowedRole = MCP_TOOL_ROLE_MATRIX[toolName][0];
      const forbiddenRole = roles.find((role) => !MCP_TOOL_ROLE_MATRIX[toolName].includes(role))!;
      const identity = { ...users[allowedRole], id: `dynamic-user-${index}` };
      const currentUsers = new Map([[identity.id, identity]]);
      const deps = dependencies(currentUsers);
      const handler = createMcpRequestHandler(deps);

      const allowed = await handler(call(toolName, validArguments[toolName], identity, `dynamic-before-${index}`));
      expect((await allowed.json()).result.isError, toolName).not.toBe(true);

      currentUsers.set(identity.id, { ...identity, role: forbiddenRole });
      const roleChanged = await handler(call(toolName, validArguments[toolName], identity, `dynamic-role-${index}`));
      expect((await roleChanged.json()).result, toolName).toMatchObject({ isError: true, structuredContent: { error: { code: "FORBIDDEN" } } });

      currentUsers.set(identity.id, { ...identity, isActive: false });
      const disabled = await handler(call(toolName, validArguments[toolName], identity, `dynamic-disabled-${index}`));
      expect(disabled.status, toolName).toBe(403);
    }
  });
});

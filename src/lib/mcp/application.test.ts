import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it, vi } from "vitest";
import { createMcpRequestHandler, type McpApplicationDependencies } from "@/lib/mcp/application";

const user = {
  id: "user-1",
  name: "测试管理员",
  email: "admin@example.com",
  role: "SUPER_ADMIN" as const,
  region: "全国",
  territories: [],
  viewScope: "ALL",
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createDependencies(): McpApplicationDependencies {
  return {
    config: {
      apiKeys: [{ name: "fastgpt-test", keyHash: sha256("test-secret") }],
      rejectedAuditUserId: "audit-user-1",
      allowedHosts: ["mcp.example.com"],
      allowedOrigins: [],
      legacyUserBindingEnabled: false,
      toolMode: "full-read-only",
      queryTimeoutMs: 100,
    },
    identityVerifier: { verify: vi.fn().mockResolvedValue({ userId: user.id, jti: "jti-1" }) },
    dataSource: {
      findUser: vi.fn().mockResolvedValue(user),
      execute: vi.fn(),
      writeAudit: vi.fn().mockResolvedValue(undefined),
    },
    now: () => new Date("2026-07-17T08:00:00.000Z"),
  };
}

function mcpRequest(body: unknown, token = "test-secret") {
  return new Request("https://mcp.example.com/api/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      host: "mcp.example.com",
      "x-dachuan-request-id": "request-1",
      "x-dachuan-user-assertion": "assertion-1",
    },
    body: JSON.stringify(body),
  });
}

describe("DachuanPro MCP request handler", () => {
  it("authenticates an API key, completes MCP initialization, and audits the call", async () => {
    const dependencies = createDependencies();
    const handle = createMcpRequestHandler(dependencies);

    const response = await handle(mcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "FastGPT-MCP-client", version: "1.0.0" },
      },
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.serverInfo).toMatchObject({
      name: "dachuanpro-crm-erp",
      version: "1.0.0",
    });
    expect(dependencies.dataSource.findUser).not.toHaveBeenCalled();
    expect(dependencies.dataSource.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
      userId: "audit-user-1",
      apiKeyName: "fastgpt-test",
      method: "initialize",
      success: true,
    }));
  });

  it("publishes the complete read-only CRM and ERP tool catalog", async () => {
    const dependencies = createDependencies();
    const handle = createMcpRequestHandler(dependencies);

    const response = await handle(mcpRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "dachuan_identity_who_am_i",
      "crm_customers_list",
      "crm_customer_get",
      "crm_customer_follows_list",
      "crm_products_list",
      "crm_product_get",
      "crm_contracts_list",
      "crm_contract_get",
      "crm_shipments_list",
      "crm_shipment_get",
      "erp_suppliers_list",
      "erp_supplier_get",
      "erp_purchase_orders_list",
      "erp_purchase_order_get",
      "erp_inventory_list",
      "erp_stock_documents_list",
      "erp_stock_movements_list",
      "erp_boms_list",
      "erp_bom_get",
      "erp_production_orders_list",
      "erp_production_order_get",
      "erp_kit_check",
    ]);
    expect(payload.result.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "erp_kit_check",
        annotations: expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
      }),
    ]));
    expect(dependencies.dataSource.execute).not.toHaveBeenCalled();
  });

  it("returns the uniform FastGPT-friendly envelope for a tool call", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.dataSource.execute).mockResolvedValue({
      items: [{ id: "customer-1", companyName: "测试客户" }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const handle = createMcpRequestHandler(dependencies);

    const response = await handle(mcpRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "crm_customers_list",
        arguments: { page: 1, pageSize: 20, search: "测试" },
      },
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.structuredContent).toEqual({
      ok: true,
      data: {
        items: [{ id: "customer-1", companyName: "测试客户" }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      meta: {
        requestId: "request-1",
        tool: "crm_customers_list",
        generatedAt: "2026-07-17T08:00:00.000Z",
      },
      error: null,
    });
    expect(payload.result.content[0]).toMatchObject({ type: "text" });
    expect(dependencies.dataSource.execute).toHaveBeenCalledWith(
      "crm_customers_list",
      { page: 1, pageSize: 20, search: "测试" },
      user,
    );
    expect(dependencies.dataSource.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      method: "tools/call",
      toolName: "crm_customers_list",
      success: true,
    }));
  });

  it("rejects an invalid API key before any CRM or ERP query", async () => {
    const dependencies = createDependencies();
    const handle = createMcpRequestHandler(dependencies);

    const response = await handle(mcpRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/list",
      params: {},
    }, "wrong-secret"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: -32001, message: "Invalid MCP API key" },
    });
    expect(dependencies.dataSource.findUser).not.toHaveBeenCalled();
    expect(dependencies.dataSource.execute).not.toHaveBeenCalled();
    expect(dependencies.dataSource.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      userId: "audit-user-1",
      apiKeyName: "[key-rejected]",
      success: false,
      statusCode: 401,
    }));
  });

  it("fails closed when an authenticated call cannot be written to the audit log", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.dataSource.writeAudit).mockRejectedValue(new Error("database unavailable"));
    const handle = createMcpRequestHandler(dependencies);

    const response = await handle(mcpRequest({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {} }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { message: "MCP audit log is unavailable" } });
  });

  it("works through the same Streamable HTTP SDK client used by FastGPT 4.15.1", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.dataSource.execute).mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    const handle = createMcpRequestHandler(dependencies);
    const transport = new StreamableHTTPClientTransport(new URL("https://mcp.example.com/api/mcp"), {
      requestInit: { headers: { authorization: "Bearer test-secret" } },
      fetch: async (input, init) => {
        const original = new Request(input, init);
        const headers = new Headers(original.headers);
        headers.set("host", "mcp.example.com");
        headers.set("x-dachuan-request-id", `sdk-request-${original.method}-${Date.now()}`);
        headers.set("x-dachuan-user-assertion", "assertion-1");
        return handle(new Request(original, { headers }));
      },
    });
    const client = new Client({ name: "FastGPT-MCP-client", version: "4.15.1" }, { capabilities: {} });

    await client.connect(transport);
    const catalog = await client.listTools();
    const result = await client.callTool({ name: "crm_customers_list", arguments: { page: 1, pageSize: 20 } });
    await client.close();

    expect(catalog.tools).toHaveLength(22);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: true, meta: { tool: "crm_customers_list" } });
  });

  it("normalizes SDK argument-validation failures into the uniform tool envelope", async () => {
    const dependencies = createDependencies();
    const handle = createMcpRequestHandler(dependencies);

    const response = await handle(mcpRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "crm_customers_list", arguments: { page: 0, pageSize: 1000 } },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        data: null,
        meta: { requestId: "request-1", tool: "crm_customers_list" },
        error: { code: "INVALID_ARGUMENT", message: "工具参数无效或工具不存在" },
      },
    });
    expect(dependencies.dataSource.execute).not.toHaveBeenCalled();
    expect(dependencies.dataSource.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("limits application wait time and reports a query timeout without claiming SQL cancellation", async () => {
    const dependencies = createDependencies();
    dependencies.config.queryTimeoutMs = 10;
    vi.mocked(dependencies.dataSource.execute).mockImplementation(() => new Promise(() => undefined));
    const response = await createMcpRequestHandler(dependencies)(mcpRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "crm_customers_list", arguments: {} },
    }));
    const payload = await response.json();

    expect(payload.result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "QUERY_TIMEOUT" } },
    });
    expect(dependencies.dataSource.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

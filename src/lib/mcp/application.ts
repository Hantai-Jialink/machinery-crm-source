import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpToolErrorResult, McpToolError, registerMcpTools } from "@/lib/mcp/tools";

export type McpRole = "SUPER_ADMIN" | "SALES" | "FOREIGN_TRADE" | "PURCHASE" | "WAREHOUSE";

export type McpUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: McpRole;
  region: string;
  territories: Array<{ province: string; cities: string[] }>;
  viewScope: string;
};

export type McpApiKeyConfig = {
  name: string;
  userId: string;
  keyHash: string;
};

export type McpApplicationConfig = {
  apiKeys: McpApiKeyConfig[];
  rejectedAuditUserId: string;
  allowedHosts: string[];
  allowedOrigins: string[];
};

export type McpAuditInput = {
  requestId: string;
  userId: string;
  apiKeyName: string;
  method: string;
  toolName?: string;
  arguments?: unknown;
  success: boolean;
  statusCode: number;
  durationMs: number;
  createdAt: Date;
};

export type McpDataSource = {
  findActiveUser(userId: string): Promise<McpUser | null>;
  execute(toolName: string, args: Record<string, unknown>, user: McpUser): Promise<unknown>;
  writeAudit(input: McpAuditInput): Promise<void>;
};

export type McpApplicationDependencies = {
  config: McpApplicationConfig;
  dataSource: McpDataSource;
  now?: () => Date;
  createRequestId?: () => string;
};

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: unknown;
  };
};

function jsonResponse(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function jsonRpcError(status: number, code: number, message: string, id: JsonRpcRequest["id"] = null) {
  return jsonResponse(status, {
    jsonrpc: "2.0",
    error: { code, message },
    id,
  });
}

function normalizeHash(value: string) {
  return value.trim().toLowerCase().replace(/^sha256:/, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function findApiKey(authorization: string | null, entries: McpApiKeyConfig[]) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const presented = sha256(match[1]);
  return entries.find((entry) => {
    const normalized = normalizeHash(entry.keyHash);
    if (!/^[a-f0-9]{64}$/.test(normalized)) return false;
    return timingSafeEqual(presented, Buffer.from(normalized, "hex"));
  }) ?? null;
}

function normalizeHeaderValue(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function requestHost(request: Request) {
  return normalizeHeaderValue(request.headers.get("x-forwarded-host") || request.headers.get("host") || "");
}

function isAllowedRequestSource(request: Request, config: McpApplicationConfig) {
  const allowedHosts = config.allowedHosts.map(normalizeHeaderValue);
  if (allowedHosts.length === 0 || !allowedHosts.includes(requestHost(request))) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  return config.allowedOrigins.map(normalizeHeaderValue).includes(normalizeHeaderValue(origin));
}

async function readJsonRpcRequest(request: Request): Promise<JsonRpcRequest> {
  try {
    return await request.clone().json() as JsonRpcRequest;
  } catch {
    return {};
  }
}

function responseSucceeded(status: number, payload: unknown) {
  if (status < 200 || status >= 300) return false;
  if (!payload || typeof payload !== "object") return true;
  const response = payload as { error?: unknown; result?: { isError?: boolean } };
  return !response.error && response.result?.isError !== true;
}

function normalizeToolProtocolError(
  response: Response,
  payload: unknown,
  rpcRequest: JsonRpcRequest,
  requestId: string,
  generatedAt: Date,
) {
  if (rpcRequest.method !== "tools/call" || !payload || typeof payload !== "object") return { response, payload };
  const rpcPayload = payload as { error?: { code?: number }; result?: { isError?: boolean; structuredContent?: unknown } };
  const sdkToolError = rpcPayload.result?.isError === true && !rpcPayload.result.structuredContent;
  if (!rpcPayload.error && !sdkToolError) return { response, payload };
  const result = createMcpToolErrorResult(
    requestId,
    rpcRequest.params?.name || "unknown_tool",
    generatedAt,
    new McpToolError(rpcPayload.error?.code === -32602 || sdkToolError ? "INVALID_ARGUMENT" : "MCP_PROTOCOL_ERROR", "工具参数无效或工具不存在"),
  );
  const normalizedPayload = { jsonrpc: "2.0", id: rpcRequest.id ?? null, result };
  return { response: jsonResponse(200, normalizedPayload), payload: normalizedPayload };
}

export function createMcpRequestHandler(dependencies: McpApplicationDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const createRequestId = dependencies.createRequestId ?? randomUUID;

  return async function handleMcpRequest(request: Request): Promise<Response> {
    const startedAt = now();
    const requestId = createRequestId();
    const rpcRequest = await readJsonRpcRequest(request);

    const rejectWithAudit = async (status: number, code: number, message: string, apiKeyName: string) => {
      const completedAt = now();
      try {
        await dependencies.dataSource.writeAudit({
          requestId,
          userId: dependencies.config.rejectedAuditUserId,
          apiKeyName,
          method: rpcRequest.method || "unknown",
          toolName: rpcRequest.method === "tools/call" ? rpcRequest.params?.name : undefined,
          arguments: undefined,
          success: false,
          statusCode: status,
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          createdAt: completedAt,
        });
      } catch {
        return jsonRpcError(503, -32603, "MCP audit log is unavailable", rpcRequest.id);
      }
      return jsonRpcError(status, code, message, rpcRequest.id);
    };

    if (!isAllowedRequestSource(request, dependencies.config)) {
      return rejectWithAudit(403, -32003, "MCP request source is not allowed", "[source-rejected]");
    }

    const apiKey = findApiKey(request.headers.get("authorization"), dependencies.config.apiKeys);
    if (!apiKey) {
      console.warn(JSON.stringify({ event: "MCP_AUTH_REJECTED", requestId, method: rpcRequest.method || "unknown" }));
      return rejectWithAudit(401, -32001, "Invalid MCP API key", "[key-rejected]");
    }

    const user = await dependencies.dataSource.findActiveUser(apiKey.userId);
    if (!user) {
      console.warn(JSON.stringify({ event: "MCP_USER_REJECTED", requestId, apiKeyName: apiKey.name }));
      return rejectWithAudit(403, -32003, "MCP user is disabled or missing", apiKey.name);
    }

    const server = new McpServer(
      { name: "dachuanpro-crm-erp", version: "1.0.0" },
      {
        instructions: "DachuanPro CRM/ERP 只读查询服务。所有工具均受当前 API Key 所绑定用户的角色和负责范围限制。",
      },
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    registerMcpTools(server, {
      requestId,
      user,
      dataSource: dependencies.dataSource,
      now,
    });

    let response: Response;
    try {
      await server.connect(transport);
      response = await transport.handleRequest(request);
    } catch {
      response = jsonRpcError(500, -32603, "Internal MCP server error", rpcRequest.id);
    }

    let responsePayload: unknown;
    try {
      responsePayload = await response.clone().json();
    } catch {
      responsePayload = null;
    }

    ({ response, payload: responsePayload } = normalizeToolProtocolError(
      response,
      responsePayload,
      rpcRequest,
      requestId,
      now(),
    ));

    const completedAt = now();
    try {
      await dependencies.dataSource.writeAudit({
        requestId,
        userId: user.id,
        apiKeyName: apiKey.name,
        method: rpcRequest.method || "unknown",
        toolName: rpcRequest.method === "tools/call" ? rpcRequest.params?.name : undefined,
        arguments: rpcRequest.method === "tools/call" ? rpcRequest.params?.arguments : undefined,
        success: responseSucceeded(response.status, responsePayload),
        statusCode: response.status,
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        createdAt: completedAt,
      });
    } catch {
      await server.close().catch(() => undefined);
      return jsonRpcError(503, -32603, "MCP audit log is unavailable", rpcRequest.id);
    }

    await server.close().catch(() => undefined);
    return response;
  };
}

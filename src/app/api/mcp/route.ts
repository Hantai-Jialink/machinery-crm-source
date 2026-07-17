import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createMcpRequestHandler } from "@/lib/mcp/application";
import { loadMcpConfig } from "@/lib/mcp/config";
import { createPrismaMcpDataSource } from "@/lib/mcp/prisma-data-source";
import { getAgentAuthRuntime } from "@/lib/agent-auth/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataSource = createPrismaMcpDataSource(prisma);

async function handle(request: Request) {
  try {
    const agentAuth = await getAgentAuthRuntime();
    const handler = createMcpRequestHandler({
      config: loadMcpConfig(),
      dataSource,
      identityVerifier: agentAuth.tokenService,
    });
    return await handler(request);
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "MCP service is not configured" }, id: null },
      { status: 503 },
    );
  }
}

export { handle as POST, handle as GET, handle as DELETE };

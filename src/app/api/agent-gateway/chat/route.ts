import { NextResponse } from "next/server";
import { createAgentGatewayHandler } from "@/lib/agent-auth/gateway";
import { getAgentAuthRuntime } from "@/lib/agent-auth/runtime";
import { getSessionUser } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const agentAuth = await getAgentAuthRuntime();
    const handler = createAgentGatewayHandler({
      config: {
        fastGptChatUrl: agentAuth.config.fastGptChatUrl,
        fastGptApiKey: agentAuth.config.fastGptApiKey,
        maxRequestBytes: agentAuth.config.maxRequestBytes,
        rateLimitPerMinute: agentAuth.config.rateLimitPerMinute,
        allowedOrigins: agentAuth.config.gatewayAllowedOrigins,
      },
      tokenService: agentAuth.tokenService,
      rateLimiter: agentAuth.stateStore,
      loadLoggedInUser: async () => {
        const user = await getSessionUser();
        return user ? { id: user.id } : null;
      },
    });
    return await handler(request);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "AGENT_GATEWAY_NOT_CONFIGURED", message: "Agent 身份网关未配置" } },
      { status: 503 },
    );
  }
}

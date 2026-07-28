import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createAgentGatewayHandler } from "@/lib/agent-auth/gateway";
import { getAgentAuthRuntime } from "@/lib/agent-auth/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supportedRoles = new Set(["SUPER_ADMIN", "SALES", "FOREIGN_TRADE", "PURCHASE", "WAREHOUSE"]);

async function loadLoggedInUser(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const authSecret = process.env.AUTH_SECRET;
  if (!match || !authSecret) return null;

  try {
    const { payload } = await jwtVerify(match[1], new TextEncoder().encode(authSecret), {
      algorithms: ["HS256"],
    });
    const userId = payload.sub;
    const role = payload.role;
    if (
      !userId
      || typeof role !== "string"
      || !supportedRoles.has(role)
      || typeof payload.iat !== "number"
      || typeof payload.exp !== "number"
      || typeof payload.jti !== "string"
      || !payload.jti
    ) {
      return null;
    }
    return { id: userId, role };
  } catch {
    return null;
  }
}

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
        allowedRoles: agentAuth.config.gatewayAllowedRoles,
      },
      tokenService: agentAuth.tokenService,
      rateLimiter: agentAuth.stateStore,
      loadLoggedInUser,
    });
    return await handler(request);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "AGENT_GATEWAY_NOT_CONFIGURED", message: "Agent 身份网关未配置" } },
      { status: 503 },
    );
  }
}

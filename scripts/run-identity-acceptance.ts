import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { importJWK, SignJWT, type JWK } from "jose";
import { createAgentAuthRuntime, loadAgentAuthConfig } from "@/lib/agent-auth/config";
import {
  acceptanceLoginUsers,
  runAcceptanceLoginPreflight,
} from "./identity-acceptance-crm-login";

type RpcBody = {
  result?: {
    serverInfo?: unknown;
    tools?: Array<{ name: string }>;
    structuredContent?: {
      data?: Record<string, unknown>;
      meta?: { requestId?: string };
    };
  };
  error?: unknown;
};
type RpcResult = { status: number; body: RpcBody | null; text: string };

if (process.env.IDENTITY_ACCEPTANCE_ENV !== "isolated") {
  throw new Error("Refusing to run outside IDENTITY_ACCEPTANCE_ENV=isolated");
}
const databaseUrl = new URL(process.env.DATABASE_URL || "");
if (databaseUrl.hostname !== "mysql") throw new Error("Acceptance database must be the isolated mysql service");

const required = (name: string) => {
  const value = String(process.env[name] || "").trim();
  if (!value || value.startsWith("REPLACE_") || value.startsWith("GENERATE_")) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

const serviceKey = required("MCP_SERVICE_KEY");
const mcpUrl = required("ACCEPTANCE_MCP_URL");
const fastGptUrl = required("ACCEPTANCE_FASTGPT_URL").replace(/\/$/, "");
const crmUrl = required("ACCEPTANCE_CRM_URL").replace(/\/$/, "");
const userPassword = required("ACCEPTANCE_USER_PASSWORD");
required("AGENT_GATEWAY_FASTGPT_API_KEY");

const prisma = new PrismaClient();
const runtime = await createAgentAuthRuntime(loadAgentAuthConfig());
const transcripts: string[] = [];
const passed: string[] = [];

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function record(name: string) {
  passed.push(name);
  console.log(`[PASS] ${name}`);
}

function unwrap<T = unknown>(payload: unknown): T {
  return payload && typeof payload === "object" && "data" in payload
    ? (payload as { data: unknown }).data as T
    : payload as T;
}

async function rpc(
  method: string,
  params: Record<string, unknown>,
  options: { assertion?: string; requestId?: string; service?: string } = {},
): Promise<RpcResult> {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${options.service ?? serviceKey}`,
    "content-type": "application/json",
    "x-dachuan-request-id": options.requestId || `accept-${randomUUID()}`,
  });
  if (options.assertion) headers.set("x-dachuan-user-assertion", options.assertion);
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
  });
  const text = await response.text();
  transcripts.push(text);
  let body: RpcBody | null = null;
  try { body = JSON.parse(text) as RpcBody; } catch { /* surfaced by assertions below */ }
  return { status: response.status, body, text };
}

function toolData(result: RpcResult) {
  return result.body?.result?.structuredContent?.data;
}

const keys = JSON.parse(required("AGENT_AUTH_KEYS_JSON")) as Array<{
  kid: string;
  publicJwk: JWK;
  privateJwk?: JWK;
}>;
const activeKid = required("AGENT_AUTH_ACTIVE_KID");
const active = keys.find((entry) => entry.kid === activeKid && entry.privateJwk);
if (!active?.privateJwk) throw new Error("Active acceptance signing key is missing");
const signingKey = await importJWK(active.privateJwk, "EdDSA");

async function customToken(options: {
  userId?: string;
  issuer?: string;
  audience?: string;
  kid?: string;
  nowSeconds?: number;
}) {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const jti = `acceptance-${randomUUID()}`;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: options.kid ?? activeKid, typ: "JWT" })
    .setIssuer(options.issuer ?? required("AGENT_AUTH_ISSUER"))
    .setSubject(options.userId ?? "identity-acceptance-sales-a")
    .setAudience(options.audience ?? required("AGENT_AUTH_AUDIENCE"))
    .setIssuedAt(nowSeconds)
    .setNotBefore(nowSeconds)
    .setExpirationTime(nowSeconds + 600)
    .setJti(jti)
    .sign(signingKey);
  await runtime.stateStore.register(jti, 600);
  return { token, jti };
}

async function fastGptAdminToken() {
  const preLogin = await fetch(`${fastGptUrl}/api/support/user/account/preLogin?username=root`);
  const preLoginBody = unwrap<{ code: string }>(await preLogin.json());
  check(preLogin.ok && preLoginBody.code, "FastGPT pre-login failed");
  const login = await fetch(`${fastGptUrl}/api/support/user/account/loginByPassword`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "root",
      password: createHash("sha256").update(required("FASTGPT_ROOT_PASSWORD")).digest("hex"),
      code: preLoginBody.code,
      language: "zh-CN",
    }),
  });
  const loginBody = unwrap<{ token: string }>(await login.json());
  check(login.ok && loginBody.token, "FastGPT root login failed");
  return loginBody.token;
}

try {
  const loginPreflight = await runAcceptanceLoginPreflight({
    crmUrl,
    password: userPassword,
    users: acceptanceLoginUsers(process.env),
  });
  check(loginPreflight.diagnostics.length === 6, "CRM login preflight did not verify six users");
  const sessionA = loginPreflight.sessionsByUserId.get("identity-acceptance-sales-a");
  const sessionB = loginPreflight.sessionsByUserId.get("identity-acceptance-sales-b");
  check(sessionA && sessionB, "CRM login preflight did not return both sales sessions");
  record("six isolated CRM users complete real login and session preflight");

  const initialize = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "identity-acceptance", version: "1.0.0" },
  });
  check(initialize.status === 200 && initialize.body?.result?.serverInfo, "MCP initialize failed");
  const catalog = await rpc("tools/list", {});
  check(catalog.status === 200, "MCP tools/list failed");
  check(catalog.body?.result?.tools?.length === 1, "IDENTITY_POC must expose exactly one tool");
  check(catalog.body.result.tools[0].name === "dachuan_identity_who_am_i", "Unexpected PoC tool catalog");
  const ping = await rpc("ping", {});
  check(ping.status === 200 && ping.body?.result, "MCP ping failed");
  record("FastGPT service identity can initialize and discover IDENTITY_POC catalog");

  const noAssertion = await rpc("tools/call", {
    name: "dachuan_identity_who_am_i",
    arguments: {},
  });
  check(noAssertion.status === 400 && noAssertion.body?.error, "tools/call without assertion was not rejected");
  record("tools/call rejects missing user assertion");

  const issuedA = await runtime.tokenService.issue("identity-acceptance-sales-a");
  const issuedB = await runtime.tokenService.issue("identity-acceptance-sales-b");
  const normal = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, {
    assertion: issuedA.token,
    requestId: "accept-normal-sales-a",
  });
  check(normal.status === 200 && toolData(normal)?.userId === "identity-acceptance-sales-a", "Normal user identity failed");
  record("normal ERP user resolves from a signed assertion");

  const concurrentExpected = Array.from({ length: 48 }, (_, index) => ({
    userId: index % 2 ? "identity-acceptance-sales-b" : "identity-acceptance-sales-a",
    token: index % 2 ? issuedB.token : issuedA.token,
    requestId: `accept-concurrent-tab-${index % 6}-call-${index}`,
  }));
  const concurrent = await Promise.all(concurrentExpected.map((item) =>
    rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, {
      assertion: item.token,
      requestId: item.requestId,
    })));
  concurrent.forEach((result, index) => {
    check(toolData(result)?.userId === concurrentExpected[index].userId, `Concurrent identity mismatch at ${index}`);
    check(result.body?.result?.structuredContent?.meta?.requestId === concurrentExpected[index].requestId, `Concurrent requestId mismatch at ${index}`);
  });
  record("48 interleaved user/session/tab calls remain isolated");

  const valid = await customToken({});
  const [tamperedHeader, tamperedPayload, tamperedSignature] = valid.token.split(".");
  const tampered = `${tamperedHeader}.${tamperedPayload}.${tamperedSignature.startsWith("A") ? "B" : "A"}${tamperedSignature.slice(1)}`;
  const invalidCases = [
    { name: "tampered", token: tampered },
    { name: "expired", token: (await customToken({ nowSeconds: Math.floor(Date.now() / 1000) - 1200 })).token },
    { name: "issuer", token: (await customToken({ issuer: "http://wrong-issuer" })).token },
    { name: "audience", token: (await customToken({ audience: "wrong-audience" })).token },
    { name: "kid", token: (await customToken({ kid: "unknown-kid" })).token },
  ];
  for (const item of invalidCases) {
    const result = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, {
      assertion: item.token,
      requestId: `accept-invalid-${item.name}`,
    });
    check(result.status === 401 && result.body?.error, `${item.name} token was not rejected`);
  }
  record("tampered, expired, wrong iss/aud/kid assertions are rejected");

  const revoked = await runtime.tokenService.issue("identity-acceptance-sales-a");
  await runtime.stateStore.revoke(revoked.jti, 600);
  const revokedResult = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, {
    assertion: revoked.token,
    requestId: "accept-revoked-jti",
  });
  check(revokedResult.status === 401, "Revoked JTI was not rejected");
  record("JTI revocation takes effect immediately");

  const realtime = await runtime.tokenService.issue("identity-acceptance-sales-a");
  await prisma.user.update({
    where: { id: "identity-acceptance-sales-a" },
    data: { role: "PURCHASE", region: "实时变更区", territories: [], viewScope: "ALL" },
  });
  const changed = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, {
    assertion: realtime.token,
    requestId: "accept-role-region-changed",
  });
  check(toolData(changed)?.role === "PURCHASE" && toolData(changed)?.region === "实时变更区", "Role/region change was not read in real time");
  await prisma.user.update({ where: { id: "identity-acceptance-sales-a" }, data: { isActive: false } });
  const disabled = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, {
    assertion: realtime.token,
    requestId: "accept-user-disabled",
  });
  check(disabled.status === 403, "Disabled user was not rejected immediately");
  record("database role/region changes and disablement take effect immediately");

  await prisma.user.update({
    where: { id: "identity-acceptance-sales-a" },
    data: {
      isActive: true,
      role: "SALES",
      region: "华东",
      territories: [{ province: "山东省", cities: ["济南市"] }],
      viewScope: "TERRITORY",
    },
  });

  const fastGptToken = await fastGptAdminToken();
  const discovery = await fetch(`${fastGptUrl}/api/core/app/mcpTools/getTools`, {
    method: "POST",
    headers: { "content-type": "application/json", token: fastGptToken },
    body: JSON.stringify({
      url: mcpUrl,
      headerSecret: { Authorization: { value: `Bearer ${serviceKey}` } },
    }),
  });
  const discoveryText = await discovery.text();
  transcripts.push(discoveryText);
  const discovered = unwrap<Array<{ name?: string }>>(JSON.parse(discoveryText) as unknown);
  check(discovery.ok && Array.isArray(discovered), "FastGPT admin MCP discovery failed");
  check(discovered.some((tool) => tool.name === "dachuan_identity_who_am_i"), "FastGPT did not discover who_am_i");
  record("FastGPT 4.15.1 admin endpoint completes initialize and tools/list without a user assertion");

  const gatewayCases = Array.from({ length: 24 }, (_, index) => ({
    cookie: index % 2 === 0 ? sessionA : sessionB,
    userId: index % 2 === 0 ? "identity-acceptance-sales-a" : "identity-acceptance-sales-b",
    marker: `user-${index % 2}-tab-${index % 6}-call-${index}`,
    stream: index % 5 === 0,
  }));
  const chatResponses = await Promise.all(gatewayCases.map((item) => fetch(`${crmUrl}/api/agent-gateway/chat`, {
    method: "POST",
    headers: {
      accept: item.stream ? "text/event-stream" : "application/json",
      "content-type": "application/json",
      cookie: item.cookie,
      origin: "http://127.0.0.1:18080",
    },
    body: JSON.stringify({
      chatId: `identity-acceptance-${item.marker}-${randomUUID()}`,
      stream: item.stream,
      detail: true,
      messages: [{ role: "user", content: "调用 dachuan_identity_who_am_i，只返回当前 ERP userId。" }],
    }),
  })));
  const chatTexts = await Promise.all(chatResponses.map((response) => response.text()));
  transcripts.push(...chatTexts);
  check(chatResponses.every((response) => response.ok), "CRM Gateway to FastGPT chat failed");
  gatewayCases.forEach((item, index) => {
    const contentType = chatResponses[index].headers.get("content-type") || "";
    if (item.stream) {
      check(contentType.includes("text/event-stream"), `Streaming response ${index} is not SSE`);
      check(chatTexts[index].includes("data:") && chatTexts[index].includes("[DONE]"), `Streaming response ${index} is incomplete`);
    }
  });
  const requestIds = chatResponses.map((response) => response.headers.get("x-dachuan-request-id"));
  check(requestIds.every(Boolean) && new Set(requestIds).size === 24, "Gateway requestIds are missing or reused");
  const chatAudits = await prisma.operationLog.findMany({
    where: { entityId: { in: requestIds as string[] }, action: "MCP_CALL" },
    select: { userId: true, entityId: true, afterData: true },
  });
  gatewayCases.forEach((item, index) => {
    check(chatAudits.some((audit) => audit.userId === item.userId && audit.entityId === requestIds[index]), `Full-chain identity mismatch at ${index}`);
  });
  record("24 real multi-session/tab streaming and non-streaming calls traverse Gateway, FastGPT and MCP without identity crossover");

  const audits = await prisma.operationLog.findMany({
    where: { entityId: { startsWith: "accept-" }, action: "MCP_CALL" },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { userId: true, entityId: true, afterData: true },
  });
  check(audits.some((item) => item.userId === "identity-acceptance-sales-a"), "Concrete ERP user missing from OperationLog");
  check(audits.some((item) => item.entityId === "accept-invalid-audience"), "Rejected request missing from OperationLog");
  const auditText = JSON.stringify(audits);
  const sensitiveValues = [
    serviceKey,
    issuedA.token,
    issuedB.token,
    String(active.privateJwk.d || ""),
    required("MYSQL_PASSWORD"),
    required("REDIS_PASSWORD"),
    required("ACCEPTANCE_USER_PASSWORD"),
    required("FASTGPT_ROOT_PASSWORD"),
    required("FASTGPT_ROOT_KEY"),
    required("FASTGPT_TOKEN_KEY"),
    required("FASTGPT_FILE_TOKEN_KEY"),
    required("FASTGPT_AES_KEY"),
    required("FASTGPT_INVOKE_TOKEN_SECRET"),
    required("FASTGPT_MONGO_PASSWORD"),
    required("FASTGPT_REDIS_PASSWORD"),
    required("FASTGPT_MINIO_PASSWORD"),
    required("FASTGPT_PG_PASSWORD"),
    required("AGENT_GATEWAY_FASTGPT_API_KEY"),
  ].filter((value) => value.length >= 8);
  check(sensitiveValues.every((secret) => !auditText.includes(secret)), "Sensitive value found in OperationLog");
  check(sensitiveValues.every((secret) => transcripts.every((text) => !text.includes(secret))), "Sensitive value found in tool responses");
  const dynamicSecretPattern = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
  check(!dynamicSecretPattern.test(auditText), "JWT-shaped assertion found in OperationLog");
  check(transcripts.every((text) => !dynamicSecretPattern.test(text)), "JWT-shaped assertion found in a tool or chat response");
  record("OperationLog is attributable and audit/tool outputs contain no configured secrets");

  console.log(`IDENTITY_ACCEPTANCE_RESULT=PASS (${passed.length} checks)`);
} finally {
  await prisma.user.updateMany({
    where: { id: "identity-acceptance-sales-a" },
    data: {
      isActive: true,
      role: "SALES",
      region: "华东",
      territories: [{ province: "山东省", cities: ["济南市"] }],
      viewScope: "TERRITORY",
    },
  }).catch(() => undefined);
  await prisma.$disconnect();
}

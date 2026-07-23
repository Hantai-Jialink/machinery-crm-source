import { generateKeyPairSync, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { importJWK, SignJWT, type JWK } from "jose";
import { createAgentAuthRuntime, loadAgentAuthConfig } from "@/lib/agent-auth/config";
import { crmLoginSession } from "../../../scripts/identity-acceptance-crm-login";

if (process.env.PRODUCTION_MCP_RUNTIME_CI !== "1") throw new Error("Refusing to run outside isolated CI");
const required = (name: string) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const adminUrl = new URL(required("ACCEPTANCE_ADMIN_DATABASE_URL"));
if (adminUrl.hostname !== "mysql" || adminUrl.pathname !== "/dachuan_identity_acceptance") {
  throw new Error("Acceptance database is not isolated");
}

const runtime = await createAgentAuthRuntime(loadAgentAuthConfig());
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
const mcpUrl = required("ACCEPTANCE_MCP_URL");
const crmUrl = required("ACCEPTANCE_CRM_URL");
const serviceKey = required("MCP_SERVICE_KEY");
const requestIds: string[] = [];

type RpcResult = { status: number; body: any; text: string };
async function rpc(method: string, params: Record<string, unknown>, assertion?: string, requestId = `runtime-${randomUUID()}`): Promise<RpcResult> {
  requestIds.push(requestId);
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
    "x-dachuan-request-id": requestId,
  });
  if (assertion) headers.set("x-dachuan-user-assertion", assertion);
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
  });
  const text = await response.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* assertions below report the raw status */ }
  return { status: response.status, body, text };
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const data = (result: RpcResult) => result.body?.result?.structuredContent?.data;

async function issue(userId = "identity-acceptance-admin", role: "SUPER_ADMIN" | "SALES" = "SUPER_ADMIN") {
  return (await runtime.tokenService.issue(userId, role)).token;
}

async function customAssertion({ audience, expired = false, future = false, wrongKey = false }: { audience?: string; expired?: boolean; future?: boolean; wrongKey?: boolean }) {
  const configured = JSON.parse(required("AGENT_AUTH_KEYS_JSON")) as Array<{ kid: string; privateJwk: JWK }>;
  const active = configured.find((entry) => entry.kid === required("AGENT_AUTH_ACTIVE_KID"));
  if (!active?.privateJwk) throw new Error("CI signing key is missing");
  const alternate = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
  const signingKey = await importJWK(wrongKey ? alternate : active.privateJwk, "EdDSA");
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = expired ? now - 900 : future ? now + 120 : now;
  const jti = `runtime-custom-${randomUUID()}`;
  const token = await new SignJWT({ role: "SUPER_ADMIN" })
    .setProtectedHeader({ alg: "EdDSA", kid: active.kid, typ: "JWT" })
    .setIssuer(required("AGENT_AUTH_ISSUER"))
    .setSubject("identity-acceptance-admin")
    .setAudience(audience || required("AGENT_AUTH_AUDIENCE"))
    .setIssuedAt(issuedAt)
    .setNotBefore(issuedAt)
    .setExpirationTime(issuedAt + 600)
    .setJti(jti)
    .sign(signingKey);
  await runtime.stateStore.register(jti, 600);
  return token;
}

try {
  const catalog = await rpc("tools/list", {});
  const toolNames = (catalog.body?.result?.tools || []).map((tool: { name: string }) => tool.name).sort();
  check(catalog.status === 200, "MCP tools/list failed");
  check(JSON.stringify(toolNames) === JSON.stringify(["crm_contract_get", "crm_customer_get", "dachuan_identity_who_am_i"]), "MCP phase-one catalog is not exact");

  const missing = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} });
  check(missing.status === 400, "Direct MCP bypass without assertion was not rejected");
  const wrongAudience = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, await customAssertion({ audience: "wrong-audience" }));
  check(wrongAudience.status === 401, "Wrong-audience assertion was not rejected");
  const wrongSignature = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, await customAssertion({ wrongKey: true }));
  check(wrongSignature.status === 401, "Wrong-signature assertion was not rejected");
  const expired = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, await customAssertion({ expired: true }));
  check(expired.status === 401, "Expired assertion was not rejected");
  const future = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, await customAssertion({ future: true }));
  check(future.status === 401, "Future-issued assertion was not rejected");

  const replayToken = await issue();
  const replayFirst = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, replayToken);
  const replaySecond = await rpc("tools/call", { name: "dachuan_identity_who_am_i", arguments: {} }, replayToken);
  check(replayFirst.status === 200 && data(replayFirst)?.role === "SUPER_ADMIN", "Valid one-time assertion failed");
  check(replaySecond.status === 401, "Replayed assertion was not rejected");

  const unauthorized = await rpc("tools/call", { name: "crm_customers_list", arguments: {} }, await issue());
  check(!unauthorized.text.includes("身份验收山东客户") && Boolean(unauthorized.body?.error || unauthorized.body?.result?.isError), "Unallowlisted tool returned business data");

  const [customer, contract] = await Promise.all([
    rpc("tools/call", { name: "crm_customer_get", arguments: { id: "identity-acceptance-customer-sales-a" } }, await issue(), "runtime-customer-read"),
    rpc("tools/call", { name: "crm_contract_get", arguments: { id: "identity-acceptance-contract-sales-a" } }, await issue(), "runtime-contract-read"),
  ]);
  check(customer.status === 200 && data(customer)?.id === "identity-acceptance-customer-sales-a", "MCP minimum-account customer query failed");
  check(contract.status === 200 && data(contract)?.id === "identity-acceptance-contract-sales-a", "MCP minimum-account contract query failed");
  const concurrent = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    return rpc(
      "tools/call",
      { name: "dachuan_identity_who_am_i", arguments: {} },
      await issue(),
      `runtime-concurrent-${String(index + 1).padStart(2, "0")}`,
    );
  }));
  check(concurrent.every((result) => result.status === 200 && data(result)?.role === "SUPER_ADMIN"), "Concurrent MCP identity calls were not isolated");

  const salesSession = await crmLoginSession({
    crmUrl,
    email: required("ACCEPTANCE_SALES_A_EMAIL"),
    password: required("ACCEPTANCE_USER_PASSWORD"),
    expectedUserId: "identity-acceptance-sales-a",
  });
  const adminSession = await crmLoginSession({
    crmUrl,
    email: required("ACCEPTANCE_ADMIN_EMAIL"),
    password: required("ACCEPTANCE_USER_PASSWORD"),
    expectedUserId: "identity-acceptance-admin",
  });
  const gatewayRequest = (cookie: string) => fetch(`${crmUrl}/api/agent-gateway/chat`, {
    method: "POST",
    headers: { cookie, origin: "http://crm-runtime.invalid", "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "runtime gate" }] }),
  });
  const salesGateway = await gatewayRequest(salesSession.cookieHeader);
  check(salesGateway.status === 403, "Non-SUPER_ADMIN gateway request was not rejected");
  const adminGateway = await gatewayRequest(adminSession.cookieHeader);
  check(adminGateway.status === 200 && (await adminGateway.text()).includes("canary-model-ok"), "SUPER_ADMIN gateway request did not reach the controlled upstream");

  const auditCount = await admin.operationLog.count({ where: { entityId: { in: requestIds } } });
  check(auditCount >= requestIds.length - 1, "Audit account did not insert the expected operation logs");
  const host = required("MCP_DATABASE_GRANT_HOST");
  const readUser = required("MCP_DATABASE_READ_USER");
  const auditUser = required("MCP_DATABASE_AUDIT_USER");
  const readGrants = JSON.stringify(await admin.$queryRawUnsafe(`SHOW GRANTS FOR '${readUser}'@'${host}'`));
  const auditGrants = JSON.stringify(await admin.$queryRawUnsafe(`SHOW GRANTS FOR '${auditUser}'@'${host}'`));
  for (const table of ["users", "customers", "customer_quotes", "follow_records", "contracts", "contract_items", "contract_payments", "shipments"]) {
    check(readGrants.includes(table), `Read grant is missing ${table}`);
  }
  check(!/INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FILE|PROCESS|GRANT OPTION/i.test(readGrants), "Read account has a forbidden privilege");
  check(/INSERT/i.test(auditGrants) && auditGrants.includes("operation_logs"), "Audit account lacks operation_logs INSERT");
  check(!/SELECT|UPDATE|DELETE|CREATE|ALTER|DROP|FILE|PROCESS|GRANT OPTION/i.test(auditGrants), "Audit account has a forbidden privilege");
  console.log("MCP_RUNTIME_SHOW_GRANTS=PASS");

  await admin.$executeRawUnsafe(`REVOKE INSERT ON dachuan_identity_acceptance.\`operation_logs\` FROM '${auditUser}'@'${host}'`);
  const failClosed = await rpc("tools/call", { name: "crm_customer_get", arguments: { id: "identity-acceptance-customer-sales-a" } }, await issue(), "runtime-audit-fail-closed");
  check(failClosed.status === 503 && failClosed.text.includes("MCP audit log is unavailable"), "Audit failure did not fail closed");
  check(!failClosed.text.includes("identity-acceptance-customer-sales-a"), "Business data escaped before the audit failure");

  console.log("MCP_RUNTIME_MINIMUM_DB_QUERY=PASS");
  console.log("MCP_RUNTIME_AUDIT_INSERT_AND_FAIL_CLOSED=PASS");
  console.log("MCP_RUNTIME_ASSERTION_GATEWAY_REPLAY_ALLOWLIST=PASS");
  console.log("MCP_RUNTIME_CONCURRENCY=PASS");
} finally {
  await runtime.stateStore.close();
  await admin.$disconnect();
}

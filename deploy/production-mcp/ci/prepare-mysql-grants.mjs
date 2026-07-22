import { PrismaClient } from "@prisma/client";

const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (required("PRODUCTION_MCP_RUNTIME_CI") !== "1") throw new Error("Refusing to modify a non-CI database");
const url = new URL(required("ACCEPTANCE_ADMIN_DATABASE_URL"));
if (url.hostname !== "mysql" || url.pathname !== "/dachuan_identity_acceptance") {
  throw new Error("Refusing to modify a non-isolated database");
}
const host = required("MCP_DATABASE_GRANT_HOST");
const readUser = required("MCP_DATABASE_READ_USER");
const auditUser = required("MCP_DATABASE_AUDIT_USER");
const readPassword = required("MCP_DATABASE_READ_PASSWORD");
const auditPassword = required("MCP_DATABASE_AUDIT_PASSWORD");
for (const value of [host, readUser, auditUser, readPassword, auditPassword]) {
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) throw new Error("Unsafe CI grant value");
}
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const readTables = ["users", "customers", "customer_quotes", "follow_records", "contracts", "contract_items", "contract_payments", "shipments"];
try {
  await prisma.$executeRawUnsafe(`DROP USER IF EXISTS '${readUser}'@'${host}'`);
  await prisma.$executeRawUnsafe(`DROP USER IF EXISTS '${auditUser}'@'${host}'`);
  await prisma.$executeRawUnsafe(`CREATE USER '${readUser}'@'${host}' IDENTIFIED BY '${readPassword}'`);
  await prisma.$executeRawUnsafe(`CREATE USER '${auditUser}'@'${host}' IDENTIFIED BY '${auditPassword}'`);
  for (const table of readTables) {
    await prisma.$executeRawUnsafe(`GRANT SELECT ON dachuan_identity_acceptance.\`${table}\` TO '${readUser}'@'${host}'`);
  }
  await prisma.$executeRawUnsafe(`GRANT INSERT ON dachuan_identity_acceptance.\`operation_logs\` TO '${auditUser}'@'${host}'`);
  console.log("MCP_RUNTIME_MINIMUM_GRANTS_PREPARED=PASS");
} finally {
  await prisma.$disconnect();
}

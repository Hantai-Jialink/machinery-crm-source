import bcryptjs from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";

const databaseUrl = new URL(process.env.DATABASE_URL || "");
if (
  process.env.IDENTITY_ACCEPTANCE_ENV !== "isolated"
  || process.env.COMPOSE_PROJECT_NAME !== "dachuan-identity-acceptance"
  || databaseUrl.hostname !== "mysql"
  || databaseUrl.pathname !== "/dachuan_identity_acceptance"
) {
  throw new Error("Refusing to seed: identity acceptance fixtures require the isolated mysql service");
}

const password = String(process.env.ACCEPTANCE_USER_PASSWORD || "");
if (password.length < 16) throw new Error("ACCEPTANCE_USER_PASSWORD must contain at least 16 characters");

const prisma = new PrismaClient();
const passwordHash = await bcryptjs.hash(password, 12);

const fixtures: Array<{
  id: string;
  email: string;
  name: string;
  role: Role;
  region: string;
  territories: Array<{ province: string; cities: string[] }>;
  viewScope: string;
}> = [
  {
    id: "identity-acceptance-audit",
    email: "accept-audit@dachuan.invalid",
    name: "身份验收审计用户",
    role: "SUPER_ADMIN",
    region: "验收环境",
    territories: [],
    viewScope: "ALL",
  },
  {
    id: "identity-acceptance-sales-a",
    email: process.env.ACCEPTANCE_SALES_A_EMAIL || "accept-sales-a@dachuan.invalid",
    name: "身份验收销售甲",
    role: "SALES",
    region: "华东",
    territories: [{ province: "山东省", cities: ["济南市"] }],
    viewScope: "TERRITORY",
  },
  {
    id: "identity-acceptance-sales-b",
    email: process.env.ACCEPTANCE_SALES_B_EMAIL || "accept-sales-b@dachuan.invalid",
    name: "身份验收销售乙",
    role: "FOREIGN_TRADE",
    region: "海外",
    territories: [{ province: "海外", cities: [] }],
    viewScope: "TERRITORY",
  },
  {
    id: "identity-acceptance-purchase",
    email: process.env.ACCEPTANCE_PURCHASE_EMAIL || "accept-purchase@dachuan.invalid",
    name: "身份验收采购",
    role: "PURCHASE",
    region: "总部",
    territories: [],
    viewScope: "ALL",
  },
  {
    id: "identity-acceptance-warehouse",
    email: process.env.ACCEPTANCE_WAREHOUSE_EMAIL || "accept-warehouse@dachuan.invalid",
    name: "身份验收仓库",
    role: "WAREHOUSE",
    region: "总部",
    territories: [],
    viewScope: "ALL",
  },
  {
    id: "identity-acceptance-admin",
    email: process.env.ACCEPTANCE_ADMIN_EMAIL || "accept-admin@dachuan.invalid",
    name: "身份验收管理员",
    role: "SUPER_ADMIN",
    region: "总部",
    territories: [],
    viewScope: "ALL",
  },
];

try {
  for (const fixture of fixtures) {
    await prisma.user.upsert({
      where: { id: fixture.id },
      create: { ...fixture, password: passwordHash, isActive: true },
      update: {
        name: fixture.name,
        password: passwordHash,
        role: fixture.role,
        region: fixture.region,
        territories: fixture.territories,
        viewScope: fixture.viewScope,
        isActive: true,
      },
    });
  }
  console.log(`Seeded ${fixtures.length} isolated identity acceptance users`);
} finally {
  await prisma.$disconnect();
}

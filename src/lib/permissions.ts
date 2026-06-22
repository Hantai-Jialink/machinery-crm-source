import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

// 用户负责的省/市范围。cities 为空数组 = 整省;否则仅这些市。
export type Territory = { province: string; cities: string[] };

export type SessionUser = {
  id: string;
  role: "SUPER_ADMIN" | "SALES" | "FOREIGN_TRADE";
  region: string; // 旧字段,保留兼容,隔离已不再使用
  territories: Territory[]; // 负责的省/市
  viewScope: string; // "TERRITORY"(按分区) | "ALL"(全区域,看全部含外贸)
  name?: string | null;
  email?: string | null;
};

// 把存储的 territories(可能是 JSON 字符串或数组)安全解析成 Territory[]
export function parseTerritories(raw: any): Territory[] {
  if (!raw) return [];
  let arr: any = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((t) => t && typeof t.province === "string")
    .map((t) => ({
      province: String(t.province),
      cities: Array.isArray(t.cities)
        ? t.cities.filter((c: any) => typeof c === "string")
        : [],
    }));
}

// 始终从数据库读取最新的角色/分区,避免旧的登录令牌导致权限不及时生效(安全考量)
async function loadSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const sid = (session?.user as any)?.id;
  if (!sid) return null;
  const u = await prisma.user.findUnique({
    where: { id: sid },
    select: {
      id: true,
      role: true,
      region: true,
      territories: true,
      viewScope: true,
      name: true,
      email: true,
      isActive: true,
    },
  });
  if (!u || !u.isActive) return null;
  return {
    id: u.id,
    role: u.role as SessionUser["role"],
    region: u.region,
    territories: parseTerritories((u as any).territories),
    viewScope: (u as any).viewScope || "TERRITORY",
    name: u.name,
    email: u.email,
  };
}

/** 获取当前登录用户的 Session,未登录则重定向到 /login */
export async function requireAuth(): Promise<SessionUser> {
  const user = await loadSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** 获取当前登录用户(API 路由使用),未登录返回 null */
export async function getSessionUser(): Promise<SessionUser | null> {
  return loadSessionUser();
}

/** 是否超级管理员 */
export function isSuperAdmin(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/** 是否可以看到全部数据(超级管理员 或 全区域)——含外贸客户 */
export function canSeeAllData(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.viewScope === "ALL";
}

/** 某个(省, 市)是否落在用户负责范围内 */
export function matchesTerritory(
  territories: Territory[],
  province?: string | null,
  city?: string | null
): boolean {
  if (!province) return false;
  for (const t of territories) {
    if (t.province !== province) continue;
    if (!t.cities || t.cities.length === 0) return true; // 整省
    if (city && t.cities.includes(city)) return true;
  }
  return false;
}

/**
 * 仅返回「客户隔离条件」(不含软删除),可嵌入到以客户为关联的查询里(如发货按 contract.customer 过滤)。
 * - 超管/全区域:返回 {} (不限制)
 * - 国内销售:business 线 + 省市范围;无范围则匹配不到任何记录
 */
export function customerIsolationWhere(user: SessionUser): any {
  if (canSeeAllData(user)) return {};
  const out: any = { businessLine: "国内销售" };
  const territories = user.territories || [];
  if (territories.length === 0) {
    out.id = "__NO_ACCESS__";
    return out;
  }
  out.OR = territories.map((t) =>
    !t.cities || t.cities.length === 0
      ? { province: t.province }
      : { province: t.province, city: { in: t.cities } }
  );
  return out;
}

/**
 * 构建客户列表查询的 where 条件(含业务线 + 省市隔离 和 软删除过滤)
 * - 超级管理员 / 全区域:看全部(含外贸)
 * - 国内销售:只看「国内销售」业务线 且 落在自己负责省市内的客户
 * - 未分配任何省市:看不到任何客户(安全默认=拒绝)
 */
export function buildCustomerWhereClause(user: SessionUser) {
  return { deletedAt: null, ...customerIsolationWhere(user) };
}

/**
 * 判断用户是否可以访问某个具体客户(用于合同/发货/报价/跟进等以客户为中心的接口)
 * 注意:传入的 customer 必须包含 businessLine / province / city 字段
 */
export function canAccessCustomer(
  user: SessionUser,
  customer:
    | { businessLine?: string | null; province?: string | null; city?: string | null }
    | null
    | undefined
): boolean {
  if (!customer) return false;
  if (canSeeAllData(user)) return true;
  if ((customer.businessLine || "国内销售") !== "国内销售") return false; // 销售看不到外贸客户
  return matchesTerritory(user.territories, customer.province, customer.city);
}

/** 是否可以管理产品(新增/编辑/删除) */
export function canManageProducts(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/** 是否可以管理用户 */
export function canManageUsers(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/** 是否可以删除客户 */
export function canDeleteCustomer(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

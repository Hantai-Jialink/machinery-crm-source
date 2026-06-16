import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export type SessionUser = {
  id: string;
  role: "SUPER_ADMIN" | "SALES" | "FOREIGN_TRADE";
  region: string;
  name?: string | null;
  email?: string | null;
};

/**
 * 获取当前登录用户的 Session，未登录则重定向到 /login
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user as SessionUser;
}

/**
 * 获取当前登录用户（API 路由使用），未登录返回 null
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  return session.user as SessionUser;
}

/**
 * 检查用户是否为超级管理员
 */
export function isSuperAdmin(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/**
 * 获取用户可访问的区域列表
 * 超级管理员可访问所有区域
 * 普通销售/外贸只能访问自己的区域
 */
export function getAccessibleRegions(user: SessionUser): string[] | null {
  if (user.role === "SUPER_ADMIN") {
    return null; // null 表示不限制
  }
  return [user.region];
}

/**
 * 检查用户是否有权限访问指定区域的客户
 */
export function canAccessRegion(user: SessionUser, region: string): boolean {
  if (user.role === "SUPER_ADMIN") {
    return true;
  }
  return user.region === region;
}

/**
 * 构建客户查询的 where 条件（含区域隔离和软删除过滤）
 */
export function buildCustomerWhereClause(user: SessionUser) {
  const where: any = {
    deletedAt: null, // 排除软删除
  };

  if (user.role !== "SUPER_ADMIN") {
    where.region = user.region;
  }

  return where;
}

/**
 * 检查用户是否可以管理产品（新增/编辑/删除）
 */
export function canManageProducts(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/**
 * 检查用户是否可以管理用户
 */
export function canManageUsers(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

/**
 * 检查用户是否可以删除客户
 */
export function canDeleteCustomer(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  canExecuteKitCheck as roleCanExecuteKitCheck,
  canManageBom as roleCanManageBom,
  canManageInventory as roleCanManageInventory,
  canManageMaterialMaster as roleCanManageMaterialMaster,
  canManageProductionMaterial as roleCanManageProductionMaterial,
  canManagePurchaseOrders as roleCanManagePurchaseOrders,
  canManageSuppliers as roleCanManageSuppliers,
  canPublishProductionOrder as roleCanPublishProductionOrder,
  canViewERP,
} from "@/lib/erp-roles";
import { parseTerritories, type SessionUser } from "@/lib/customer-permissions";

export type { SessionUser, Territory } from "@/lib/customer-permissions";
export {
  buildCustomerWhereClause,
  canAccessCustomer,
  canSeeAllData,
  customerIsolationWhere,
  matchesTerritory,
  parseTerritories,
} from "@/lib/customer-permissions";

// 始终从数据库读取最新角色与负责范围，避免旧令牌继续拥有已撤销权限。
async function loadSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const sessionUserId = (session?.user as any)?.id;
  if (!sessionUserId) return null;
  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
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
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    role: user.role as SessionUser["role"],
    region: user.region,
    territories: parseTerritories(user.territories),
    viewScope: user.viewScope || "TERRITORY",
    name: user.name,
    email: user.email,
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await loadSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return loadSessionUser();
}

export function isSuperAdmin(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export function canManageProducts(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export function canManageUsers(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export function canAccessERP(user: SessionUser): boolean {
  return canViewERP(user.role);
}

export function canManageSuppliers(user: SessionUser): boolean {
  return roleCanManageSuppliers(user.role);
}

export function canManagePurchaseOrders(user: SessionUser): boolean {
  return roleCanManagePurchaseOrders(user.role);
}

export function canManageInventory(user: SessionUser): boolean {
  return roleCanManageInventory(user.role);
}

export function canManageMaterialMaster(user: SessionUser): boolean {
  return roleCanManageMaterialMaster(user.role);
}

export function canManageBom(user: SessionUser): boolean {
  return roleCanManageBom(user.role);
}

export function canPublishProductionOrder(user: SessionUser): boolean {
  return roleCanPublishProductionOrder(user.role);
}

export function canExecuteKitCheck(user: SessionUser): boolean {
  return roleCanExecuteKitCheck(user.role);
}

export function canManageProductionMaterial(user: SessionUser): boolean {
  return roleCanManageProductionMaterial(user.role);
}

export function canDeleteCustomer(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN";
}

export const ERP_ROLES = ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"] as const;
export const REGION_SCOPED_ROLES = ["SALES", "FOREIGN_TRADE"] as const;

export type AppRole = (typeof ERP_ROLES)[number] | (typeof REGION_SCOPED_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: "超级管理员",
  SALES: "销售",
  FOREIGN_TRADE: "外贸业务",
  PURCHASE: "采购",
  WAREHOUSE: "仓库管理",
};

export function roleRequiresRegionScope(role: string): boolean {
  return (REGION_SCOPED_ROLES as readonly string[]).includes(role);
}

export function canViewERP(role: string): boolean {
  return (ERP_ROLES as readonly string[]).includes(role);
}

export function canManageSuppliers(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "PURCHASE";
}

export function canManagePurchaseOrders(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "PURCHASE";
}

export function canManageInventory(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "WAREHOUSE";
}

export function canManageBom(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export function canManageMaterialMaster(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export function canPublishProductionOrder(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export function canExecuteKitCheck(role: string): boolean {
  return role === "SUPER_ADMIN";
}

export function canManageProductionMaterial(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "WAREHOUSE";
}

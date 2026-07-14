import { describe, expect, it } from "vitest";
import {
  canManageBom,
  canManageInventory,
  canManagePurchaseOrders,
  canManageSuppliers,
  canPublishProductionOrder,
  canViewERP,
  customerBusinessLineForRole,
  roleRequiresRegionScope,
} from "@/lib/erp-roles";

describe("ERP role policy", () => {
  it("only sales roles require a customer region scope", () => {
    expect(roleRequiresRegionScope("SALES")).toBe(true);
    expect(roleRequiresRegionScope("FOREIGN_TRADE")).toBe(true);
    expect(roleRequiresRegionScope("SUPER_ADMIN")).toBe(false);
    expect(roleRequiresRegionScope("PURCHASE")).toBe(false);
    expect(roleRequiresRegionScope("WAREHOUSE")).toBe(false);
  });

  it("keeps domestic sales and foreign trade on separate customer business lines", () => {
    expect(customerBusinessLineForRole("SALES")).toBe("国内销售");
    expect(customerBusinessLineForRole("FOREIGN_TRADE")).toBe("外贸");
  });

  it("keeps purchase and warehouse write capabilities separated", () => {
    expect(canViewERP("PURCHASE")).toBe(true);
    expect(canManageSuppliers("PURCHASE")).toBe(true);
    expect(canManagePurchaseOrders("PURCHASE")).toBe(true);
    expect(canManageInventory("PURCHASE")).toBe(false);
    expect(canManageBom("PURCHASE")).toBe(false);
    expect(canPublishProductionOrder("PURCHASE")).toBe(false);

    expect(canViewERP("WAREHOUSE")).toBe(true);
    expect(canManageInventory("WAREHOUSE")).toBe(true);
    expect(canManageSuppliers("WAREHOUSE")).toBe(false);
    expect(canManagePurchaseOrders("WAREHOUSE")).toBe(false);
    expect(canManageBom("WAREHOUSE")).toBe(false);
    expect(canPublishProductionOrder("WAREHOUSE")).toBe(false);
  });
});

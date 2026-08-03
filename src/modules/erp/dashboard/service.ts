import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions";
import { canSeeInventoryAmount, canSeeProcurementDetails, resolveErpDashboardView } from "./permissions";
import type { DashboardSection, ErpDashboardResponse } from "./types";

const day = 24 * 60 * 60 * 1000;
const asNumber = (value: unknown) => Number(value || 0);
const section = async <T>(load: () => Promise<T>): Promise<DashboardSection<T>> => {
  try { return { data: await load() }; } catch (error) { console.error("[erp.dashboard.section]", error); return { error: "统计数据暂时不可用" }; }
};

export async function getErpDashboard(user: SessionUser): Promise<ErpDashboardResponse> {
  const roleView = resolveErpDashboardView(user); const today = new Date(); today.setHours(0, 0, 0, 0); const inSevenDays = new Date(today.getTime() + 7 * day); const staleBefore = new Date(today.getTime() - 90 * day);
  const production = section(async () => {
    const base = { deletedAt: null, isCurrent: true }; const issued = { ...base, status: "ISSUED" as const };
    const [inProgress, dueSoon, overdue, pendingKitCheck, draft, changePending, cancelled, riskOrders, shortageOrders] = await Promise.all([
      prisma.productionOrder.count({ where: issued }), prisma.productionOrder.count({ where: { ...issued, OR: [{ deliveryDateSnapshot: { gte: today, lt: inSevenDays } }, { deliveryDateSnapshot: null, plannedDate: { gte: today, lt: inSevenDays } }] } }), prisma.productionOrder.count({ where: { ...issued, OR: [{ deliveryDateSnapshot: { lt: today } }, { deliveryDateSnapshot: null, plannedDate: { lt: today } }] } }), prisma.productionOrder.count({ where: { ...base, status: { not: "CANCELLED" }, OR: [{ kitCheckStatus: "NOT_CHECKED" }, { kitCheckRequired: true, kitCheckStatus: { not: "SUFFICIENT" } }] } }), prisma.productionOrder.count({ where: { ...base, status: "DRAFT" } }), prisma.productionOrder.count({ where: { ...base, status: "CHANGE_PENDING" } }), prisma.productionOrder.count({ where: { ...base, status: "CANCELLED" } }), prisma.productionOrder.findMany({ where: { ...issued, OR: [{ deliveryDateSnapshot: { lt: inSevenDays } }, { deliveryDateSnapshot: null, plannedDate: { lt: inSevenDays } }] }, select: { id: true, orderNo: true, productModelSnapshot: true, productNameSnapshot: true, plannedDate: true, kitCheckStatus: true }, orderBy: { plannedDate: "asc" }, take: 10 }), prisma.productionOrder.findMany({ where: { ...base, status: { not: "CANCELLED" }, kitCheckStatus: "SHORTAGE" }, select: { id: true, orderNo: true, productModelSnapshot: true, plannedDate: true, kitCheckStatus: true }, orderBy: { plannedDate: "asc" }, take: 10 })
    ]);
    return { kpis: { inProgress, dueSoon, overdue, pendingKitCheck }, statusDistribution: { DRAFT: draft, ISSUED: inProgress, CHANGE_PENDING: changePending, CANCELLED: cancelled }, riskOrders: riskOrders.map((item) => ({ id: item.id, orderNo: item.orderNo, productModel: item.productModelSnapshot, productName: item.productNameSnapshot, plannedDate: item.plannedDate, kitCheckStatus: item.kitCheckStatus })), shortageOrders: shortageOrders.map((item) => ({ id: item.id, orderNo: item.orderNo, productModel: item.productModelSnapshot, plannedDate: item.plannedDate, kitCheckStatus: item.kitCheckStatus })) };
  });
  const kitCheck = section(async () => {
    const kitBase = { deletedAt: null, isCurrent: true, status: { not: "CANCELLED" as const } }; const [sufficient, shortage, notChecked] = await Promise.all([prisma.productionOrder.count({ where: { ...kitBase, kitCheckStatus: "SUFFICIENT" } }), prisma.productionOrder.count({ where: { ...kitBase, kitCheckStatus: "SHORTAGE" } }), prisma.productionOrder.count({ where: { ...kitBase, kitCheckStatus: "NOT_CHECKED" } })]);
    const total = sufficient + shortage + notChecked; return { total, sufficient, shortage, notChecked, rate: total ? Number(((sufficient / total) * 100).toFixed(1)) : null, formula: "完全齐套工单 ÷ 已纳入统计的未删除当前工单 × 100%" };
  });
  const procurement = section(async () => {
    const orderWhere: Prisma.PurchaseOrderWhereInput = roleView === "WAREHOUSE" ? { deletedAt: null, status: { in: ["ORDERED", "PARTIAL_RECEIVED"] } } : { deletedAt: null };
    const [demands, orders, delayedItems] = await Promise.all([prisma.purchaseDemand.count({ where: { status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_CONVERTED"] } } }), prisma.purchaseOrder.findMany({ where: orderWhere, select: { id: true, orderNo: true, status: true, expectedArrivalDate: true, supplierNameSnapshot: true }, orderBy: { createdAt: "desc" }, take: 100 }), prisma.purchaseOrderItem.count({ where: { deliveryStatus: { in: ["OVERDUE_NOT_RECEIVED", "OVERDUE_PARTIAL_RECEIVED"] } } })]);
    const items = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: { in: orders.map((order) => order.id) } }, select: { id: true, purchaseOrderId: true, materialCodeSnapshot: true, materialNameSnapshot: true, quantity: true, receivedQuantity: true, latestPromisedDate: true, deliveryStatus: true } });
    const itemsByOrder = new Map<string, typeof items>(); for (const item of items) itemsByOrder.set(item.purchaseOrderId, [...(itemsByOrder.get(item.purchaseOrderId) || []), item]);
    const visibleOrders = orders.map((order) => ({ id: order.id, orderNo: order.orderNo, status: order.status, expectedArrivalDate: order.expectedArrivalDate, supplier: order.supplierNameSnapshot, items: (itemsByOrder.get(order.id) || []).map((item) => ({ id: item.id, materialCode: item.materialCodeSnapshot, materialName: item.materialNameSnapshot, pendingQuantity: asNumber(item.quantity) - asNumber(item.receivedQuantity), latestPromisedDate: item.latestPromisedDate, deliveryStatus: item.deliveryStatus })) }));
    return { pendingDemands: demands, delayedItems, orders: visibleOrders, mode: canSeeProcurementDetails(roleView) ? "DETAIL" : "RECEIVING_ONLY" };
  });
  const inventory = section(async () => {
    const rows: any[] = roleView === "PURCHASE" ? await prisma.inventory.findMany({ select: { quantity: true, material: { select: { id: true, code: true, name: true, safetyStock: true, category: { select: { warningThreshold: true } } } }, warehouse: { select: { id: true, name: true } } }, take: 1000 }) : await prisma.inventory.findMany({ select: { quantity: true, totalAmount: true, material: { select: { id: true, code: true, name: true, safetyStock: true, category: { select: { warningThreshold: true } } } }, warehouse: { select: { id: true, name: true } } }, take: 1000 });
    const alertRows = rows.filter((row) => { const threshold = row.material.safetyStock ?? row.material.category?.warningThreshold; return threshold !== null && threshold !== undefined && row.quantity.lte(threshold); }); const zero = rows.filter((row) => row.quantity.lte(0)); const inventoryValue = rows.reduce((sum, row) => sum + asNumber(row.totalAmount), 0);
    const [pendingChecks, staleMaterials] = await Promise.all([prisma.stockCheck.count({ where: { status: { in: ["DRAFT", "CHECKING"] } } }), prisma.material.count({ where: { deletedAt: null, inventories: { some: {} }, movements: { none: { createdAt: { gte: staleBefore } } } } })]);
    return { totalItems: rows.length, alertCount: alertRows.length, zeroCount: zero.length, ...(canSeeInventoryAmount(roleView) ? { inventoryValue } : {}), pendingChecks, staleMaterials, alerts: alertRows.slice(0, 10).map((row) => ({ materialId: row.material.id, code: row.material.code, name: row.material.name, warehouse: row.warehouse.name, quantity: row.quantity, safetyStock: row.material.safetyStock ?? row.material.category?.warningThreshold ?? null })) };
  });
  const alerts = section(async () => {
    const [pendingStockIn, pendingStockOut, recentErpVoids] = await Promise.all([prisma.purchaseOrder.count({ where: { deletedAt: null, status: { in: ["ORDERED", "PARTIAL_RECEIVED"] } } }), prisma.productionOrder.count({ where: { deletedAt: null, isCurrent: true, status: "ISSUED" } }), roleView === "ADMIN" ? prisma.operationLog.count({ where: { action: { contains: "VOID" }, entityType: { in: ["StockIn", "StockOut", "StockCheck", "PurchaseOrder"] }, createdAt: { gte: new Date(today.getTime() - 30 * day) } } }) : Promise.resolve(null)]);
    return { pendingStockIn, pendingStockOut, ...(recentErpVoids === null ? {} : { recentVoids: recentErpVoids }), note: "当前库存模型没有独立待出库或待调拨状态，不伪造该指标。" };
  });
  return { roleView, generatedAt: new Date().toISOString(), production: await production, kitCheck: await kitCheck, procurement: await procurement, inventory: await inventory, alerts: await alerts };
}

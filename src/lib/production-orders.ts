import { randomUUID } from "crypto";
import { KitCheckStatus, Prisma, ProductionOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeOperationLog } from "@/lib/sales-items";

export class ProductionOrderRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export type ProductionOrderDraftInput = {
  contractId: string | null;
  productId: string;
  quantity: Prisma.Decimal;
  bomId: string;
  configuration: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  warehouseId: string | null;
  plannedDate: Date | null;
  responsibleId: string | null;
  remark: string | null;
};

type ExpandedMaterial = {
  materialId: string;
  materialCodeSnapshot: string;
  materialNameSnapshot: string;
  materialSpecSnapshot: string | null;
  unitSnapshot: string;
  perUnitQuantity: Prisma.Decimal;
  requiredQuantity: Prisma.Decimal;
  bomVersionSnapshot: string;
  sortOrder: number;
};

export const productionOrderStatusLabels: Record<ProductionOrderStatus, string> = {
  DRAFT: "待排产",
  ISSUED: "已下达",
  CHANGE_PENDING: "变更待审批",
  CANCELLED: "已取消",
};

export function parsePositiveQuantity(value: unknown) {
  try {
    const quantity = new Prisma.Decimal(String(value ?? ""));
    return quantity.isFinite() && quantity.gt(0) ? quantity.toDecimalPlaces(2) : null;
  } catch {
    return null;
  }
}

export function parseOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function normalizeDraftInput(body: Record<string, unknown>): ProductionOrderDraftInput {
  const quantity = parsePositiveQuantity(body.quantity);
  const plannedDate = parseOptionalDate(body.plannedDate);
  if (!quantity || plannedDate === undefined) {
    throw new ProductionOrderRequestError("请填写有效的生产数量和计划日期；生产数量必须大于 0");
  }
  const productId = String(body.productId || "").trim();
  const bomId = String(body.bomId || "").trim();
  if (!productId || !bomId) {
    throw new ProductionOrderRequestError("请选择机型和生效的整机用料清单版本");
  }
  const configuration = body.configuration && typeof body.configuration === "object" && !Array.isArray(body.configuration)
    ? body.configuration as Prisma.InputJsonValue
    : Prisma.JsonNull;
  return {
    contractId: String(body.contractId || "").trim() || null,
    productId,
    quantity,
    bomId,
    configuration,
    warehouseId: String(body.warehouseId || "").trim() || null,
    plannedDate,
    responsibleId: String(body.responsibleId || "").trim() || null,
    remark: String(body.remark || "").trim() || null,
  };
}

export async function resolveDefaultWarehouse(tx: Prisma.TransactionClient) {
  const warehouse = await tx.warehouse.findFirst({ where: { name: "Dachuan", isActive: true } });
  if (!warehouse) throw new ProductionOrderRequestError("未找到名称为 Dachuan 的启用仓库，请在工单中手动选择其他仓库");
  return warehouse;
}

async function loadDraftReferences(tx: Prisma.TransactionClient, input: ProductionOrderDraftInput) {
  const product = await tx.product.findFirst({
    where: { id: input.productId, isActive: true },
    include: { translations: { where: { language: "ZH" }, take: 1 } },
  });
  if (!product) throw new ProductionOrderRequestError("机型不存在或已停用", 404);
  const bom = await tx.bomHeader.findFirst({
    where: { id: input.bomId, productId: input.productId, isActive: true },
    select: { id: true, version: true },
  });
  if (!bom) throw new ProductionOrderRequestError("该机型当前无生效用料清单，请先在整机用料清单模块设置生效版本");
  const warehouse = input.warehouseId
    ? await tx.warehouse.findFirst({ where: { id: input.warehouseId, isActive: true } })
    : await resolveDefaultWarehouse(tx);
  if (!warehouse) throw new ProductionOrderRequestError("仓库不存在或已停用", 404);
  if (input.responsibleId) {
    const responsible = await tx.user.findFirst({ where: { id: input.responsibleId, isActive: true }, select: { id: true } });
    if (!responsible) throw new ProductionOrderRequestError("负责人不存在或已停用", 400);
  }
  const contract = input.contractId ? await tx.contract.findFirst({ where: { id: input.contractId, deletedAt: null }, select: { id: true, contractNo: true } }) : null;
  if (input.contractId && !contract) throw new ProductionOrderRequestError("关联合同不存在或已删除", 404);
  return { product, bom, warehouse, contract };
}

export async function buildDraftData(tx: Prisma.TransactionClient, input: ProductionOrderDraftInput) {
  const { product, bom, warehouse, contract } = await loadDraftReferences(tx, input);
  return {
    orderNo: `DRAFT-${randomUUID().slice(0, 8)}`,
    contractId: contract?.id || null,
    contractNoSnapshot: contract?.contractNo || null,
    isStockOrder: !contract,
    sequenceInContract: null,
    productId: product.id,
    productModelSnapshot: product.model,
    productNameSnapshot: product.translations[0]?.name || product.model,
    quantity: input.quantity,
    bomId: bom.id,
    bomVersionSnapshot: bom.version,
    configuration: input.configuration,
    warehouseId: warehouse.id,
    plannedDate: input.plannedDate,
    responsibleId: input.responsibleId,
    remark: input.remark,
  };
}

export async function nextSequenceInContract(tx: Prisma.TransactionClient, contractId: string) {
  const last = await tx.productionOrder.findFirst({
    where: { contractId, deletedAt: null, isCurrent: true },
    orderBy: { sequenceInContract: "desc" },
    select: { sequenceInContract: true },
  });
  return (last?.sequenceInContract || 0) + 1;
}

export async function nextStockOrderNo(tx: Prisma.TransactionClient) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `MO${dateStr}-`;
  const last = await tx.productionOrder.findFirst({ where: { orderNo: { startsWith: prefix } }, orderBy: { orderNo: "desc" }, select: { orderNo: true } });
  const lastSeq = last ? parseInt(last.orderNo.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

export function issuedOrderNo(contractNo: string | null, sequence: number | null, stockOrderNo: string) {
  return contractNo && sequence ? `${contractNo}-${String(sequence).padStart(2, "0")}` : stockOrderNo;
}

export function calculateKitMaterialQuantities(plannedQuantity: Prisma.Decimal.Value, issuedQuantity: Prisma.Decimal.Value, returnedQuantity: Prisma.Decimal.Value, inventoryQuantity: Prisma.Decimal.Value) {
  const netIssuedQty = Prisma.Decimal.max(new Prisma.Decimal(issuedQuantity).sub(returnedQuantity), new Prisma.Decimal(0));
  const remainingQty = Prisma.Decimal.max(new Prisma.Decimal(plannedQuantity).sub(netIssuedQty), new Prisma.Decimal(0));
  const shortageQty = Prisma.Decimal.max(remainingQty.sub(inventoryQuantity), new Prisma.Decimal(0));
  return { netIssuedQty, remainingQty, shortageQty };
}

export async function expandBomSnapshot(
  tx: Prisma.TransactionClient,
  input: { bomId: string; productId: string; quantity: Prisma.Decimal }
): Promise<{ bomVersion: string; materials: ExpandedMaterial[] }> {
  const bom = await tx.bomHeader.findFirst({
    where: { id: input.bomId, productId: input.productId, isActive: true },
    include: { items: { include: { material: { select: { id: true, code: true, name: true, spec: true, unit: true, isActive: true, deletedAt: true } } }, orderBy: { sortOrder: "asc" } } },
  });
  if (!bom) throw new ProductionOrderRequestError("该产品当前无生效用料清单，请先在整机用料清单模块设置生效版本");
  if (bom.items.some((item) => !item.material.isActive || item.material.deletedAt)) {
    throw new ProductionOrderRequestError("整机用料清单中存在已停用或已删除的物料，请先修正用料清单");
  }
  const childrenByParent = new Map<string, typeof bom.items>();
  for (const item of bom.items) {
    if (item.parentItemId) childrenByParent.set(item.parentItemId, [...(childrenByParent.get(item.parentItemId) || []), item]);
  }
  const totals = new Map<string, { item: (typeof bom.items)[number]; quantity: Prisma.Decimal }>();
  const visit = (item: (typeof bom.items)[number], parentQuantity: Prisma.Decimal, seen: Set<string>) => {
    if (seen.has(item.id)) throw new ProductionOrderRequestError("整机用料清单存在循环层级，无法下达工单");
    const nextSeen = new Set(seen).add(item.id);
    const required = parentQuantity.mul(item.quantity);
    const previous = totals.get(item.materialId);
    totals.set(item.materialId, { item: previous?.item || item, quantity: (previous?.quantity || new Prisma.Decimal(0)).add(required) });
    for (const child of childrenByParent.get(item.id) || []) visit(child, required, nextSeen);
  };
  const roots = bom.items.filter((item) => !item.parentItemId || !bom.items.some((candidate) => candidate.id === item.parentItemId));
  for (const root of roots) visit(root, new Prisma.Decimal(1), new Set());
  if (totals.size === 0) throw new ProductionOrderRequestError("整机用料清单没有可展开的物料明细，无法下达工单");
  return {
    bomVersion: bom.version,
    materials: [...totals.values()]
      .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.item.material.code.localeCompare(b.item.material.code))
      .map(({ item, quantity }, sortOrder) => ({
        materialId: item.materialId,
        materialCodeSnapshot: item.material.code,
        materialNameSnapshot: item.material.name,
        materialSpecSnapshot: item.material.spec,
        unitSnapshot: item.material.unit,
        perUnitQuantity: quantity.toDecimalPlaces(4),
        requiredQuantity: quantity.mul(input.quantity).toDecimalPlaces(4),
        bomVersionSnapshot: bom.version,
        sortOrder,
      })),
  };
}

export async function createKitCheckResult(tx: Prisma.TransactionClient, input: { productionOrderId: string; checkedById: string }) {
  const order = await tx.productionOrder.findFirst({ where: { id: input.productionOrderId, deletedAt: null }, select: { id: true, warehouseId: true, status: true } });
  if (!order) throw new ProductionOrderRequestError("生产工单不存在", 404);
  if (order.status === "DRAFT") throw new ProductionOrderRequestError("请先下达生产工单，再执行齐套检查", 409);
  const materials = await tx.productionOrderMaterial.findMany({ where: { productionOrderId: order.id }, orderBy: { sortOrder: "asc" } });
  if (materials.length === 0) throw new ProductionOrderRequestError("生产工单缺少物料快照，无法执行齐套检查", 409);
  const materialIds = materials.map((item) => item.materialId);
  const [inventories, openPurchaseOrders, issuedDocuments, returnedDocuments] = await Promise.all([
    tx.inventory.findMany({ where: { warehouseId: order.warehouseId, materialId: { in: materialIds } }, select: { materialId: true, quantity: true } }),
    tx.purchaseOrder.findMany({ where: { deletedAt: null, status: { in: ["ORDERED", "PARTIAL_RECEIVED"] } }, select: { id: true } }),
    tx.stockOut.findMany({ where: { productionOrderId: order.id }, include: { items: true } }),
    tx.stockIn.findMany({ where: { productionOrderId: order.id }, include: { items: true } }),
  ]);
  const purchaseItems = openPurchaseOrders.length
    ? await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: { in: openPurchaseOrders.map((item) => item.id) }, materialId: { in: materialIds } }, select: { materialId: true, quantity: true, receivedQuantity: true } })
    : [];
  const availableByMaterial = new Map(inventories.map((item) => [item.materialId, new Prisma.Decimal(item.quantity)]));
  const inTransitByMaterial = new Map<string, Prisma.Decimal>();
  for (const item of purchaseItems) {
    const inTransit = new Prisma.Decimal(item.quantity).sub(item.receivedQuantity);
    inTransitByMaterial.set(item.materialId, (inTransitByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(inTransit));
  }
  const issuedByMaterial = new Map<string, Prisma.Decimal>();
  const returnedByMaterial = new Map<string, Prisma.Decimal>();
  for (const document of issuedDocuments) for (const item of document.items) issuedByMaterial.set(item.materialId, (issuedByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(item.quantity));
  for (const document of returnedDocuments) for (const item of document.items) returnedByMaterial.set(item.materialId, (returnedByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(item.quantity));
  const detail = materials.map((item) => {
    const quantities = calculateKitMaterialQuantities(item.requiredQuantity, issuedByMaterial.get(item.materialId) || new Prisma.Decimal(0), returnedByMaterial.get(item.materialId) || new Prisma.Decimal(0), availableByMaterial.get(item.materialId) || new Prisma.Decimal(0));
    const requiredQty = quantities.remainingQty;
    const availableQty = availableByMaterial.get(item.materialId) || new Prisma.Decimal(0);
    const shortageQty = quantities.shortageQty;
    return {
      materialId: item.materialId, code: item.materialCodeSnapshot, name: item.materialNameSnapshot, unit: item.unitSnapshot,
      requiredQty: requiredQty.toNumber(), availableQty: availableQty.toNumber(), shortageQty: shortageQty.toNumber(),
      inTransitQty: (inTransitByMaterial.get(item.materialId) || new Prisma.Decimal(0)).toNumber(),
    };
  });
  const shortageCount = detail.filter((item) => item.shortageQty > 0).length;
  const result = await tx.kitCheckResult.create({
    data: { productionOrderId: order.id, warehouseId: order.warehouseId, status: shortageCount ? KitCheckStatus.SHORTAGE : KitCheckStatus.SUFFICIENT, shortageCount, totalMaterials: detail.length, detail, checkedById: input.checkedById },
  });
  await writeOperationLog(tx, { userId: input.checkedById, action: "CHECK_PRODUCTION_ORDER_KIT", entityType: "ProductionOrder", entityId: order.id, afterData: { result } });
  return result;
}

export async function getProductionOrderDetail(id: string) {
  const order = await prisma.productionOrder.findFirst({ where: { id, deletedAt: null }, include: { materials: { orderBy: { sortOrder: "asc" } }, kitCheckResults: { orderBy: { createdAt: "desc" } }, changeRequests: { orderBy: { createdAt: "desc" } } } });
  if (!order) return null;
  const versionHistory: Array<{ id: string; orderNo: string; version: number; status: ProductionOrderStatus; isCurrent: boolean; createdAt: Date }> = [{ id: order.id, orderNo: order.orderNo, version: order.version, status: order.status, isCurrent: order.isCurrent, createdAt: order.createdAt }];
  let predecessorId = order.supersedesId;
  while (predecessorId) {
    const predecessor = await prisma.productionOrder.findUnique({ where: { id: predecessorId }, select: { id: true, orderNo: true, version: true, status: true, isCurrent: true, createdAt: true, supersedesId: true } });
    if (!predecessor) break;
    versionHistory.unshift({ id: predecessor.id, orderNo: predecessor.orderNo, version: predecessor.version, status: predecessor.status, isCurrent: predecessor.isCurrent, createdAt: predecessor.createdAt });
    predecessorId = predecessor.supersedesId;
  }
  let successorId = versionHistory[versionHistory.length - 1].id;
  while (successorId) {
    const successor = await prisma.productionOrder.findUnique({ where: { supersedesId: successorId }, select: { id: true, orderNo: true, version: true, status: true, isCurrent: true, createdAt: true } });
    if (!successor) break;
    versionHistory.push(successor);
    successorId = successor.id;
  }
  const [contract, product, bom, warehouse, stockOuts, stockIns, inventories] = await Promise.all([
    order.contractId ? prisma.contract.findFirst({ where: { id: order.contractId, deletedAt: null }, select: { id: true, contractNo: true } }) : null,
    prisma.product.findUnique({ where: { id: order.productId }, select: { id: true, model: true } }),
    prisma.bomHeader.findUnique({ where: { id: order.bomId }, select: { id: true, version: true, isActive: true } }),
    prisma.warehouse.findUnique({ where: { id: order.warehouseId }, select: { id: true, name: true, code: true, isActive: true } }),
    prisma.stockOut.findMany({ where: { productionOrderId: order.id }, include: { items: true }, orderBy: { createdAt: "desc" } }),
    prisma.stockIn.findMany({ where: { productionOrderId: order.id }, include: { items: true }, orderBy: { createdAt: "desc" } }),
    prisma.inventory.findMany({ where: { warehouseId: order.warehouseId, materialId: { in: order.materials.map((item) => item.materialId) } }, select: { materialId: true, quantity: true } }),
  ]);
  const issuedByMaterial = new Map<string, Prisma.Decimal>();
  const returnedByMaterial = new Map<string, Prisma.Decimal>();
  for (const document of stockOuts) for (const item of document.items) issuedByMaterial.set(item.materialId, (issuedByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(item.quantity));
  for (const document of stockIns) for (const item of document.items) returnedByMaterial.set(item.materialId, (returnedByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(item.quantity));
  const inventoryByMaterial = new Map(inventories.map((item) => [item.materialId, new Prisma.Decimal(item.quantity)]));
  const materialSummary = order.materials.map((item) => {
    const issuedQty = issuedByMaterial.get(item.materialId) || new Prisma.Decimal(0);
    const returnedQty = returnedByMaterial.get(item.materialId) || new Prisma.Decimal(0);
    const netIssuedQty = Prisma.Decimal.max(issuedQty.sub(returnedQty), new Prisma.Decimal(0));
    const remainingQty = Prisma.Decimal.max(new Prisma.Decimal(item.requiredQuantity).sub(netIssuedQty), new Prisma.Decimal(0));
    return { materialId: item.materialId, plannedQty: Number(item.requiredQuantity), issuedQty: issuedQty.toNumber(), returnedQty: returnedQty.toNumber(), netIssuedQty: netIssuedQty.toNumber(), remainingQty: remainingQty.toNumber(), inventoryQty: (inventoryByMaterial.get(item.materialId) || new Prisma.Decimal(0)).toNumber() };
  });
  return { ...order, contract, product, bom, warehouse, stockOuts, stockIns, materialSummary, versionHistory, latestKitCheckResult: order.kitCheckResults[0] || null };
}

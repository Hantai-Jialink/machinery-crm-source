import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";
import { writeOperationLog } from "@/lib/sales-items";

type ShortageLineInput = {
  materialId?: string;
  quantity?: string | number;
};

type NormalizedLine = {
  materialId: string;
  quantity: Prisma.Decimal;
};

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function parsePositiveDecimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? new Prisma.Decimal(parsed).toDecimalPlaces(2) : null;
}

function normalizeLines(rawLines: unknown): NormalizedLine[] | null {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return null;
  const lines = rawLines.map((line: ShortageLineInput) => ({
    materialId: String(line.materialId || ""),
    quantity: parsePositiveDecimal(line.quantity),
  }));
  if (lines.some((line) => !line.materialId || !line.quantity)) return null;
  if (new Set(lines.map((line) => line.materialId)).size !== lines.length) return null;
  return lines as NormalizedLine[];
}

function generateOrderNo() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PO${date}${suffix}`;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限创建采购订单" }, { status: 403 });

  const body = await request.json();
  const bomId = String(body.bomId || "");
  const productionQuantity = parsePositiveDecimal(body.productionQuantity);
  const warehouseId = body.warehouseId ? String(body.warehouseId) : "";
  const productionOrderId = body.productionOrderId ? String(body.productionOrderId) : "";
  const lines = normalizeLines(body.lines);
  if (!bomId || !productionQuantity || !lines) {
    return NextResponse.json({ error: "缺料测算来源、生产台数和有效采购明细为必填项；采购数量需大于 0，且物料不能重复" }, { status: 400 });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const [bom, warehouse, materials, productionOrder] = await Promise.all([
          tx.bomHeader.findUnique({
            where: { id: bomId },
          }),
          warehouseId
            ? tx.warehouse.findFirst({ where: { id: warehouseId, isActive: true }, select: { id: true, name: true, code: true } })
            : Promise.resolve(null),
          tx.material.findMany({
            where: { id: { in: lines.map((line) => line.materialId) }, isActive: true, deletedAt: null },
            select: { id: true, code: true, name: true, spec: true, supplierId: true, standardPrice: true },
          }),
          productionOrderId
            ? tx.productionOrder.findFirst({ where: { id: productionOrderId, deletedAt: null }, include: { kitCheckResults: { orderBy: { createdAt: "desc" }, take: 1 } } })
            : Promise.resolve(null),
        ]);
        if (!bom) throw new RequestError("整机用料清单不存在", 404);
        if (warehouseId && !warehouse) throw new RequestError("测算仓库不存在或已停用", 400);
        if (productionOrderId) {
          if (!productionOrder) throw new RequestError("生产工单不存在", 404);
          if (productionOrder.status === "DRAFT" || productionOrder.status === "CANCELLED") throw new RequestError("当前生产工单不能生成采购建议", 409);
          if (productionOrder.bomId !== bomId || productionOrder.warehouseId !== warehouseId || !new Prisma.Decimal(productionOrder.quantity).eq(productionQuantity)) {
            throw new RequestError("采购建议必须使用该生产工单的用料清单、数量和仓库", 400);
          }
          const latestCheck = productionOrder.kitCheckResults[0];
          if (!latestCheck || latestCheck.status !== "SHORTAGE" || !Array.isArray(latestCheck.detail)) throw new RequestError("请先执行工单齐套检查，且确认存在缺料后再生成采购建议", 409);
          const shortageByMaterial = new Map((latestCheck.detail as Array<{ materialId?: string; shortageQty?: number }>).map((item) => [item.materialId, Number(item.shortageQty || 0)]));
          if (lines.some((line) => line.quantity.gt(shortageByMaterial.get(line.materialId) || 0))) throw new RequestError("采购数量不能超过该工单最近一次齐套检查的缺料数量", 400);
        }
        const product = await tx.product.findUnique({
          where: { id: bom.productId },
          select: { model: true, category: true },
        });

        const materialById = new Map(materials.map((material) => [material.id, material]));
        if (materialById.size !== lines.length) throw new RequestError("采购明细中存在不存在或已停用的物料", 400);

        const supplierIds = [...new Set(materials.map((material) => material.supplierId).filter(Boolean) as string[])];
        const suppliers = supplierIds.length
          ? await tx.supplier.findMany({
              where: { id: { in: supplierIds }, isActive: true, deletedAt: null },
              select: { id: true, name: true },
            })
          : [];
        const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

        const unhandledItems: Array<{ materialId: string; code: string; name: string; spec: string | null; supplierId: string | null; reason: string }> = [];
        const linesBySupplier = new Map<string, Array<{ material: (typeof materials)[number]; quantity: Prisma.Decimal }>>();
        for (const line of lines) {
          const material = materialById.get(line.materialId)!;
          const supplier = material.supplierId ? supplierById.get(material.supplierId) : null;
          if (!supplier) {
            unhandledItems.push({
              materialId: material.id,
              code: material.code,
              name: material.name,
              spec: material.spec,
              supplierId: material.supplierId,
              reason: material.supplierId ? "关联供应商不存在或已停用" : "未关联供应商",
            });
            continue;
          }
          linesBySupplier.set(supplier.id, [...(linesBySupplier.get(supplier.id) || []), { material, quantity: line.quantity }]);
        }

        const warehouseSource = warehouse
          ? { id: warehouse.id, code: warehouse.code, name: warehouse.name }
          : { id: null, code: null, name: "全部仓库合计" };
        const source = {
          bomId: bom.id,
          bomVersion: bom.version,
          product: product?.model || product?.category || null,
          productionQuantity,
          warehouse: warehouseSource,
          productionOrderId: productionOrder?.id || null,
          productionOrderNo: productionOrder?.orderNo || null,
        };
        const sourceRemark = productionOrder
          ? `由生产工单 ${productionOrder.orderNo} 缺料检查生成（BOM ${bom.version}，生产 ${productionQuantity.toString()} 台，${warehouseSource.name}）`
          : `由缺料测算生成（BOM ${bom.version}，生产 ${productionQuantity.toString()} 台，${warehouseSource.name}）`;
        const createdOrders: Array<{ id: string; orderNo: string; supplierId: string; supplierName: string; itemCount: number }> = [];

        for (const [supplierId, supplierLines] of linesBySupplier) {
          const supplier = supplierById.get(supplierId)!;
          const created = await tx.purchaseOrder.create({
            data: {
              orderNo: generateOrderNo(),
              supplierId: supplier.id,
              supplierNameSnapshot: supplier.name,
              orderDate: new Date(),
              status: "DRAFT",
              remark: sourceRemark,
              createdById: user.id,
            },
          });
          const itemData = supplierLines.map(({ material, quantity }, sortOrder) => {
            const unitPrice = material.standardPrice ? new Prisma.Decimal(material.standardPrice).toDecimalPlaces(2) : new Prisma.Decimal(0);
            return {
              purchaseOrderId: created.id,
              materialId: material.id,
              materialCodeSnapshot: material.code,
              materialNameSnapshot: material.name,
              materialSpecSnapshot: material.spec,
              quantity,
              unitPrice,
              amount: quantity.mul(unitPrice).toDecimalPlaces(2),
              sortOrder,
            };
          });
          await tx.purchaseOrderItem.createMany({ data: itemData });
          await writeOperationLog(tx, {
            userId: user.id,
            action: "CREATE_PURCHASE_ORDER_FROM_SHORTAGE",
            entityType: "PurchaseOrder",
            entityId: created.id,
            afterData: { purchaseOrder: created, items: itemData, source },
          });
          createdOrders.push({
            id: created.id,
            orderNo: created.orderNo,
            supplierId: supplier.id,
            supplierName: supplier.name,
            itemCount: itemData.length,
          });
        }

        return { createdOrders, unhandledItems, source };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json(result, { status: 201 });
    } catch (error: any) {
      if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
      if ((error?.code === "P2002" || error?.code === "P2034") && attempt < 2) continue;
      if (error?.code === "P2034") return NextResponse.json({ error: "生成采购建议时发生并发冲突，请重试" }, { status: 409 });
      throw error;
    }
  }

  return NextResponse.json({ error: "生成采购建议失败，请重试" }, { status: 409 });
}

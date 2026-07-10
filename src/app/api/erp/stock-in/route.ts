import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";
import {
  lockAndValidatePurchaseReceipt,
  PurchaseReceiptError,
  reconcilePurchaseOrderReceiptStatus,
  type PurchaseReceiptLine,
} from "@/lib/purchase-order-receipt";

type PurchaseStockInItem = {
  materialId: string;
  purchaseOrderItemId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
};

function generateBatchNo(type: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${type}${date}${random}`;
}

function parseDecimal(value: unknown, allowZero: boolean) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || (allowZero ? numberValue < 0 : numberValue <= 0)) return null;
  return new Prisma.Decimal(numberValue).toDecimalPlaces(2);
}

function normalizePurchaseStockInItems(rawItems: unknown): PurchaseStockInItem[] | null {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;
  const items = rawItems.map((raw) => {
    const item = raw as Record<string, unknown>;
    const quantity = parseDecimal(item.quantity, false);
    const unitPrice = parseDecimal(item.unitPrice, true);
    return {
      materialId: typeof item.materialId === "string" ? item.materialId.trim() : "",
      purchaseOrderItemId: typeof item.purchaseOrderItemId === "string" ? item.purchaseOrderItemId.trim() : "",
      quantity,
      unitPrice,
    };
  });
  if (items.some((item) => !item.materialId || !item.purchaseOrderItemId || !item.quantity || !item.unitPrice)) return null;
  if (new Set(items.map((item) => item.purchaseOrderItemId)).size !== items.length) return null;

  return items.map((item) => ({
    materialId: item.materialId,
    purchaseOrderItemId: item.purchaseOrderItemId,
    quantity: item.quantity!,
    unitPrice: item.unitPrice!,
    amount: item.quantity!.mul(item.unitPrice!).toDecimalPlaces(2),
  }));
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId") || "";
  const type = searchParams.get("type") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

  const where: any = {};
  if (warehouseId) where.warehouseId = warehouseId;
  if (type) where.type = type;

  const skip = (page - 1) * pageSize;

  const [stockIns, total] = await Promise.all([
    prisma.stockIn.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            material: { select: { id: true, name: true, code: true, spec: true, unit: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.stockIn.count({ where }),
  ]);
  const purchaseOrderIds = Array.from(new Set(stockIns.map((stockIn) => stockIn.purchaseOrderId).filter(Boolean))) as string[];
  const purchaseOrders = purchaseOrderIds.length > 0
    ? await prisma.purchaseOrder.findMany({
      where: { id: { in: purchaseOrderIds }, deletedAt: null },
      select: { id: true, orderNo: true, status: true },
    })
    : [];
  const purchaseOrderById = new Map(purchaseOrders.map((order) => [order.id, order]));

  return NextResponse.json({
    items: stockIns.map((stockIn) => ({
      ...stockIn,
      purchaseOrder: stockIn.purchaseOrderId ? purchaseOrderById.get(stockIn.purchaseOrderId) || null : null,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限操作入库" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.warehouseId || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "仓库和入库明细为必填项" }, { status: 400 });
  }

  const ids = body.items.map((item: any) => item.materialId);
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "同一张单里物料不能重复，请合并为一行" }, { status: 400 });
  }

  const purchaseOrderId = typeof body.purchaseOrderId === "string" ? body.purchaseOrderId.trim() : "";
  const purchaseItems = purchaseOrderId ? normalizePurchaseStockInItems(body.items) : null;
  if (purchaseOrderId && body.type && body.type !== "PURCHASE") {
    return NextResponse.json({ error: "采购订单入库的类型必须为采购入库" }, { status: 400 });
  }
  if (purchaseOrderId && !purchaseItems) {
    return NextResponse.json({ error: "采购入库明细必须填写有效数量、单价和采购订单明细关联，且同一采购明细不能重复" }, { status: 400 });
  }

  const batchNo = generateBatchNo("IN");
  const stockInItems = purchaseItems || body.items.map((item: any) => ({
    materialId: item.materialId,
    purchaseOrderItemId: null,
    quantity: parseFloat(item.quantity),
    unitPrice: parseFloat(item.unitPrice),
    amount: parseFloat(item.quantity) * parseFloat(item.unitPrice),
  }));

  try {
    const stockIn = await prisma.$transaction(
      async (tx) => {
        let lockedPurchaseOrder: Awaited<ReturnType<typeof lockAndValidatePurchaseReceipt>>["order"] | null = null;
        if (purchaseOrderId && purchaseItems) {
          const purchaseReceiptLines: PurchaseReceiptLine[] = purchaseItems.map((item) => ({
            purchaseOrderItemId: item.purchaseOrderItemId,
            materialId: item.materialId,
            quantity: item.quantity,
          }));
          const locked = await lockAndValidatePurchaseReceipt(tx, purchaseOrderId, purchaseReceiptLines);
          lockedPurchaseOrder = locked.order;
        }

        const header = await tx.stockIn.create({
          data: {
            batchNo,
            warehouseId: body.warehouseId,
            purchaseOrderId: purchaseOrderId || null,
            type: purchaseOrderId ? "PURCHASE" : body.type || "PURCHASE",
            remark: body.remark || null,
            createdById: user.id,
            items: {
              create: stockInItems.map((item: any, index: number) => ({
                materialId: item.materialId,
                purchaseOrderItemId: item.purchaseOrderItemId || null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
                sortOrder: index,
              })),
            },
          },
          include: {
            warehouse: { select: { id: true, name: true, code: true } },
            items: {
              include: {
                material: { select: { id: true, name: true, code: true, spec: true, unit: true } },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        });

        for (const item of stockInItems) {
          const qty = Number(item.quantity);
          const unitPrice = Number(item.unitPrice);
          const amount = Number(item.amount);
          const existing = await tx.inventory.findUnique({
            where: {
              warehouseId_materialId: {
                warehouseId: body.warehouseId,
                materialId: item.materialId,
              },
            },
          });

          const beforeQty = existing ? Number(existing.quantity) : 0;
          const beforeAmount = existing ? Number(existing.totalAmount) : 0;
          const newQty = beforeQty + qty;
          const newAmount = beforeAmount + amount;
          const avgPrice = newQty > 0 ? newAmount / newQty : null;

          await tx.inventory.upsert({
            where: {
              warehouseId_materialId: {
                warehouseId: body.warehouseId,
                materialId: item.materialId,
              },
            },
            create: {
              warehouseId: body.warehouseId,
              materialId: item.materialId,
              quantity: qty,
              totalAmount: amount,
              avgPrice: unitPrice,
            },
            update: {
              quantity: newQty,
              totalAmount: newAmount,
              avgPrice,
            },
          });

          await tx.stockMovement.create({
            data: {
              warehouseId: body.warehouseId,
              materialId: item.materialId,
              type: "STOCK_IN",
              quantity: qty,
              beforeQty,
              afterQty: newQty,
              refType: "StockIn",
              refId: header.id,
              createdById: user.id,
            },
          });
        }

        if (purchaseOrderId && purchaseItems && lockedPurchaseOrder) {
          for (const item of purchaseItems) {
            await tx.purchaseOrderItem.update({
              where: { id: item.purchaseOrderItemId },
              data: { receivedQuantity: { increment: item.quantity } },
            });
          }
          await reconcilePurchaseOrderReceiptStatus(tx, {
            purchaseOrderId,
            currentStatus: lockedPurchaseOrder.status,
            userId: user.id,
          });
        }

        return header;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json(stockIn, { status: 201 });
  } catch (error) {
    if (error instanceof PurchaseReceiptError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const prismaError = error as { code?: string; message?: string };
    if (prismaError?.code === "P2034" || /deadlock|serialization/i.test(String(prismaError?.message))) {
      return NextResponse.json({ error: "操作太频繁，请重试" }, { status: 409 });
    }
    throw error;
  }
}

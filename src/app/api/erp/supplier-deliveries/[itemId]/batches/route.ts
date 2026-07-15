import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP, canManagePurchaseOrders } from "@/lib/permissions";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { itemId } = await params;
  return NextResponse.json(await prisma.purchaseDeliveryBatch.findMany({ where: { purchaseOrderItemId: itemId }, orderBy: { createdAt: "asc" } }));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManagePurchaseOrders(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { itemId } = await params; const body = await request.json();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM erp_purchase_order_items WHERE id = ${itemId} FOR UPDATE`;
      const item = await tx.purchaseOrderItem.findUnique({ where: { id: itemId }, include: { deliveryBatches: true } });
      if (!item) throw new Error("采购明细不存在");
      const planned = new Prisma.Decimal(String(body.plannedQuantity || 0));
      if (!planned.gt(0)) throw new Error("计划到货数量必须大于 0");
      const totalPlanned = item.deliveryBatches.reduce((sum, row) => sum.add(row.plannedQuantity), new Prisma.Decimal(0)).add(planned);
      if (totalPlanned.gt(item.quantity)) throw new Error("各批次计划数量合计不能超过采购数量");
      return tx.purchaseDeliveryBatch.create({ data: { purchaseOrderItemId: itemId, plannedQuantity: planned, plannedArrivalDate: body.plannedArrivalDate ? new Date(body.plannedArrivalDate) : null, promisedDate: body.promisedDate ? new Date(body.promisedDate) : null, shippedQuantity: new Prisma.Decimal(String(body.shippedQuantity || 0)), actualShipDate: body.actualShipDate ? new Date(body.actualShipDate) : null, receivedQuantity: new Prisma.Decimal(String(body.receivedQuantity || 0)), actualArrivalDate: body.actualArrivalDate ? new Date(body.actualArrivalDate) : null, trackingNo: body.trackingNo || null, remark: body.remark || null } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 409 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canManagePurchaseOrders } from "@/lib/permissions";
import { deliveryStatusFor } from "@/lib/supplier-delivery";

export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManagePurchaseOrders(user)) return NextResponse.json({ error: "无权限修改承诺日期" }, { status: 403 });
  const { itemId } = await params; const body = await request.json(); const date = new Date(String(body.promisedDate || ""));
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "承诺日期无效" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM erp_purchase_order_items WHERE id = ${itemId} FOR UPDATE`;
      const item = await tx.purchaseOrderItem.findUnique({ where: { id: itemId } });
      if (!item) throw new Error("采购明细不存在");
      const affectsProduction = Boolean(item.needArrivalDate && date > item.needArrivalDate);
      const updated = await tx.purchaseOrderItem.update({ where: { id: itemId }, data: { firstPromisedDate: item.firstPromisedDate || date, latestPromisedDate: date, deliveryStatus: deliveryStatusFor({ quantity: Number(item.quantity), receivedQuantity: Number(item.receivedQuantity), latestPromisedDate: date }) } });
      await tx.supplierPromiseDateHistory.create({ data: { purchaseOrderItemId: itemId, oldPromisedDate: item.latestPromisedDate, newPromisedDate: date, changedById: user.id, supplierReason: body.supplierReason || null, affectsProduction, remark: body.remark || null } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "修改失败" }, { status: 409 }); }
}

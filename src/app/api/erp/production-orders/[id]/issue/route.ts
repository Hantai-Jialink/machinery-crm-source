import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessERP, getSessionUser } from "@/lib/permissions";
import { createKitCheckResult, expandBomSnapshot, issuedOrderNo, nextSequenceInContract, nextStockOrderNo, ProductionOrderRequestError } from "@/lib/production-orders";
import { writeOperationLog } from "@/lib/sales-items";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限下达生产工单" }, { status: 403 });
  const { id } = await params;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.productionOrder.findFirst({ where: { id, deletedAt: null } });
        if (!existing) throw new ProductionOrderRequestError("生产工单不存在", 404);
        if (existing.status !== "DRAFT") throw new ProductionOrderRequestError("仅待排产的生产工单可以下达", 409);
        const snapshot = await expandBomSnapshot(tx, { bomId: existing.bomId, productId: existing.productId, quantity: new Prisma.Decimal(existing.quantity) });
        const sequence = existing.contractId ? await nextSequenceInContract(tx, existing.contractId) : null;
        const orderNo = issuedOrderNo(existing.contractNoSnapshot, sequence, await nextStockOrderNo(tx));
        const updated = await tx.productionOrder.updateMany({ where: { id, status: "DRAFT", deletedAt: null }, data: { orderNo, sequenceInContract: sequence, bomVersionSnapshot: snapshot.bomVersion, status: "ISSUED" } });
        if (updated.count !== 1) throw new ProductionOrderRequestError("生产工单已被其他操作更新，请刷新后重试", 409);
        await tx.productionOrderMaterial.createMany({ data: snapshot.materials.map((item) => ({ ...item, productionOrderId: id })) });
        const kitCheck = await createKitCheckResult(tx, { productionOrderId: id, checkedById: user.id });
        const after = await tx.productionOrder.findUniqueOrThrow({ where: { id } });
        await writeOperationLog(tx, { userId: user.id, action: "ISSUE_PRODUCTION_ORDER", entityType: "ProductionOrder", entityId: id, beforeData: existing, afterData: { order: after, kitCheck } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const { getProductionOrderDetail } = await import("@/lib/production-orders");
      return NextResponse.json(await getProductionOrderDetail(id));
    } catch (error: any) {
      if ((error?.code === "P2002" || error?.code === "P2034") && attempt < 2) continue;
      if (error instanceof ProductionOrderRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }
  return NextResponse.json({ error: "下达生产工单时发生并发冲突，请重试" }, { status: 409 });
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma, ProductionOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessERP, getSessionUser } from "@/lib/permissions";
import { getProductionOrderDetail, parseProgress, ProductionOrderRequestError } from "@/lib/production-orders";
import { writeOperationLog } from "@/lib/sales-items";

const transitions: Record<ProductionOrderStatus, ProductionOrderStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["IN_PROGRESS", "PAUSED", "CANCELLED"],
  IN_PROGRESS: ["PAUSED", "COMPLETED"],
  PAUSED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["SHIPPED"],
  SHIPPED: [],
  CANCELLED: [],
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限变更生产工单状态" }, { status: 403 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求数据格式错误" }, { status: 400 });
  }
  const target = body?.status as ProductionOrderStatus;
  if (!(target in transitions)) return NextResponse.json({ error: "生产工单目标状态无效" }, { status: 400 });
  const progress = parseProgress(body?.progress);
  if (progress === undefined) return NextResponse.json({ error: "生产进度必须在 0 到 100 之间" }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.productionOrder.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new ProductionOrderRequestError("生产工单不存在", 404);
      if (!transitions[existing.status].includes(target)) throw new ProductionOrderRequestError("当前生产工单状态不能执行该操作", 409);
      if (target === "CANCELLED") {
        const issuedCount = await tx.stockOut.count({ where: { productionOrderId: id } });
        if (issuedCount > 0) throw new ProductionOrderRequestError("已有生产领料记录的工单不能取消；请保留工单并完成退料或按实际生产处理", 409);
      }
      const nextProgress = target === "COMPLETED" || target === "SHIPPED" ? new Prisma.Decimal(100) : progress ?? existing.progress;
      const changed = await tx.productionOrder.updateMany({ where: { id, status: existing.status, deletedAt: null }, data: { status: target, progress: nextProgress } });
      if (changed.count !== 1) throw new ProductionOrderRequestError("生产工单已被其他操作更新，请刷新后重试", 409);
      const after = await tx.productionOrder.findUniqueOrThrow({ where: { id } });
      await writeOperationLog(tx, { userId: user.id, action: "UPDATE_PRODUCTION_ORDER_STATUS", entityType: "ProductionOrder", entityId: id, beforeData: { status: existing.status, progress: existing.progress }, afterData: { status: after.status, progress: after.progress } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ProductionOrderRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json(await getProductionOrderDetail(id));
}

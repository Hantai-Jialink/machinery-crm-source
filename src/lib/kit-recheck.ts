import { Prisma } from "@prisma/client";
import { createKitCheckResult } from "@/lib/production-orders";

export async function enqueueKitRechecks(tx: Prisma.TransactionClient, input: {
  warehouseId: string;
  materialIds: string[];
  reason: string;
  requestedById: string;
}) {
  const materialIds = [...new Set(input.materialIds.filter(Boolean))];
  if (!materialIds.length) return 0;
  const affected = await tx.productionOrder.findMany({
    where: {
      warehouseId: input.warehouseId,
      deletedAt: null,
      isCurrent: true,
      status: { in: ["ISSUED", "CHANGE_PENDING"] },
      materials: { some: { materialId: { in: materialIds } } },
    },
    select: { id: true },
  });
  const now = new Date();
  for (const order of affected) {
    await tx.productionOrder.update({ where: { id: order.id }, data: { kitCheckRequired: true } });
    await tx.kitRecheckQueue.upsert({
      where: { productionOrderId: order.id },
      create: { productionOrderId: order.id, reason: input.reason, materialIds, requestedById: input.requestedById, requestedAt: now },
      update: { reason: input.reason, materialIds, requestedById: input.requestedById, requestedAt: now, processingAt: null, processedAt: null, lastError: null },
    });
  }
  return affected.length;
}

export async function processPendingKitRechecks(tx: Prisma.TransactionClient, checkedById: string, limit = 20) {
  const pending = await tx.kitRecheckQueue.findMany({ where: { processedAt: null }, orderBy: { requestedAt: "asc" }, take: limit });
  const results: Array<{ productionOrderId: string; status: string; resultId?: string; error?: string }> = [];
  for (const job of pending) {
    const claimed = await tx.kitRecheckQueue.updateMany({
      where: { id: job.id, processedAt: null, processingAt: null },
      data: { processingAt: new Date(), attemptCount: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    try {
      const check = await createKitCheckResult(tx, {
        productionOrderId: job.productionOrderId,
        checkedById,
        triggerKey: `QUEUE:${job.id}:${job.requestedAt.toISOString()}`,
        triggerType: "INVENTORY_CHANGE",
      });
      await tx.kitRecheckQueue.update({ where: { id: job.id }, data: { processedAt: new Date(), processingAt: null, lastError: null } });
      results.push({ productionOrderId: job.productionOrderId, status: check.status, resultId: check.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "齐套复检失败";
      await tx.kitRecheckQueue.update({ where: { id: job.id }, data: { processingAt: null, lastError: message } });
      results.push({ productionOrderId: job.productionOrderId, status: "FAILED", error: message });
    }
  }
  return results;
}

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { flattenBomLeafRequirements } from "@/lib/bom-items";
import { upsertPurchaseDemandForSource } from "@/lib/procurement-planning";

export async function approveMonthlyProductionPlan(tx: Prisma.TransactionClient, input: { planId: string; approvedById: string }) {
  const plan = await tx.monthlyProductionPlan.findFirst({
    where: { id: input.planId, status: "PENDING_APPROVAL" },
    include: { items: true },
  });
  if (!plan) throw new Error("月度计划不存在或当前状态不能审核");
  for (const planItem of plan.items) {
    const bom = await tx.bomHeader.findFirst({
      where: { id: planItem.bomId, productId: planItem.productId, isActive: true },
      include: { items: { include: { material: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!bom || bom.version !== planItem.bomVersionSnapshot) throw new Error(`${planItem.productModelSnapshot} 的 BOM 版本已变化，请创建计划新版本`);
    const leaves = flattenBomLeafRequirements(bom.items, planItem.plannedQuantity);
    const byMaterial = new Map(leaves.map((leaf) => [leaf.materialId, leaf]));
    for (const leaf of byMaterial.values()) {
      const calculation = await upsertPurchaseDemandForSource(tx, {
        sourceType: "MONTHLY_PRODUCTION_PLAN",
        sourceRecordId: planItem.id,
        sourceLineId: plan.id,
        sourceLabel: `${plan.planMonth.toISOString().slice(0, 7)} ${planItem.productModelSnapshot}`,
        materialId: leaf.materialId,
        newDemand: leaf.requiredQuantity,
        needByDate: planItem.plannedStartDate,
        createdById: input.approvedById,
      });
      await tx.monthlyMaterialRequirement.upsert({
        where: { planItemId_materialId: { planItemId: planItem.id, materialId: leaf.materialId } },
        create: {
          planItemId: planItem.id,
          materialId: leaf.materialId,
          requiredQuantity: leaf.requiredQuantity,
          plannedDemandQty: leaf.requiredQuantity,
          calculationSnapshot: (calculation?.calculationSnapshot || { suggestedQuantity: 0 }) as Prisma.InputJsonValue,
        },
        update: {
          requiredQuantity: leaf.requiredQuantity,
          plannedDemandQty: leaf.requiredQuantity,
          calculationSnapshot: (calculation?.calculationSnapshot || { suggestedQuantity: 0 }) as Prisma.InputJsonValue,
        },
      });
    }
  }
  return tx.monthlyProductionPlan.update({ where: { id: plan.id }, data: { status: "APPROVED", approvedById: input.approvedById, approvedAt: new Date() }, include: { items: { include: { materialRequirements: true } } } });
}

export function monthlyPlanNo(month: Date, version: number) {
  return `MP-${month.toISOString().slice(0, 7).replace("-", "")}-V${version}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

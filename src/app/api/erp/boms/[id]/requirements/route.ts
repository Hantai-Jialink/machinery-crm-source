import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";
import { flattenBomLeafRequirements } from "@/lib/bom-items";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  let machineQty: Prisma.Decimal;
  try { machineQty = new Prisma.Decimal(searchParams.get("quantity") || 1); }
  catch { return NextResponse.json({ error: "生产数量必须为大于 0 的有效数字" }, { status: 400 }); }
  if (!machineQty.isFinite() || !machineQty.gt(0)) return NextResponse.json({ error: "生产数量必须为大于 0 的有效数字" }, { status: 400 });
  const warehouseId = searchParams.get("warehouseId") || "";

  const bom = await prisma.bomHeader.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          material: {
            select: {
              id: true,
              code: true,
              name: true,
              spec: true,
              unit: true,
              standardPrice: true,
              supplier: true,
              supplierId: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!bom) {
    return NextResponse.json({ error: "整机用料清单不存在" }, { status: 404 });
  }

  let leaves;
  try { leaves = flattenBomLeafRequirements(bom.items, machineQty); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "用料清单层级无效" }, { status: 409 }); }
  const materialIds = leaves.map((leaf) => leaf.materialId);
  const inventories = materialIds.length
    ? await prisma.inventory.findMany({
        where: {
          materialId: { in: materialIds },
          ...(warehouseId ? { warehouseId } : {}),
        },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
        },
      })
    : [];

  const availableByMaterial = new Map<string, Prisma.Decimal>();
  for (const inventory of inventories) {
    availableByMaterial.set(
      inventory.materialId,
      (availableByMaterial.get(inventory.materialId) || new Prisma.Decimal(0)).add(inventory.quantity)
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: bom.productId },
    include: { translations: { where: { language: "ZH" }, take: 1 } },
  });
  const warehouse = warehouseId
    ? await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, code: true } })
    : null;

  const itemById = new Map(bom.items.map((item) => [item.id, item]));
  const rows = leaves.map((leaf) => {
    const item = itemById.get(leaf.sourceItemId)!;
    const availableQty = availableByMaterial.get(leaf.materialId) || new Prisma.Decimal(0);
    const shortageQty = Prisma.Decimal.max(leaf.requiredQuantity.sub(availableQty), new Prisma.Decimal(0));
    return {
      material: item.material,
      requiredQty: leaf.requiredQuantity.toNumber(),
      availableQty: availableQty.toNumber(),
      shortageQty: shortageQty.toNumber(),
      enough: shortageQty.eq(0),
      estimatedAmount: item.material.standardPrice ? leaf.requiredQuantity.mul(item.material.standardPrice).toNumber() : null,
    };
  }).sort((a, b) => String(a.material.code || "").localeCompare(String(b.material.code || "")));

  const shortageCount = rows.filter((row) => !row.enough).length;
  return NextResponse.json({
    bom: { ...bom, product },
    warehouse,
    quantity: machineQty.toNumber(),
    items: rows,
    summary: {
      totalMaterials: rows.length,
      shortageCount,
      allEnough: shortageCount === 0,
      estimatedAmount: rows.reduce((sum, row) => sum + (row.estimatedAmount || 0), 0),
    },
  });
}

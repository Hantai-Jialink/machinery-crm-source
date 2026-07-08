import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";

function toPositiveNumber(value: unknown, fallback = 1) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function addRequired(
  totals: Map<string, number>,
  materialId: string,
  quantity: number
) {
  totals.set(materialId, (totals.get(materialId) || 0) + quantity);
}

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
  const machineQty = toPositiveNumber(searchParams.get("quantity"), 1);
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
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!bom) {
    return NextResponse.json({ error: "BOM 不存在" }, { status: 404 });
  }

  const requiredByMaterial = new Map<string, number>();
  const childrenByParent = new Map<string, typeof bom.items>();
  for (const item of bom.items) {
    if (!item.parentItemId) continue;
    childrenByParent.set(item.parentItemId, [...(childrenByParent.get(item.parentItemId) || []), item]);
  }

  const visit = (item: (typeof bom.items)[number], parentRequired: number, seen: Set<string>) => {
    if (seen.has(item.id)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(item.id);

    const requiredQty = parentRequired * Number(item.quantity);
    addRequired(requiredByMaterial, item.materialId, requiredQty);

    for (const child of childrenByParent.get(item.id) || []) {
      visit(child, requiredQty, nextSeen);
    }
  };

  const childIds = new Set(bom.items.map((item) => item.parentItemId).filter(Boolean));
  const roots = bom.items.filter((item) => !item.parentItemId || !bom.items.some((candidate) => candidate.id === item.parentItemId));
  for (const item of roots.length ? roots : bom.items.filter((item) => !childIds.has(item.id))) {
    visit(item, machineQty, new Set());
  }

  const materialIds = [...requiredByMaterial.keys()];
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

  const availableByMaterial = new Map<string, number>();
  for (const inventory of inventories) {
    availableByMaterial.set(
      inventory.materialId,
      (availableByMaterial.get(inventory.materialId) || 0) + Number(inventory.quantity)
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: bom.productId },
    include: { translations: { where: { language: "ZH" }, take: 1 } },
  });
  const warehouse = warehouseId
    ? await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, code: true } })
    : null;

  const rows = bom.items
    .filter((item) => requiredByMaterial.has(item.materialId))
    .reduce<any[]>((acc, item) => {
      if (acc.some((row) => row.material.id === item.materialId)) return acc;
      const requiredQty = requiredByMaterial.get(item.materialId) || 0;
      const availableQty = availableByMaterial.get(item.materialId) || 0;
      const shortageQty = Math.max(0, requiredQty - availableQty);
      acc.push({
        material: item.material,
        requiredQty,
        availableQty,
        shortageQty,
        enough: shortageQty <= 0,
        estimatedAmount: item.material.standardPrice ? requiredQty * Number(item.material.standardPrice) : null,
      });
      return acc;
    }, [])
    .sort((a, b) => String(a.material.code || "").localeCompare(String(b.material.code || "")));

  const shortageCount = rows.filter((row) => !row.enough).length;
  return NextResponse.json({
    bom: { ...bom, product },
    warehouse,
    quantity: machineQty,
    items: rows,
    summary: {
      totalMaterials: rows.length,
      shortageCount,
      allEnough: shortageCount === 0,
      estimatedAmount: rows.reduce((sum, row) => sum + (row.estimatedAmount || 0), 0),
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";
import { writeOperationLog } from "@/lib/sales-items";

type BomLineInput = {
  id?: string;
  clientKey?: string;
  parentClientKey?: string | null;
  parentItemId?: string | null;
  materialId?: string;
  quantity?: string | number;
  level?: string | number | null;
  sortOrder?: number;
};

function toPositiveNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : null;
}

function normalizeBomItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items.map((item: BomLineInput, index) => {
    const quantity = toPositiveNumber(item.quantity);
    const level = Math.max(1, Math.trunc(Number(item.level || 1)));
    return {
      clientKey: item.clientKey || item.id || `line-${index}`,
      parentClientKey: item.parentClientKey || item.parentItemId || null,
      materialId: item.materialId || "",
      quantity,
      level: Number.isFinite(level) ? level : 1,
      sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : index * 10,
    };
  });
}

function validateBomItems(items: ReturnType<typeof normalizeBomItems>) {
  if (items.length === 0) return "BOM 至少需要一条物料明细";
  if (items.some((item) => !item.materialId || item.quantity === null)) {
    return "BOM 明细必须选择物料并填写大于 0 的用量";
  }
  return null;
}

async function loadProduct(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    include: { translations: { where: { language: "ZH" }, take: 1 } },
  });
}

async function createBomItems(
  tx: Prisma.TransactionClient,
  bomId: string,
  items: ReturnType<typeof normalizeBomItems>
) {
  const idByClientKey = new Map<string, string>();
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const parentItemId = item.parentClientKey ? idByClientKey.get(item.parentClientKey) || null : null;
    const created = await tx.bomItem.create({
      data: {
        bomId,
        materialId: item.materialId,
        quantity: item.quantity!,
        level: item.level,
        parentItemId,
        sortOrder: item.sortOrder,
      },
    });
    idByClientKey.set(item.clientKey, created.id);
  }
}

async function loadBom(id: string) {
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
              category: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!bom) return null;
  return {
    ...bom,
    product: await loadProduct(bom.productId),
  };
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
  const bom = await loadBom(id);
  if (!bom) {
    return NextResponse.json({ error: "BOM 不存在" }, { status: 404 });
  }

  return NextResponse.json(bom);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限维护 BOM" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.bomHeader.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "BOM 不存在" }, { status: 404 });
  }

  const nextProductId = body.productId || existing.productId;
  const product = await prisma.product.findFirst({
    where: { id: nextProductId, isActive: true },
    select: { id: true },
  });
  if (!product) {
    return NextResponse.json({ error: "产品不存在或已停用" }, { status: 404 });
  }

  const nextVersion = String(body.version || existing.version || "v1.0").trim();
  const duplicated = await prisma.bomHeader.findFirst({
    where: { productId: nextProductId, version: nextVersion, id: { not: id } },
    select: { id: true },
  });
  if (duplicated) {
    return NextResponse.json({ error: "同一产品已存在相同 BOM 版本" }, { status: 409 });
  }

  const items = normalizeBomItems(body.items);
  const itemError = validateBomItems(items);
  if (itemError) {
    return NextResponse.json({ error: itemError }, { status: 400 });
  }

  const isActive = body.isActive !== false;
  await prisma.$transaction(async (tx) => {
    if (isActive) {
      await tx.bomHeader.updateMany({
        where: { productId: nextProductId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }

    await tx.bomItem.deleteMany({ where: { bomId: id } });
    const updated = await tx.bomHeader.update({
      where: { id },
      data: {
        productId: nextProductId,
        version: nextVersion,
        isActive,
        remark: body.remark || null,
      },
    });

    await createBomItems(tx, id, items);
    const after = await tx.bomHeader.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await writeOperationLog(tx, {
      userId: user.id,
      action: "UPDATE_BOM",
      entityType: "BomHeader",
      entityId: updated.id,
      beforeData: existing,
      afterData: after,
    });
  });

  return NextResponse.json(await loadBom(id));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限停用 BOM" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.bomHeader.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "BOM 不存在" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const after = await tx.bomHeader.update({
      where: { id },
      data: { isActive: false },
    });
    await writeOperationLog(tx, {
      userId: user.id,
      action: "DISABLE_BOM",
      entityType: "BomHeader",
      entityId: id,
      beforeData: existing,
      afterData: after,
    });
  });

  return NextResponse.json({ success: true });
}

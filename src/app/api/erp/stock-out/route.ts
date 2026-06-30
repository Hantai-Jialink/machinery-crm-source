import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";

function generateBatchNo(type: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${type}${date}${random}`;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
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

  const [stockOuts, total] = await Promise.all([
    prisma.stockOut.findMany({
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
    prisma.stockOut.count({ where }),
  ]);

  return NextResponse.json({
    items: stockOuts,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限操作出库" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.warehouseId || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "仓库和出库明细为必填项" }, { status: 400 });
  }

  const batchNo = generateBatchNo("OUT");

  const stockOut = await prisma.$transaction(async (tx) => {
    // 先检查库存是否充足
    for (const item of body.items) {
      const inventory = await tx.inventory.findUnique({
        where: {
          warehouseId_materialId: {
            warehouseId: body.warehouseId,
            materialId: item.materialId,
          },
        },
      });

      const needed = parseFloat(item.quantity);
      const available = inventory ? Number(inventory.quantity) : 0;

      if (available < needed) {
        const material = await tx.material.findUnique({
          where: { id: item.materialId },
          select: { name: true, code: true },
        });
        throw new Error(
          `物料【${material?.name || item.materialId}】库存不足：需要 ${needed}，可用 ${available}`
        );
      }
    }

    // 创建出库单头
    const header = await tx.stockOut.create({
      data: {
        batchNo,
        warehouseId: body.warehouseId,
        type: body.type || "PRODUCTION",
        remark: body.remark || null,
        createdById: user.id,
        items: {
          create: body.items.map((item: any, index: number) => ({
            materialId: item.materialId,
            quantity: parseFloat(item.quantity),
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

    // 扣减库存 + 写入流水
    for (const item of body.items) {
      const qty = parseFloat(item.quantity);

      const inventory = await tx.inventory.findUnique({
        where: {
          warehouseId_materialId: {
            warehouseId: body.warehouseId,
            materialId: item.materialId,
          },
        },
      });

      if (!inventory) continue;

      const beforeQty = Number(inventory.quantity);
      const newQty = beforeQty - qty;
      const oldTotal = Number(inventory.totalAmount);
      const avgPrice = beforeQty > 0 ? oldTotal / beforeQty : 0;
      const deductedAmount = avgPrice * qty;
      const newAmount = oldTotal - deductedAmount;

      await tx.inventory.update({
        where: {
          warehouseId_materialId: {
            warehouseId: body.warehouseId,
            materialId: item.materialId,
          },
        },
        data: {
          quantity: newQty,
          totalAmount: Math.max(0, newAmount),
          avgPrice: newQty > 0 ? Math.max(0, newAmount) / newQty : null,
        },
      });

      // 写入流水
      await tx.stockMovement.create({
        data: {
          warehouseId: body.warehouseId,
          materialId: item.materialId,
          type: "STOCK_OUT",
          quantity: -qty,
          beforeQty: beforeQty,
          afterQty: newQty,
          refType: "StockOut",
          refId: header.id,
          createdById: user.id,
        },
      });
    }

    return header;
  });

  return NextResponse.json(stockOut, { status: 201 });
}

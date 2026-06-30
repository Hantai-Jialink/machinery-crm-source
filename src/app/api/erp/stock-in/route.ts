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

  const [stockIns, total] = await Promise.all([
    prisma.stockIn.findMany({
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
    prisma.stockIn.count({ where }),
  ]);

  return NextResponse.json({
    items: stockIns,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限操作入库" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.warehouseId || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "仓库和入库明细为必填项" }, { status: 400 });
  }

  const batchNo = generateBatchNo("IN");

  const stockIn = await prisma.$transaction(async (tx) => {
    // 创建入库单头
    const header = await tx.stockIn.create({
      data: {
        batchNo,
        warehouseId: body.warehouseId,
        type: body.type || "PURCHASE",
        remark: body.remark || null,
        createdById: user.id,
        items: {
          create: body.items.map((item: any, index: number) => ({
            materialId: item.materialId,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            amount: parseFloat(item.quantity) * parseFloat(item.unitPrice),
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

    // 更新库存 + 写入流水
    for (const item of body.items) {
      const qty = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const amount = qty * unitPrice;

      // upsert 库存
      const existing = await tx.inventory.findUnique({
        where: {
          warehouseId_materialId: {
            warehouseId: body.warehouseId,
            materialId: item.materialId,
          },
        },
      });

      const beforeQty = existing ? Number(existing.quantity) : 0;
      const beforeAmount = existing ? Number(existing.totalAmount) : 0;
      const newQty = beforeQty + qty;
      const newAmount = beforeAmount + amount;
      const avgPrice = newQty > 0 ? newAmount / newQty : null;

      await tx.inventory.upsert({
        where: {
          warehouseId_materialId: {
            warehouseId: body.warehouseId,
            materialId: item.materialId,
          },
        },
        create: {
          warehouseId: body.warehouseId,
          materialId: item.materialId,
          quantity: qty,
          totalAmount: amount,
          avgPrice: unitPrice,
        },
        update: {
          quantity: newQty,
          totalAmount: newAmount,
          avgPrice: avgPrice,
        },
      });

      // 写入流水
      await tx.stockMovement.create({
        data: {
          warehouseId: body.warehouseId,
          materialId: item.materialId,
          type: "STOCK_IN",
          quantity: qty,
          beforeQty: beforeQty,
          afterQty: newQty,
          refType: "StockIn",
          refId: header.id,
          createdById: user.id,
        },
      });
    }

    return header;
  });

  return NextResponse.json(stockIn, { status: 201 });
}

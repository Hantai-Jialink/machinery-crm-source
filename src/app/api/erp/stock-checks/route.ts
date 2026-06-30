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
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId") || "";
  const status = searchParams.get("status") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

  const where: any = {};
  if (warehouseId) where.warehouseId = warehouseId;
  if (status) where.status = status;

  const skip = (page - 1) * pageSize;

  const [stockChecks, total] = await Promise.all([
    prisma.stockCheck.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            material: { select: { id: true, name: true, code: true, spec: true, unit: true, standardPrice: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.stockCheck.count({ where }),
  ]);

  return NextResponse.json({
    items: stockChecks,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限操作盘点" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.warehouseId || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "仓库和盘点项目为必填项" }, { status: 400 });
  }

  const batchNo = generateBatchNo("CK");

  const stockCheck = await prisma.stockCheck.create({
    data: {
      batchNo,
      warehouseId: body.warehouseId,
      checkDate: body.checkDate ? new Date(body.checkDate) : new Date(),
      status: "DRAFT",
      remark: body.remark || null,
      createdById: user.id,
      items: {
        create: body.items.map((item: any, index: number) => ({
          materialId: item.materialId,
          bookQty: parseFloat(item.bookQty),
          actualQty: item.actualQty !== undefined && item.actualQty !== null ? parseFloat(item.actualQty) : null,
          diffQty: item.actualQty !== undefined && item.actualQty !== null
            ? parseFloat(item.actualQty) - parseFloat(item.bookQty)
            : null,
          diffAmount: null, // 提交时计算
          reason: item.reason || null,
          sortOrder: index,
        })),
      },
    },
    include: {
      warehouse: { select: { id: true, name: true, code: true } },
      items: {
        include: {
          material: { select: { id: true, name: true, code: true, spec: true, unit: true, standardPrice: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json(stockCheck, { status: 201 });
}

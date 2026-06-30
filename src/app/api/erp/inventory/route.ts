import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const warehouseId = searchParams.get("warehouseId") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const alertOnly = searchParams.get("alertOnly") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

  const where: any = {};

  if (warehouseId) {
    where.warehouseId = warehouseId;
  }

  if (categoryId) {
    where.material = { categoryId };
  }

  if (search) {
    const nameFilter = where.material?.categoryId
      ? { ...where.material, name: { contains: search } }
      : { name: { contains: search } };

    if (where.material) {
      where.material = {
        ...where.material,
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
        ],
      };
    } else {
      where.material = {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
        ],
      };
    }
  }

  // 安全库存预警：筛选 quantity <= safetyStock
  if (alertOnly) {
    where.material = {
      ...(where.material || {}),
      safetyStock: { not: null },
    };
    // 先查出所有再过滤，因为跨表比较
    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        material: { select: { id: true, name: true, code: true, spec: true, unit: true, safetyStock: true } },
      },
      orderBy: { materialId: "asc" },
    });

    const filtered = inventories.filter(
      (inv) => inv.material.safetyStock !== null && Number(inv.quantity) <= Number(inv.material.safetyStock)
    );

    return NextResponse.json({
      items: filtered,
      pagination: { page: 1, pageSize: filtered.length, total: filtered.length, totalPages: 1 },
    });
  }

  const skip = (page - 1) * pageSize;

  const [inventories, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        material: {
          select: {
            id: true,
            name: true,
            code: true,
            spec: true,
            unit: true,
            safetyStock: true,
            standardPrice: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { materialId: "asc" },
      skip,
      take: pageSize,
    }),
    prisma.inventory.count({ where }),
  ]);

  return NextResponse.json({
    items: inventories,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

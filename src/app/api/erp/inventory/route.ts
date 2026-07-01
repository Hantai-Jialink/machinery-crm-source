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

  const materialSelect = {
    id: true,
    name: true,
    code: true,
    spec: true,
    unit: true,
    safetyStock: true,
    standardPrice: true,
    supplier: true,
    category: { select: { id: true, name: true, warningThreshold: true } },
  };

  const effectiveThreshold = (material: any) => {
    if (material?.safetyStock !== null && material?.safetyStock !== undefined) {
      return Number(material.safetyStock);
    }
    if (material?.category?.warningThreshold !== null && material?.category?.warningThreshold !== undefined) {
      return Number(material.category.warningThreshold);
    }
    return null;
  };

  // Inventory warning: material safetyStock wins, then category warningThreshold.
  if (alertOnly) {
    // Fetch first, then filter because the threshold is chosen from related data.
    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        material: { select: materialSelect },
      },
      orderBy: { materialId: "asc" },
    });

    const filtered = inventories.filter((inv) => {
      const threshold = effectiveThreshold(inv.material);
      return threshold !== null && Number(inv.quantity) <= threshold;
    });

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
          select: materialSelect,
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

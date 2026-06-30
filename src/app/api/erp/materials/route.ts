import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const includeDeleted = searchParams.get("includeDeleted") === "1";

  const where: any = {};
  if (!includeDeleted) {
    where.deletedAt = null;
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
      { drawingNo: { contains: search } },
    ];
  }
  if (categoryId) {
    where.categoryId = categoryId;
  }

  const materials = await prisma.material.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(materials);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限操作物料" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.code || !body.name || !body.categoryId) {
    return NextResponse.json({ error: "物料编码、名称和分类为必填项" }, { status: 400 });
  }

  const material = await prisma.material.create({
    data: {
      code: body.code,
      name: body.name,
      categoryId: body.categoryId,
      spec: body.spec || null,
      materialType: body.materialType || null,
      drawingNo: body.drawingNo || null,
      unit: body.unit || "件",
      standardPrice: body.standardPrice ? parseFloat(body.standardPrice) : null,
      safetyStock: body.safetyStock ? parseFloat(body.safetyStock) : null,
      weight: body.weight ? parseFloat(body.weight) : null,
      remark: body.remark || null,
    },
    include: {
      category: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(material, { status: 201 });
}

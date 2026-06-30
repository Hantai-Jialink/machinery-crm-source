import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";

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

  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, code: true } },
    },
  });

  if (!material) {
    return NextResponse.json({ error: "物料不存在" }, { status: 404 });
  }

  return NextResponse.json(material);
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
    return NextResponse.json({ error: "无权限编辑物料" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const material = await prisma.material.update({
    where: { id },
    data: {
      code: body.code,
      name: body.name,
      categoryId: body.categoryId,
      spec: body.spec !== undefined ? (body.spec || null) : undefined,
      materialType: body.materialType !== undefined ? (body.materialType || null) : undefined,
      drawingNo: body.drawingNo !== undefined ? (body.drawingNo || null) : undefined,
      unit: body.unit || undefined,
      standardPrice: body.standardPrice !== undefined ? (body.standardPrice ? parseFloat(body.standardPrice) : null) : undefined,
      safetyStock: body.safetyStock !== undefined ? (body.safetyStock ? parseFloat(body.safetyStock) : null) : undefined,
      weight: body.weight !== undefined ? (body.weight ? parseFloat(body.weight) : null) : undefined,
      remark: body.remark !== undefined ? (body.remark || null) : undefined,
      isActive: body.isActive !== undefined ? body.isActive : undefined,
    },
    include: {
      category: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(material);
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
    return NextResponse.json({ error: "无权限删除物料" }, { status: 403 });
  }

  const { id } = await params;

  // 软删除
  await prisma.material.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

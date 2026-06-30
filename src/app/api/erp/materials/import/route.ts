import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessERP } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!canAccessERP(user)) {
    return NextResponse.json({ error: "无权限导入物料" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "导入数据不能为空" }, { status: 400 });
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    try {
      if (!item.code || !item.name || !item.categoryId) {
        skipped++;
        errors.push(`第${i + 1}行：缺少必填字段（编码/名称/分类）`);
        continue;
      }

      const existing = await prisma.material.findUnique({ where: { code: item.code } });
      if (existing) {
        skipped++;
        errors.push(`第${i + 1}行：物料编码 "${item.code}" 已存在`);
        continue;
      }

      await prisma.material.create({
        data: {
          code: item.code,
          name: item.name,
          categoryId: item.categoryId,
          spec: item.spec || null,
          materialType: item.materialType || null,
          drawingNo: item.drawingNo || null,
          unit: item.unit || "件",
          standardPrice: item.standardPrice ? parseFloat(item.standardPrice) : null,
          safetyStock: item.safetyStock ? parseFloat(item.safetyStock) : null,
          weight: item.weight ? parseFloat(item.weight) : null,
          remark: item.remark || null,
        },
      });
      created++;
    } catch (e: any) {
      skipped++;
      errors.push(`第${i + 1}行：${e.message || "导入失败"}`);
    }
  }

  return NextResponse.json({
    created,
    skipped,
    total: body.items.length,
    errors,
  }, { status: 201 });
}

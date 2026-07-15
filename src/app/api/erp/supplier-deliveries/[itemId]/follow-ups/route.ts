import { NextRequest, NextResponse } from "next/server";
import { SupplierProgressStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canManagePurchaseOrders } from "@/lib/permissions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManagePurchaseOrders(user)) return NextResponse.json({ error: "无权限新增跟进" }, { status: 403 });
  const { itemId } = await params; const body = await request.json();
  if (!Object.values(SupplierProgressStatus).includes(body.progress)) return NextResponse.json({ error: "供应商进度无效" }, { status: 400 });
  const item = await prisma.purchaseOrderItem.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: "采购明细不存在" }, { status: 404 });
  const percent = body.completionPercent === "" || body.completionPercent == null ? null : Number(body.completionPercent);
  if (percent !== null && (!Number.isInteger(percent) || percent < 0 || percent > 100)) return NextResponse.json({ error: "完成百分比必须为 0 到 100 的整数" }, { status: 400 });
  return NextResponse.json(await prisma.supplierDeliveryFollowUp.create({ data: { purchaseOrderItemId: itemId, followedAt: body.followedAt ? new Date(body.followedAt) : new Date(), followedById: user.id, supplierContact: body.supplierContact || null, contactMethod: body.contactMethod || null, progress: body.progress, completionPercent: percent, estimatedCompletionDate: body.estimatedCompletionDate ? new Date(body.estimatedCompletionDate) : null, estimatedShipDate: body.estimatedShipDate ? new Date(body.estimatedShipDate) : null, hasDelayRisk: body.hasDelayRisk === true, riskReason: body.riskReason || null, actionPlan: body.actionPlan || null, remark: body.remark || null } }), { status: 201 });
}

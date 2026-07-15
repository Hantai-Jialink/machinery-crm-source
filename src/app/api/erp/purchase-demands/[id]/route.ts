import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canManagePurchaseOrders, isSuperAdmin } from "@/lib/permissions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canManagePurchaseOrders(user)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();
  const current = await prisma.purchaseDemand.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "采购需求不存在" }, { status: 404 });
  if (body.action === "CANCEL") {
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "仅管理员可关闭采购需求" }, { status: 403 });
    if (current.convertedQuantity.gt(0)) return NextResponse.json({ error: "已转换数量不能静默取消，请先处理关联采购订单" }, { status: 409 });
    return NextResponse.json(await prisma.purchaseDemand.update({ where: { id }, data: { status: "CANCELLED", activeSlot: null, cancelledAt: new Date() } }));
  }
  if (body.action === "APPROVE") {
    if (!isSuperAdmin(user)) return NextResponse.json({ error: "仅管理员可审核" }, { status: 403 });
    return NextResponse.json(await prisma.purchaseDemand.update({ where: { id }, data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } }));
  }
  return NextResponse.json({ error: "操作无效" }, { status: 400 });
}

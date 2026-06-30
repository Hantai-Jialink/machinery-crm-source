import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isSuperAdmin } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!isSuperAdmin(user)) return NextResponse.json({ error: "无权查看操作日志" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "";
  const entityType = searchParams.get("entityType") || "";
  const pageSize = Math.min(Number(searchParams.get("pageSize") || 100), 200);

  const where: any = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

  const logs = await prisma.operationLog.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: pageSize,
  });

  return NextResponse.json(logs);
}

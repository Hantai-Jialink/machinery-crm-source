import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessERP, getSessionUser } from "@/lib/permissions";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  return NextResponse.json(users);
}

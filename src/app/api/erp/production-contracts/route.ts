import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessERP, getSessionUser } from "@/lib/permissions";

// ERP users need a contract selector, but this intentionally returns no customer, amount or payment data.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
  const search = new URL(request.url).searchParams.get("search")?.trim() || "";
  const contracts = await prisma.contract.findMany({
    where: { deletedAt: null, contractStatus: "SIGNED", ...(search ? { contractNo: { contains: search } } : {}) },
    select: { id: true, contractNo: true, equipmentName: true, equipmentModel: true, items: { orderBy: { sortOrder: "asc" }, select: { id: true, productId: true, productNameSnapshot: true, productModelSnapshot: true, quantity: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(contracts);
}

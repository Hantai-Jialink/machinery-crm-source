import { NextRequest, NextResponse } from "next/server";
import { Prisma, ProductionOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAccessERP, getSessionUser } from "@/lib/permissions";
import { buildDraftData, normalizeDraftInput, ProductionOrderRequestError } from "@/lib/production-orders";
import { writeOperationLog } from "@/lib/sales-items";

const statuses = new Set<ProductionOrderStatus>(["DRAFT", "ISSUED", "IN_PROGRESS", "PAUSED", "COMPLETED", "SHIPPED", "CANCELLED"]);

function errorResponse(error: unknown) {
  if (error instanceof ProductionOrderRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  throw error;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限访问 ERP" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || "";
  const status = searchParams.get("status") || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 20)));
  if (status && !statuses.has(status as ProductionOrderStatus)) return NextResponse.json({ error: "生产工单状态参数无效" }, { status: 400 });
  const where: Prisma.ProductionOrderWhereInput = {
    deletedAt: null,
    ...(status ? { status: status as ProductionOrderStatus } : {}),
    ...(search ? { OR: [{ orderNo: { contains: search } }, { contractNoSnapshot: { contains: search } }, { productModelSnapshot: { contains: search } }, { productNameSnapshot: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.productionOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { kitCheckResults: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.productionOrder.count({ where }),
  ]);
  return NextResponse.json({ items: items.map(({ kitCheckResults, ...item }) => ({ ...item, latestKitCheckResult: kitCheckResults[0] || null })), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canAccessERP(user)) return NextResponse.json({ error: "无权限创建生产工单" }, { status: 403 });
  let input;
  try {
    input = normalizeDraftInput(await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "请求数据格式错误" }, { status: 400 });
    return errorResponse(error);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const data = await buildDraftData(tx, input);
        const created = await tx.productionOrder.create({ data: { ...data, createdById: user.id } });
        await writeOperationLog(tx, { userId: user.id, action: "CREATE_PRODUCTION_ORDER", entityType: "ProductionOrder", entityId: created.id, afterData: created });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json(order, { status: 201 });
    } catch (error: any) {
      if ((error?.code === "P2002" || error?.code === "P2034") && attempt < 2) continue;
      return errorResponse(error);
    }
  }
  return NextResponse.json({ error: "创建生产工单时发生并发冲突，请重试" }, { status: 409 });
}

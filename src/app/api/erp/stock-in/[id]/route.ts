import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/permissions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  const stockIn = await prisma.stockIn.findUnique({
    where: { id },
    include: {
      warehouse: { select: { id: true, name: true, code: true } },
      items: {
        include: {
          material: { select: { id: true, name: true, code: true, spec: true, unit: true, standardPrice: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!stockIn) {
    return NextResponse.json({ error: "入库单不存在" }, { status: 404 });
  }

  return NextResponse.json(stockIn);
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, buildCustomerWhereClause, isSuperAdmin, canSeeAllData, matchesTerritory } from "@/lib/permissions";
import { writeOperationLog } from "@/lib/sales-items";

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

async function ensureActiveAssignee(assignedUserId: string | null | undefined) {
  if (!assignedUserId) return null;
  const assignee = await prisma.user.findFirst({
    where: { id: assignedUserId, isActive: true },
    select: { id: true },
  });
  if (!assignee) throw new Error("归属业务员不存在或已禁用");
  return assignee.id;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
    const search = searchParams.get("search") || "";
    const region = searchParams.get("region") || "";
    const status = searchParams.get("status") || "";
    const level = searchParams.get("level") || "";
    const tag = searchParams.get("tag") || "";
    const assignedUserId = searchParams.get("assignedUserId") || "";

    const where: any = buildCustomerWhereClause(user);

    const andConds: any[] = [];
    if (search) {
      andConds.push({
        OR: [
          { companyName: { contains: search } },
          { contactName: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
        ],
      });
    }
    if (andConds.length) where.AND = andConds;

    const province = searchParams.get("province") || "";
    const city = searchParams.get("city") || "";
    const businessLine = searchParams.get("businessLine") || "";
    if (province) where.province = province;
    if (city) where.city = city;
    if (businessLine && canSeeAllData(user)) where.businessLine = businessLine;
    if (region && isSuperAdmin(user)) where.region = region;
    if (status) where.status = status;
    if (level) where.customerLevel = level;
    if (assignedUserId) where.assignedUserId = assignedUserId;
    if (tag) where.interestTags = { path: "$", array_contains: tag };

    const skip = (page - 1) * pageSize;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          assignedUser: { select: { id: true, name: true, email: true, isActive: true } },
          contracts: {
            where: { deletedAt: null },
            select: { id: true, amount: true, paidAmount: true, unpaidAmount: true, paymentStatus: true, contractStatus: true },
          },
          _count: {
            select: {
              contracts: true,
              customerQuotes: true,
              followRecords: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json({
      customers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("[customers.GET]", error);
    return NextResponse.json({ error: "客户列表加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const body = await request.json();
    const seeAll = canSeeAllData(user);
    const businessLine = seeAll && body.businessLine === "外贸" ? "外贸" : "国内销售";
    const province = cleanText(body.province);
    const city = cleanText(body.city);

    if (!body.companyName || !body.contactName || !province || !body.customerSource || !body.customerType || !body.customerLevel) {
      return NextResponse.json({ error: "公司名称、联系人、省份、客户来源、客户类型和客户等级为必填项" }, { status: 400 });
    }

    // 普通销售只能在自己负责的省/市范围内新建客户(否则建完自己也看不到)
    if (!seeAll && !matchesTerritory(user.territories, province, city)) {
      return NextResponse.json({ error: "只能在自己负责的省/市范围内新建客户,请确认省/市选择" }, { status: 403 });
    }

    const duplicateConditions: any[] = [];
    const companyName = String(body.companyName).trim();
    const contactName = String(body.contactName).trim();
    const phone = cleanText(body.phone);
    const email = cleanText(body.email);
    const whatsapp = cleanText(body.whatsapp);

    if (phone) duplicateConditions.push({ phone, deletedAt: null });
    if (email) duplicateConditions.push({ email, deletedAt: null });
    if (whatsapp) duplicateConditions.push({ whatsapp, deletedAt: null });
    if (companyName) duplicateConditions.push({ companyName, deletedAt: null });

    if (duplicateConditions.length > 0) {
      const existing = await prisma.customer.findFirst({
        where: { OR: duplicateConditions },
        select: { id: true, companyName: true, contactName: true, phone: true },
      });
      if (existing && !body._forceCreate) {
        return NextResponse.json({
          warning: true,
          message: `系统发现可能重复客户：${existing.companyName}（${existing.contactName}），请确认是否继续保存。`,
          duplicate: existing,
        }, { status: 409 });
      }
    }

    const defaultAssigneeId = isSuperAdmin(user) ? null : user.id;
    const assignedUserId = await ensureActiveAssignee(body.assignedUserId || defaultAssigneeId);

    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          companyName,
          contactName,
          phone,
          wechat: cleanText(body.wechat),
          whatsapp,
          email,
          country: cleanText(body.country) || "中国",
          province,
          city,
          region: cleanText(body.region) || "",
          businessLine,
          address: cleanText(body.address),
          customerSource: body.customerSource,
          customerType: body.customerType,
          customerLevel: body.customerLevel,
          status: body.status || "NEW_LEAD",
          interestTags: body.interestTags || [],
          assignedUserId,
          remark: cleanText(body.remark),
          nextFollowDate: body.nextFollowDate ? new Date(body.nextFollowDate) : null,
        },
      });

      await writeOperationLog(tx, {
        userId: user.id,
        action: "CREATE_CUSTOMER",
        entityType: "Customer",
        entityId: created.id,
        afterData: created,
      });

      return created;
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error: any) {
    console.error("[customers.POST]", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "客户唯一字段重复，请检查公司名称、电话、邮箱或 WhatsApp" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || "创建客户失败" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isSuperAdmin } from "@/lib/permissions";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateRange(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const preset = searchParams.get("preset") || "month";
  const customStart = searchParams.get("start");
  const customEnd = searchParams.get("end");
  const today = startOfDay(new Date());
  let start = new Date(today.getFullYear(), today.getMonth(), 1);
  let end = addDays(today, 1);

  if (preset === "today") {
    start = today;
    end = addDays(today, 1);
  } else if (preset === "yesterday") {
    start = addDays(today, -1);
    end = today;
  } else if (preset === "7d") {
    start = addDays(today, -6);
    end = addDays(today, 1);
  } else if (preset === "lastMonth") {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === "quarter") {
    start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    end = addDays(today, 1);
  } else if (preset === "year") {
    start = new Date(today.getFullYear(), 0, 1);
    end = addDays(today, 1);
  } else if (preset === "custom" && customStart && customEnd) {
    start = startOfDay(new Date(customStart));
    end = addDays(startOfDay(new Date(customEnd)), 1);
  }

  return { preset, start, end, today };
}

function addContractStatusFilter(where: any, contractStatus: string) {
  if (!contractStatus) return;
  if (["DRAFT", "SIGNED", "COMPLETED", "ARCHIVED", "CANCELLED"].includes(contractStatus)) {
    where.contractStatus = contractStatus;
    return;
  }
  if (contractStatus === "PRODUCTION") {
    where.contractStatus = "SIGNED";
    where.shipments = { none: { shipmentStatus: { in: ["PARTIAL_SHIPPED", "SHIPPED"] } } };
    return;
  }
  if (contractStatus === "SHIPPED") {
    where.shipments = { some: { shipmentStatus: { in: ["PARTIAL_SHIPPED", "SHIPPED"] } } };
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const { preset, start, end, today } = getDateRange(request);
    const tomorrow = addDays(today, 1);
    const sevenDaysLater = addDays(today, 7);

    const region = searchParams.get("region") || "";
    const salesUserId = searchParams.get("salesUserId") || "";
    const customerStatus = searchParams.get("customerStatus") || "";
    const contractStatus = searchParams.get("contractStatus") || "";
    const shipmentStatus = searchParams.get("shipmentStatus") || "";

    const regionFilter = isSuperAdmin(user) ? region : user.region;

    const customerWhere: any = { deletedAt: null };
    if (regionFilter) customerWhere.region = regionFilter;
    if (customerStatus) customerWhere.status = customerStatus;
    if (salesUserId) customerWhere.assignedUserId = salesUserId;

    const contractWhere: any = {
      deletedAt: null,
      customer: { deletedAt: null },
    };
    if (regionFilter) contractWhere.customer.region = regionFilter;
    if (salesUserId) contractWhere.salesUserId = salesUserId;
    addContractStatusFilter(contractWhere, contractStatus);

    const periodContractWhere = {
      ...contractWhere,
      createdAt: { gte: start, lt: end },
    };

    const shipmentWhere: any = {
      shipmentDate: { gte: start, lt: end },
      contract: {
        ...contractWhere,
        customer: { ...(contractWhere.customer || {}) },
      },
    };
    if (shipmentStatus === "NOT_SHIPPED") shipmentWhere.shipmentStatus = "NOT_SHIPPED";
    if (shipmentStatus === "SHIPPED") shipmentWhere.shipmentStatus = "SHIPPED";
    if (shipmentStatus === "OVERDUE") {
      shipmentWhere.shipmentDate = { lt: today };
      shipmentWhere.shipmentStatus = { not: "SHIPPED" };
    }

    const estimatedShipmentWhere: any = {
      ...contractWhere,
      estimatedShipmentDate: { not: null },
    };

    if (shipmentStatus === "SHIPPED" || contractStatus === "SHIPPED") {
      estimatedShipmentWhere.shipments = { some: { shipmentStatus: "SHIPPED" } };
    } else {
      estimatedShipmentWhere.shipments = { none: { shipmentStatus: "SHIPPED" } };
    }

    const followCustomerWhere: any = {
      ...customerWhere,
      status: customerStatus || { notIn: ["WON", "LOST", "INACTIVE"] },
    };

    const recentFollowWhere: any = { customer: customerWhere };
    if (salesUserId) recentFollowWhere.userId = salesUserId;

    const [
      totalCustomers,
      todayFollowUp,
      overdueFollowUp,
      sevenDayFollowUp,
      periodNewCustomers,
      periodNewContracts,
      periodContractStats,
      periodShipments,
      totalContractStats,
      unpaidContracts,
      partialPaidContracts,
      todayShipmentDue,
      sevenDayShipmentDue,
      overdueShipmentDue,
      recentFollows,
      followUpCustomers,
      shipmentPaths,
    ] = await Promise.all([
      prisma.customer.count({ where: customerWhere }),
      prisma.customer.count({ where: { ...followCustomerWhere, nextFollowDate: { gte: today, lt: tomorrow } } }),
      prisma.customer.count({ where: { ...followCustomerWhere, nextFollowDate: { lt: today } } }),
      prisma.customer.count({ where: { ...followCustomerWhere, nextFollowDate: { gte: today, lt: sevenDaysLater } } }),
      prisma.customer.count({ where: { ...customerWhere, createdAt: { gte: start, lt: end } } }),
      prisma.contract.count({ where: periodContractWhere }),
      prisma.contract.aggregate({
        where: periodContractWhere,
        _sum: { amount: true, paidAmount: true, unpaidAmount: true },
      }),
      prisma.shipment.count({ where: shipmentWhere }),
      prisma.contract.aggregate({
        where: contractWhere,
        _sum: { amount: true, paidAmount: true, unpaidAmount: true },
        _count: true,
      }),
      prisma.contract.count({ where: { ...contractWhere, paymentStatus: "UNPAID" } }),
      prisma.contract.count({ where: { ...contractWhere, paymentStatus: "PARTIAL_PAID" } }),
      prisma.contract.count({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: today, lt: tomorrow } } }),
      prisma.contract.count({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: today, lt: sevenDaysLater } } }),
      prisma.contract.count({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { lt: today } } }),
      prisma.followRecord.findMany({
        where: recentFollowWhere,
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { customer: { select: { id: true, companyName: true } }, user: { select: { name: true } } },
      }),
      prisma.customer.findMany({
        where: { ...followCustomerWhere, nextFollowDate: { lte: sevenDaysLater } },
        take: 8,
        orderBy: { nextFollowDate: "asc" },
        select: { id: true, companyName: true, contactName: true, nextFollowDate: true, assignedUser: { select: { name: true } } },
      }),
      prisma.shipment.findMany({
        where: shipmentWhere,
        take: 12,
        orderBy: { shipmentDate: "desc" },
        include: {
          contract: {
            select: {
              id: true,
              contractNo: true,
              equipmentName: true,
              equipmentModel: true,
              customer: { select: { id: true, companyName: true, region: true } },
            },
          },
        },
      }),
    ]);

    const dueSelect = {
      id: true,
      contractNo: true,
      estimatedShipmentDate: true,
      equipmentName: true,
      equipmentModel: true,
      customer: { select: { id: true, companyName: true } },
    };

    const [todayShipmentList, sevenDayShipmentList, overdueShipmentList] = await Promise.all([
      prisma.contract.findMany({
        where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: today, lt: tomorrow } },
        take: 8,
        orderBy: { estimatedShipmentDate: "asc" },
        select: dueSelect,
      }),
      prisma.contract.findMany({
        where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: tomorrow, lt: sevenDaysLater } },
        take: 8,
        orderBy: { estimatedShipmentDate: "asc" },
        select: dueSelect,
      }),
      prisma.contract.findMany({
        where: { ...estimatedShipmentWhere, estimatedShipmentDate: { lt: today } },
        take: 8,
        orderBy: { estimatedShipmentDate: "asc" },
        select: dueSelect,
      }),
    ]);

    return NextResponse.json({
      range: { preset, start, end },
      filters: { region: regionFilter, salesUserId, customerStatus, contractStatus, shipmentStatus },
      stats: {
        totalCustomers,
        todayFollowUp,
        overdueFollowUp,
        sevenDayFollowUp,
        periodNewCustomers,
        periodNewContracts,
        periodContractAmount: periodContractStats._sum.amount || 0,
        periodPaidAmount: periodContractStats._sum.paidAmount || 0,
        periodUnpaidAmount: periodContractStats._sum.unpaidAmount || 0,
        periodShipments,
        totalContractAmount: totalContractStats._sum.amount || 0,
        totalPaidAmount: totalContractStats._sum.paidAmount || 0,
        totalUnpaidAmount: totalContractStats._sum.unpaidAmount || 0,
        unpaidContracts,
        partialPaidContracts,
        todayShipmentDue,
        sevenDayShipmentDue,
        overdueShipmentDue,
      },
      shipmentReminders: {
        today: todayShipmentList,
        sevenDays: sevenDayShipmentList,
        overdue: overdueShipmentList,
      },
      recentFollows,
      followUpCustomers,
      shipmentPaths,
    });
  } catch (error) {
    console.error("[dashboard.GET]", error);
    return NextResponse.json({ error: "工作台数据加载失败" }, { status: 500 });
  }
}

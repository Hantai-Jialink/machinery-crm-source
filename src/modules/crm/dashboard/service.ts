import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { crmDashboardScope } from "./permissions";

function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function addDays(date: Date, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value; }

function dateRange(searchParams: URLSearchParams) {
  const preset = searchParams.get("preset") || "month";
  const customStart = searchParams.get("start"); const customEnd = searchParams.get("end");
  const today = startOfDay(new Date()); let start = new Date(today.getFullYear(), today.getMonth(), 1); let end = addDays(today, 1);
  if (preset === "today") { start = today; end = addDays(today, 1); }
  else if (preset === "yesterday") { start = addDays(today, -1); end = today; }
  else if (preset === "7d") { start = addDays(today, -6); end = addDays(today, 1); }
  else if (preset === "lastMonth") { start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 1); }
  else if (preset === "quarter") { start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1); }
  else if (preset === "year") { start = new Date(today.getFullYear(), 0, 1); }
  else if (preset === "custom" && customStart && customEnd) { start = startOfDay(new Date(customStart)); end = addDays(startOfDay(new Date(customEnd)), 1); }
  return { preset, start, end, today };
}

function contractStatus(where: any, value: string) {
  if (["DRAFT", "SIGNED", "COMPLETED", "ARCHIVED", "CANCELLED"].includes(value)) where.contractStatus = value;
  else if (value === "PRODUCTION") { where.contractStatus = "SIGNED"; where.shipments = { none: { shipmentStatus: { in: ["PARTIAL_SHIPPED", "SHIPPED"] } } }; }
  else if (value === "SHIPPED") where.shipments = { some: { shipmentStatus: { in: ["PARTIAL_SHIPPED", "SHIPPED"] } } };
}

export async function getCrmDashboard(user: SessionUser, searchParams: URLSearchParams) {
  const { preset, start, end, today } = dateRange(searchParams); const tomorrow = addDays(today, 1); const sevenDaysLater = addDays(today, 7);
  const region = searchParams.get("region") || ""; const salesUserId = searchParams.get("salesUserId") || "";
  const customerStatus = searchParams.get("customerStatus") || ""; const requestedContractStatus = searchParams.get("contractStatus") || ""; const shipmentStatus = searchParams.get("shipmentStatus") || "";
  const { scope, isAdmin, selectedSalesUserId } = crmDashboardScope(user, { province: searchParams.get("province") || "", salesUserId });
  const customerWhere: any = { deletedAt: null, ...scope };
  if (isAdmin && region) customerWhere.region = region;
  if (customerStatus) customerWhere.status = customerStatus;
  const contractCustomerWhere: any = { deletedAt: null, ...scope }; if (isAdmin && region) contractCustomerWhere.region = region;
  const contractWhere: any = { deletedAt: null, customer: contractCustomerWhere };
  if (selectedSalesUserId) contractWhere.salesUserId = selectedSalesUserId;
  contractStatus(contractWhere, requestedContractStatus);
  const periodContractWhere = { ...contractWhere, createdAt: { gte: start, lt: end } };
  const shipmentWhere: any = { shipmentDate: { gte: start, lt: end }, contract: { ...contractWhere, customer: { ...contractCustomerWhere } } };
  if (shipmentStatus === "NOT_SHIPPED") shipmentWhere.shipmentStatus = "NOT_SHIPPED";
  if (shipmentStatus === "SHIPPED") shipmentWhere.shipmentStatus = "SHIPPED";
  if (shipmentStatus === "OVERDUE") { shipmentWhere.shipmentDate = { lt: today }; shipmentWhere.shipmentStatus = { not: "SHIPPED" }; }
  const shipmentPathWhere: any = { contract: { ...contractWhere, customer: { ...contractCustomerWhere } }, shipmentStatus: { in: ["SHIPPED", "PARTIAL_SHIPPED"] } };
  if (shipmentStatus === "SHIPPED") shipmentPathWhere.shipmentStatus = "SHIPPED";
  const estimatedShipmentWhere: any = { ...contractWhere, estimatedShipmentDate: { not: null } };
  estimatedShipmentWhere.shipments = shipmentStatus === "SHIPPED" || requestedContractStatus === "SHIPPED" ? { some: { shipmentStatus: "SHIPPED" } } : { none: { shipmentStatus: "SHIPPED" } };
  const followCustomerWhere: any = { ...customerWhere, status: customerStatus || { notIn: ["WON", "LOST", "INACTIVE"] } };
  const recentFollowWhere: any = { customer: customerWhere }; if (selectedSalesUserId) recentFollowWhere.userId = selectedSalesUserId;
  const [totalCustomers, todayFollowUp, overdueFollowUp, sevenDayFollowUp, periodNewCustomers, periodNewContracts, periodContractStats, periodShipments, totalContractStats, unpaidContracts, partialPaidContracts, todayShipmentDue, sevenDayShipmentDue, overdueShipmentDue, recentFollows, followUpCustomers, shipmentPaths] = await Promise.all([
    prisma.customer.count({ where: customerWhere }), prisma.customer.count({ where: { ...followCustomerWhere, nextFollowDate: { gte: today, lt: tomorrow } } }), prisma.customer.count({ where: { ...followCustomerWhere, nextFollowDate: { lt: today } } }), prisma.customer.count({ where: { ...followCustomerWhere, nextFollowDate: { gte: today, lt: sevenDaysLater } } }), prisma.customer.count({ where: { ...customerWhere, createdAt: { gte: start, lt: end } } }), prisma.contract.count({ where: periodContractWhere }), prisma.contract.aggregate({ where: periodContractWhere, _sum: { amount: true, paidAmount: true, unpaidAmount: true } }), prisma.shipment.count({ where: shipmentWhere }), prisma.contract.aggregate({ where: contractWhere, _sum: { amount: true, paidAmount: true, unpaidAmount: true } }), prisma.contract.count({ where: { ...contractWhere, paymentStatus: "UNPAID" } }), prisma.contract.count({ where: { ...contractWhere, paymentStatus: "PARTIAL_PAID" } }), prisma.contract.count({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: today, lt: tomorrow } } }), prisma.contract.count({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: today, lt: sevenDaysLater } } }), prisma.contract.count({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { lt: today } } }), prisma.followRecord.findMany({ where: recentFollowWhere, orderBy: { createdAt: "desc" }, take: 8, include: { customer: { select: { id: true, companyName: true } }, user: { select: { name: true } } } }), prisma.customer.findMany({ where: { ...followCustomerWhere, nextFollowDate: { lte: sevenDaysLater } }, take: 8, orderBy: { nextFollowDate: "asc" }, select: { id: true, companyName: true, contactName: true, nextFollowDate: true, assignedUser: { select: { name: true } } } }), prisma.shipment.findMany({ where: shipmentPathWhere, take: 80, orderBy: { shipmentDate: "desc" }, include: { contract: { select: { id: true, contractNo: true, equipmentName: true, equipmentModel: true, customer: { select: { id: true, companyName: true, region: true } } } } } })
  ]);
  const dueSelect = { id: true, contractNo: true, estimatedShipmentDate: true, equipmentName: true, equipmentModel: true, customer: { select: { id: true, companyName: true } } };
  const [todayList, sevenDayList, overdueList] = await Promise.all([
    prisma.contract.findMany({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: today, lt: tomorrow } }, take: 8, orderBy: { estimatedShipmentDate: "asc" }, select: dueSelect }), prisma.contract.findMany({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { gte: tomorrow, lt: sevenDaysLater } }, take: 8, orderBy: { estimatedShipmentDate: "asc" }, select: dueSelect }), prisma.contract.findMany({ where: { ...estimatedShipmentWhere, estimatedShipmentDate: { lt: today } }, take: 8, orderBy: { estimatedShipmentDate: "asc" }, select: dueSelect })
  ]);
  const salesUsers = isAdmin ? await prisma.user.findMany({ where: { isActive: true, role: { in: ["SALES", "FOREIGN_TRADE"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [{ id: user.id, name: user.name || user.email || "本人" }];
  return { range: { preset, start, end }, filters: { region: isAdmin ? region : "", salesUserId: selectedSalesUserId, customerStatus, contractStatus: requestedContractStatus, shipmentStatus }, salesUsers, stats: { totalCustomers, todayFollowUp, overdueFollowUp, sevenDayFollowUp, periodNewCustomers, periodNewContracts, periodContractAmount: periodContractStats._sum.amount || 0, periodPaidAmount: periodContractStats._sum.paidAmount || 0, periodUnpaidAmount: periodContractStats._sum.unpaidAmount || 0, periodShipments, totalContractAmount: totalContractStats._sum.amount || 0, totalPaidAmount: totalContractStats._sum.paidAmount || 0, totalUnpaidAmount: totalContractStats._sum.unpaidAmount || 0, unpaidContracts, partialPaidContracts, todayShipmentDue, sevenDayShipmentDue, overdueShipmentDue }, shipmentReminders: { today: todayList, sevenDays: sevenDayList, overdue: overdueList }, recentFollows, followUpCustomers, shipmentPaths };
}

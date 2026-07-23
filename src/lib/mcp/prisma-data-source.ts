import { Prisma, type PrismaClient } from "@prisma/client";
import type { McpAuditInput, McpDataSource, McpUser } from "@/lib/mcp/application";
import { canCallMcpBusinessTool, McpToolError } from "@/lib/mcp/tools";
import { buildCustomerWhereClause, customerIsolationWhere, parseTerritories } from "@/lib/customer-permissions";
import { toPlainJson } from "@/lib/sales-items";
import { canExecuteKitCheck, canManageBom, canManageSuppliers, canViewERP } from "@/lib/erp-roles";
import { calculateKitMaterialQuantities } from "@/lib/production-orders";

type QueryArgs = Record<string, unknown>;

const INVENTORY_ALERT_MATERIAL_LIMIT = 500;

function text(args: QueryArgs, key: string) {
  return typeof args[key] === "string" ? args[key].trim() : "";
}

function pagination(args: QueryArgs) {
  const page = Math.max(1, Number(args.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(args.pageSize || 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function paginated(items: unknown[], total: number, page: number, pageSize: number) {
  return {
    items: toPlainJson(items),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

function dateRange(args: QueryArgs) {
  const startValue = text(args, "dateStart");
  const endValue = text(args, "dateEnd");
  if (!startValue || !endValue) return undefined;
  const end = new Date(`${endValue}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: new Date(`${startValue}T00:00:00.000Z`), lt: end };
}

async function queryCustomers(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const where: any = buildCustomerWhereClause(user);
  const createdAt = dateRange(args);
  if (createdAt) where.createdAt = createdAt;
  if (search) {
    where.AND = [{
      OR: [
        { companyName: { contains: search } },
        { contactName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ],
    }];
  }
  const status = text(args, "status");
  const province = text(args, "province");
  const city = text(args, "city");
  const assignedUserId = text(args, "assignedUserId");
  if (status) where.status = status;
  if (province) where.province = province;
  if (city) where.city = city;
  if (assignedUserId) where.assignedUserId = assignedUserId;

  const [items, total] = await Promise.all([
    client.customer.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        contactName: true,
        phone: true,
        wechat: true,
        whatsapp: true,
        email: true,
        country: true,
        province: true,
        city: true,
        region: true,
        businessLine: true,
        address: true,
        customerSource: true,
        customerType: true,
        customerLevel: true,
        status: true,
        interestTags: true,
        assignedUser: { select: { id: true, name: true, isActive: true } },
        lastFollowDate: true,
        nextFollowDate: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { contracts: true, customerQuotes: true, followRecords: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
    }),
    client.customer.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

const customerSelect = {
  id: true,
  companyName: true,
  contactName: true,
  phone: true,
  wechat: true,
  whatsapp: true,
  email: true,
  country: true,
  province: true,
  city: true,
  region: true,
  businessLine: true,
  address: true,
  customerSource: true,
  customerType: true,
  customerLevel: true,
  status: true,
  interestTags: true,
  remark: true,
  assignedUser: { select: { id: true, name: true, isActive: true } },
  lastFollowDate: true,
  nextFollowDate: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { contracts: true, customerQuotes: true, followRecords: true } },
} as const;

async function queryCustomer(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const customer = await client.customer.findFirst({
    where: { ...buildCustomerWhereClause(user), id: text(args, "id") },
    select: customerSelect,
  });
  if (!customer) throw new McpToolError("NOT_FOUND", "客户不存在或无权访问");
  return toPlainJson(customer);
}

async function queryCustomerFollows(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const customerId = text(args, "customerId");
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const followWhere: Prisma.FollowRecordWhereInput = {
    customerId,
    customer: buildCustomerWhereClause(user),
    ...(dateRange(args) ? { createdAt: dateRange(args) } : {}),
    ...(search ? { OR: [{ content: { contains: search } }, { result: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    client.followRecord.findMany({
      where: followWhere,
      select: {
        id: true,
        customerId: true,
        followType: true,
        content: true,
        result: true,
        address: true,
        nextFollowDate: true,
        newStatus: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    client.followRecord.count({ where: followWhere }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function queryProducts(client: PrismaClient, args: QueryArgs) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const productType = text(args, "productType");
  const where: any = { isActive: true, ...(dateRange(args) ? { updatedAt: dateRange(args) } : {}) };
  if (productType) where.productType = productType;
  if (search) {
    where.OR = [
      { model: { contains: search } },
      { category: { contains: search } },
      { translations: { some: { OR: [{ name: { contains: search } }, { description: { contains: search } }] } } },
    ];
  }
  const [items, total] = await Promise.all([
    client.product.findMany({
      where,
      select: {
        id: true,
        model: true,
        category: true,
        productType: true,
        factoryPrice: true,
        currency: true,
        remark: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        translations: {
          where: { language: "ZH" },
          select: { language: true, name: true, description: true, specs: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
    }),
    client.product.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function queryProduct(client: PrismaClient, args: QueryArgs) {
  const product = await client.product.findFirst({
    where: { id: text(args, "id"), isActive: true },
    select: {
      id: true,
      model: true,
      category: true,
      productType: true,
      factoryPrice: true,
      currency: true,
      remark: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      translations: {
        select: { language: true, name: true, description: true, specs: true },
        orderBy: { language: "asc" },
      },
    },
  });
  if (!product) throw new McpToolError("NOT_FOUND", "产品不存在");
  return toPlainJson(product);
}

function contractWhere(args: QueryArgs, user: McpUser) {
  const where: any = { deletedAt: null, customer: customerIsolationWhere(user) };
  const signedDate = dateRange(args);
  if (signedDate) where.signedDate = signedDate;
  const search = text(args, "search");
  const status = text(args, "status");
  const paymentStatus = text(args, "paymentStatus");
  const customerId = text(args, "customerId");
  if (status) where.contractStatus = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (customerId) where.customerId = customerId;
  if (search) {
    where.OR = [
      { contractNo: { contains: search } },
      { equipmentName: { contains: search } },
      { equipmentModel: { contains: search } },
      { customer: { companyName: { contains: search } } },
    ];
  }
  return where;
}

async function queryContracts(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const { page, pageSize, skip } = pagination(args);
  const where = contractWhere(args, user);
  const [items, total] = await Promise.all([
    client.contract.findMany({
      where,
      select: {
        id: true,
        contractNo: true,
        signedDate: true,
        estimatedShipmentDate: true,
        equipmentName: true,
        equipmentModel: true,
        amount: true,
        paidAmount: true,
        unpaidAmount: true,
        currency: true,
        paymentStatus: true,
        contractStatus: true,
        remark: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, companyName: true, contactName: true, province: true, city: true, businessLine: true } },
        salesUser: { select: { id: true, name: true } },
        _count: { select: { items: true, payments: true, shipments: true } },
      },
      orderBy: { signedDate: "desc" },
      skip,
      take: pageSize,
    }),
    client.contract.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function queryContract(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const contract = await client.contract.findFirst({
    where: { id: text(args, "id"), deletedAt: null, customer: customerIsolationWhere(user) },
    select: {
      id: true,
      contractNo: true,
      signedDate: true,
      estimatedShipmentDate: true,
      equipmentName: true,
      equipmentModel: true,
      amount: true,
      paidAmount: true,
      unpaidAmount: true,
      currency: true,
      paymentStatus: true,
      contractStatus: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { id: true, companyName: true, contactName: true, province: true, city: true, businessLine: true } },
      salesUser: { select: { id: true, name: true } },
      items: {
        select: { id: true, itemType: true, productId: true, productNameSnapshot: true, productModelSnapshot: true, contractPrice: true, quantity: true, estimatedShipmentDate: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      },
      payments: {
        where: { status: "ACTIVE" },
        select: { id: true, amount: true, paymentDate: true, paymentMethod: true, status: true, createdAt: true },
        orderBy: { paymentDate: "desc" },
      },
      shipments: {
        select: { id: true, shipmentDate: true, equipmentName: true, quantity: true, shipmentStatus: true, createdAt: true },
        orderBy: { shipmentDate: "desc" },
      },
    },
  });
  if (!contract) throw new McpToolError("NOT_FOUND", "合同不存在或无权访问");
  return toPlainJson(contract);
}

function shipmentWhere(args: QueryArgs, user: McpUser) {
  const where: any = {
    contract: { deletedAt: null, customer: customerIsolationWhere(user) },
  };
  const search = text(args, "search");
  const status = text(args, "status");
  const contractId = text(args, "contractId");
  const customerId = text(args, "customerId");
  if (status) where.shipmentStatus = status;
  if (contractId) where.contractId = contractId;
  if (customerId) where.contract.customerId = customerId;
  if (args.dateStart || args.dateEnd) {
    where.shipmentDate = {};
    if (args.dateStart) where.shipmentDate.gte = new Date(String(args.dateStart));
    if (args.dateEnd) {
      const end = new Date(String(args.dateEnd));
      end.setUTCDate(end.getUTCDate() + 1);
      where.shipmentDate.lt = end;
    }
  }
  if (search) {
    where.OR = [
      { equipmentName: { contains: search } },
      { receivingAddress: { contains: search } },
      { contract: { contractNo: { contains: search } } },
      { contract: { customer: { companyName: { contains: search } } } },
    ];
  }
  return where;
}

const shipmentSelect = {
  id: true,
  contractId: true,
  shipmentDate: true,
  receivingAddress: true,
  driverPhone: true,
  equipmentName: true,
  quantity: true,
  shipmentStatus: true,
  remark: true,
  createdAt: true,
  updatedAt: true,
  contract: {
    select: {
      id: true,
      contractNo: true,
      equipmentName: true,
      equipmentModel: true,
      customer: { select: { id: true, companyName: true, contactName: true, province: true, city: true } },
      salesUser: { select: { id: true, name: true } },
    },
  },
  createdBy: { select: { id: true, name: true } },
} as const;

async function queryShipments(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const { page, pageSize, skip } = pagination(args);
  const where = shipmentWhere(args, user);
  const [items, total] = await Promise.all([
    client.shipment.findMany({ where, select: shipmentSelect, orderBy: [{ shipmentDate: "desc" }, { createdAt: "desc" }], skip, take: pageSize }),
    client.shipment.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function queryShipment(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const shipment = await client.shipment.findFirst({
    where: { id: text(args, "id"), contract: { deletedAt: null, customer: customerIsolationWhere(user) } },
    select: shipmentSelect,
  });
  if (!shipment) throw new McpToolError("NOT_FOUND", "发货记录不存在或无权访问");
  return toPlainJson(shipment);
}

async function queryKitReadiness(client: PrismaClient, args: QueryArgs, user: McpUser) {
  if (!canExecuteKitCheck(user.role)) {
    throw new McpToolError("FORBIDDEN", "当前用户无权执行齐套检查");
  }
  const productionOrderId = text(args, "productionOrderId");
  const order = await client.productionOrder.findFirst({
    where: { id: productionOrderId, deletedAt: null },
    select: {
      id: true,
      orderNo: true,
      warehouseId: true,
      status: true,
      quantity: true,
      bomVersionSnapshot: true,
    },
  });
  if (!order) throw new McpToolError("NOT_FOUND", "生产工单不存在");
  if (order.status !== "ISSUED") {
    throw new McpToolError("INVALID_STATE", "只有已发布且未作废的生产工单可以执行齐套检查");
  }
  const materials = await client.productionOrderMaterial.findMany({
    where: { productionOrderId: order.id },
    select: {
      materialId: true,
      materialCodeSnapshot: true,
      materialNameSnapshot: true,
      materialSpecSnapshot: true,
      unitSnapshot: true,
      perUnitQuantity: true,
      requiredQuantity: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  if (materials.length === 0) throw new McpToolError("INVALID_STATE", "生产工单缺少物料快照，无法执行齐套检查");

  const materialIds = materials.map((item) => item.materialId);
  const [inventories, openPurchaseOrders, issuedDocuments, returnedDocuments] = await Promise.all([
    client.inventory.findMany({
      where: { warehouseId: order.warehouseId, materialId: { in: materialIds } },
      select: { materialId: true, quantity: true },
    }),
    client.purchaseOrder.findMany({
      where: { deletedAt: null, status: { in: ["ORDERED", "PARTIAL_RECEIVED"] } },
      select: { id: true },
    }),
    client.stockOut.findMany({
      where: { productionOrderId: order.id },
      select: { items: { select: { materialId: true, quantity: true } } },
    }),
    client.stockIn.findMany({
      where: { productionOrderId: order.id },
      select: { items: { select: { materialId: true, quantity: true } } },
    }),
  ]);
  const purchaseItems = openPurchaseOrders.length > 0
    ? await client.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: { in: openPurchaseOrders.map((item) => item.id) },
          materialId: { in: materialIds },
        },
        select: { materialId: true, quantity: true, receivedQuantity: true },
      })
    : [];

  const availableByMaterial = new Map(inventories.map((item) => [item.materialId, new Prisma.Decimal(item.quantity)]));
  const inTransitByMaterial = new Map<string, Prisma.Decimal>();
  for (const item of purchaseItems) {
    const inTransit = new Prisma.Decimal(item.quantity).sub(item.receivedQuantity);
    inTransitByMaterial.set(item.materialId, (inTransitByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(inTransit));
  }
  const issuedByMaterial = new Map<string, Prisma.Decimal>();
  const returnedByMaterial = new Map<string, Prisma.Decimal>();
  for (const document of issuedDocuments) {
    for (const item of document.items) {
      issuedByMaterial.set(item.materialId, (issuedByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(item.quantity));
    }
  }
  for (const document of returnedDocuments) {
    for (const item of document.items) {
      returnedByMaterial.set(item.materialId, (returnedByMaterial.get(item.materialId) || new Prisma.Decimal(0)).add(item.quantity));
    }
  }

  const detail = materials.map((item) => {
    const availableQty = availableByMaterial.get(item.materialId) || new Prisma.Decimal(0);
    const quantities = calculateKitMaterialQuantities(
      item.requiredQuantity,
      issuedByMaterial.get(item.materialId) || new Prisma.Decimal(0),
      returnedByMaterial.get(item.materialId) || new Prisma.Decimal(0),
      availableQty,
    );
    return {
      materialId: item.materialId,
      code: item.materialCodeSnapshot,
      name: item.materialNameSnapshot,
      spec: item.materialSpecSnapshot,
      unit: item.unitSnapshot,
      perUnitQty: Number(item.perUnitQuantity),
      orderQty: Number(order.quantity),
      totalRequiredQty: Number(item.requiredQuantity),
      requiredQty: quantities.remainingQty.toNumber(),
      remainingRequiredQty: quantities.remainingQty.toNumber(),
      availableQty: availableQty.toNumber(),
      shortageQty: quantities.shortageQty.toNumber(),
      inTransitQty: (inTransitByMaterial.get(item.materialId) || new Prisma.Decimal(0)).toNumber(),
    };
  });
  const shortageCount = detail.filter((item) => item.shortageQty > 0).length;
  return {
    productionOrderId: order.id,
    orderNo: order.orderNo,
    warehouseId: order.warehouseId,
    bomVersionSnapshot: order.bomVersionSnapshot,
    status: shortageCount > 0 ? "SHORTAGE" : "SUFFICIENT",
    shortageCount,
    totalMaterials: detail.length,
    persisted: false,
    detail,
  };
}

async function querySuppliers(client: PrismaClient, args: QueryArgs) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const where: any = { deletedAt: null, ...(dateRange(args) ? { updatedAt: dateRange(args) } : {}) };
  if (typeof args.active === "boolean") where.isActive = args.active;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { contactName: { contains: search } },
      { phone: { contains: search } },
      { mainCategory: { contains: search } },
    ];
  }
  const [items, total] = await Promise.all([
    client.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        contactName: true,
        phone: true,
        wechat: true,
        email: true,
        address: true,
        mainCategory: true,
        remark: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      skip,
      take: pageSize,
    }),
    client.supplier.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function querySupplier(client: PrismaClient, args: QueryArgs, user: McpUser) {
  if (!canManageSuppliers(user.role)) {
    throw new McpToolError("FORBIDDEN", "当前用户无权查看供应商详情");
  }
  const supplier = await client.supplier.findFirst({
    where: { id: text(args, "id"), deletedAt: null },
    select: {
      id: true,
      name: true,
      contactName: true,
      phone: true,
      wechat: true,
      email: true,
      address: true,
      mainCategory: true,
      remark: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!supplier) throw new McpToolError("NOT_FOUND", "供应商不存在");
  return toPlainJson(supplier);
}

async function queryPurchaseOrders(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const status = text(args, "status");
  const supplierId = text(args, "supplierId");
  const where: any = { deletedAt: null, ...(dateRange(args) ? { orderDate: dateRange(args) } : {}) };
  if (user.role === "WAREHOUSE") where.status = { in: ["ORDERED", "PARTIAL_RECEIVED", "RECEIVED"] };
  if (status) where.status = status;
  if (supplierId) where.supplierId = supplierId;
  if (search) {
    where.OR = [
      { orderNo: { contains: search } },
      { supplierNameSnapshot: { contains: search } },
    ];
  }
  const [orders, total] = await Promise.all([
    client.purchaseOrder.findMany({
      where,
      select: {
        id: true,
        orderNo: true,
        supplierId: true,
        supplierNameSnapshot: true,
        orderDate: true,
        expectedArrivalDate: true,
        status: true,
        remark: true,
        sourceProductionOrderId: true,
        sourceKitCheckId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    client.purchaseOrder.count({ where }),
  ]);
  const summaries = orders.length > 0
    ? await client.purchaseOrderItem.groupBy({
        by: ["purchaseOrderId"],
        where: { purchaseOrderId: { in: orders.map((order) => order.id) } },
        _count: { _all: true },
        _sum: { amount: true },
      })
    : [];
  const summaryByOrderId = new Map(summaries.map((summary) => [summary.purchaseOrderId, summary]));
  return paginated(orders.map((order) => ({
    ...order,
    itemCount: summaryByOrderId.get(order.id)?._count._all || 0,
    totalAmount: summaryByOrderId.get(order.id)?._sum.amount || new Prisma.Decimal(0),
  })), total, page, pageSize);
}

async function queryPurchaseOrder(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const where: Prisma.PurchaseOrderWhereInput = { id: text(args, "id"), deletedAt: null };
  if (user.role === "WAREHOUSE") {
    where.status = { in: ["ORDERED", "PARTIAL_RECEIVED", "RECEIVED"] };
  }
  const order = await client.purchaseOrder.findFirst({
    where,
    select: {
      id: true,
      orderNo: true,
      supplierId: true,
      supplierNameSnapshot: true,
      orderDate: true,
      expectedArrivalDate: true,
      status: true,
      remark: true,
      sourceProductionOrderId: true,
      sourceKitCheckId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!order) throw new McpToolError("NOT_FOUND", "采购订单不存在或无权访问");
  const [items, supplier] = await Promise.all([
    client.purchaseOrderItem.findMany({
      where: { purchaseOrderId: order.id },
      select: {
        id: true,
        materialId: true,
        materialCodeSnapshot: true,
        materialNameSnapshot: true,
        materialSpecSnapshot: true,
        quantity: true,
        unitPrice: true,
        amount: true,
        receivedQuantity: true,
        needArrivalDate: true,
        requiredDeliveryDate: true,
        latestPromisedDate: true,
        estimatedShipDate: true,
        actualShipDate: true,
        actualArrivalDate: true,
        deliveryStatus: true,
        responsibleId: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
    client.supplier.findFirst({
      where: { id: order.supplierId, deletedAt: null },
      select: { id: true, name: true, contactName: true, phone: true, isActive: true },
    }),
  ]);
  return toPlainJson({ ...order, items, supplier });
}

const inventoryMaterialSelect = {
  id: true,
  name: true,
  code: true,
  spec: true,
  unit: true,
  safetyStock: true,
  standardPrice: true,
  supplier: true,
  category: { select: { id: true, name: true, warningThreshold: true } },
} as const;

function inventoryThreshold(material: {
  safetyStock: Prisma.Decimal | null;
  category: { warningThreshold: Prisma.Decimal | null } | null;
}) {
  if (material.safetyStock !== null) return Number(material.safetyStock);
  if (material.category?.warningThreshold !== null && material.category?.warningThreshold !== undefined) {
    return Number(material.category.warningThreshold);
  }
  return null;
}

async function queryInventory(client: PrismaClient, args: QueryArgs) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const warehouseId = text(args, "warehouseId");
  const categoryId = text(args, "categoryId");
  const materialWhere: Prisma.MaterialWhereInput = {
    deletedAt: null,
    isActive: true,
    ...(categoryId ? { categoryId } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }] } : {}),
  };
  const inventoryUpdatedAt = dateRange(args);
  const where: Prisma.InventoryWhereInput = {
    ...(inventoryUpdatedAt ? { updatedAt: inventoryUpdatedAt } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    material: materialWhere,
  };
  const select = {
    id: true,
    warehouseId: true,
    materialId: true,
    quantity: true,
    totalAmount: true,
    avgPrice: true,
    updatedAt: true,
    warehouse: { select: { id: true, name: true, code: true } },
    material: { select: inventoryMaterialSelect },
  } as const;

  if (args.alertOnly === true) {
    const thresholdMaterials = await client.material.findMany({
      where: {
        ...materialWhere,
        AND: [
          {
            OR: [
              { safetyStock: { not: null } },
              { safetyStock: null, category: { warningThreshold: { not: null } } },
            ],
          },
          {
            inventories: {
              some: {
                ...(warehouseId ? { warehouseId } : {}),
                ...(inventoryUpdatedAt ? { updatedAt: inventoryUpdatedAt } : {}),
              },
            },
          },
        ],
      },
      select: { id: true, safetyStock: true, category: { select: { warningThreshold: true } } },
      orderBy: { id: "asc" },
      take: INVENTORY_ALERT_MATERIAL_LIMIT + 1,
    });
    if (thresholdMaterials.length > INVENTORY_ALERT_MATERIAL_LIMIT) {
      throw new McpToolError("QUERY_SCOPE_TOO_LARGE", "库存预警候选物料超过 500 条，请增加仓库或搜索条件后重试");
    }
    const alertConditions: Prisma.InventoryWhereInput[] = thresholdMaterials.flatMap((material) => {
      const threshold = inventoryThreshold(material);
      return threshold === null ? [] : [{ materialId: material.id, quantity: { lte: threshold } }];
    });
    const alertWhere: Prisma.InventoryWhereInput = {
      ...where,
      ...(alertConditions.length > 0 ? { OR: alertConditions } : { materialId: { in: [] } }),
    };
    const [items, total] = await Promise.all([
      client.inventory.findMany({ where: alertWhere, select, orderBy: { materialId: "asc" }, skip, take: pageSize }),
      client.inventory.count({ where: alertWhere }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  const [items, total] = await Promise.all([
    client.inventory.findMany({ where, select, orderBy: { materialId: "asc" }, skip, take: pageSize }),
    client.inventory.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function queryStockDocuments(client: PrismaClient, args: QueryArgs) {
  const { page, pageSize, skip } = pagination(args);
  const warehouseId = text(args, "warehouseId");
  const productionOrderId = text(args, "productionOrderId");
  const purchaseOrderId = text(args, "purchaseOrderId");
  const search = text(args, "search");
  const commonWhere: any = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(productionOrderId ? { productionOrderId } : {}),
    ...(dateRange(args) ? { createdAt: dateRange(args) } : {}),
    ...(search ? {
      OR: [
        { batchNo: { contains: search } },
        { items: { some: { OR: [{ materialCodeSnapshot: { contains: search } }, { materialNameSnapshot: { contains: search } }] } } },
      ],
    } : {}),
  };
  const itemSelect = {
    id: true,
    materialId: true,
    quantity: true,
    materialCodeSnapshot: true,
    materialNameSnapshot: true,
    materialSpecSnapshot: true,
    unitSnapshot: true,
    warehouseSnapshot: true,
    beforeQty: true,
    afterQty: true,
    sortOrder: true,
  } as const;
  if (args.direction === "IN") {
    const where: Prisma.StockInWhereInput = {
      ...commonWhere,
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
    };
    const [items, total] = await Promise.all([
      client.stockIn.findMany({
        where,
        select: {
          id: true,
          batchNo: true,
          warehouseId: true,
          purchaseOrderId: true,
          productionOrderId: true,
          type: true,
          remark: true,
          confirmedById: true,
          confirmedAt: true,
          createdAt: true,
          warehouse: { select: { id: true, name: true, code: true } },
          items: { select: { ...itemSelect, unitPrice: true, amount: true, purchaseOrderItemId: true }, orderBy: { sortOrder: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      client.stockIn.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  }
  if (purchaseOrderId) throw new McpToolError("INVALID_ARGUMENT", "出库单不支持采购订单筛选");
  const where: Prisma.StockOutWhereInput = commonWhere;
  const [items, total] = await Promise.all([
    client.stockOut.findMany({
      where,
      select: {
        id: true,
        batchNo: true,
        warehouseId: true,
        productionOrderId: true,
        type: true,
        remark: true,
        confirmedById: true,
        confirmedAt: true,
        createdAt: true,
        warehouse: { select: { id: true, name: true, code: true } },
        items: { select: itemSelect, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    client.stockOut.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

async function queryStockMovements(client: PrismaClient, args: QueryArgs) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const where: Prisma.StockMovementWhereInput = {
    ...(dateRange(args) ? { createdAt: dateRange(args) } : {}),
    ...(search ? {
      OR: [
        { refType: { contains: search } },
        { refId: { contains: search } },
        { material: { OR: [{ code: { contains: search } }, { name: { contains: search } }] } },
      ],
    } : {}),
  };
  for (const key of ["warehouseId", "materialId", "type", "refType", "refId"] as const) {
    const value = text(args, key);
    if (value) (where as Record<string, unknown>)[key] = value;
  }
  const [items, total] = await Promise.all([
    client.stockMovement.findMany({
      where,
      select: {
        id: true,
        warehouseId: true,
        materialId: true,
        type: true,
        quantity: true,
        beforeQty: true,
        afterQty: true,
        refType: true,
        refId: true,
        remark: true,
        createdAt: true,
        warehouse: { select: { id: true, name: true, code: true } },
        material: { select: { id: true, name: true, code: true, spec: true, unit: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    client.stockMovement.count({ where }),
  ]);
  return paginated(items, total, page, pageSize);
}

const bomItemSelect = {
  id: true,
  materialId: true,
  quantity: true,
  level: true,
  parentItemId: true,
  sortOrder: true,
  material: {
    select: {
      id: true,
      code: true,
      name: true,
      spec: true,
      unit: true,
      standardPrice: true,
      category: { select: { id: true, name: true } },
    },
  },
} as const;

async function productsById(client: PrismaClient, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, unknown>();
  const products = await client.product.findMany({
    where: { id: { in: [...new Set(productIds)] } },
    select: {
      id: true,
      model: true,
      productType: true,
      isActive: true,
      translations: { where: { language: "ZH" }, select: { name: true }, take: 1 },
    },
  });
  return new Map(products.map((product) => [product.id, product]));
}

async function queryBoms(client: PrismaClient, args: QueryArgs) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const productId = text(args, "productId");
  const matchedProducts = search
    ? await client.product.findMany({
        where: { isActive: true, OR: [{ model: { contains: search } }, { translations: { some: { name: { contains: search } } } }] },
        select: { id: true },
        take: 100,
      })
    : [];
  const where: Prisma.BomHeaderWhereInput = {
    ...(dateRange(args) ? { updatedAt: dateRange(args) } : {}),
    ...(productId ? { productId } : {}),
    ...(typeof args.active === "boolean" ? { isActive: args.active } : {}),
    ...(search ? { OR: [{ version: { contains: search } }, { productId: { in: matchedProducts.map((item) => item.id) } }] } : {}),
  };
  const [boms, total] = await Promise.all([
    client.bomHeader.findMany({
      where,
      select: { id: true, productId: true, version: true, isActive: true, remark: true, supersedesId: true, createdAt: true, updatedAt: true, items: { select: bomItemSelect, orderBy: { sortOrder: "asc" } } },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      skip,
      take: pageSize,
    }),
    client.bomHeader.count({ where }),
  ]);
  const productMap = await productsById(client, boms.map((bom) => bom.productId));
  return paginated(boms.map((bom) => ({ ...bom, product: productMap.get(bom.productId) || null })), total, page, pageSize);
}

async function queryBom(client: PrismaClient, args: QueryArgs, user: McpUser) {
  if (!canManageBom(user.role)) throw new McpToolError("FORBIDDEN", "当前用户无权查看用料清单详情");
  const bom = await client.bomHeader.findFirst({
    where: { id: text(args, "id") },
    select: { id: true, productId: true, version: true, isActive: true, remark: true, supersedesId: true, createdAt: true, updatedAt: true, items: { select: bomItemSelect, orderBy: { sortOrder: "asc" } } },
  });
  if (!bom) throw new McpToolError("NOT_FOUND", "整机用料清单不存在");
  const productMap = await productsById(client, [bom.productId]);
  return toPlainJson({ ...bom, product: productMap.get(bom.productId) || null });
}

async function queryProductionOrders(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const { page, pageSize, skip } = pagination(args);
  const search = text(args, "search");
  const status = text(args, "status");
  const where: Prisma.ProductionOrderWhereInput = {
    deletedAt: null,
    isCurrent: true,
    ...(dateRange(args) ? { createdAt: dateRange(args) } : {}),
    ...(status ? { status: status as Prisma.EnumProductionOrderStatusFilter } : {}),
    ...(search ? { OR: [{ orderNo: { contains: search } }, { contractNoSnapshot: { contains: search } }, { productModelSnapshot: { contains: search } }, { productNameSnapshot: { contains: search } }] } : {}),
  };
  if (user.role === "PURCHASE") {
    const [orders, total] = await Promise.all([
      client.productionOrder.findMany({
        where,
        select: {
          id: true,
          orderNo: true,
          productModelSnapshot: true,
          productNameSnapshot: true,
          quantity: true,
          plannedDate: true,
          status: true,
          kitCheckResults: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, shortageCount: true, totalMaterials: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      client.productionOrder.count({ where }),
    ]);
    return paginated(orders.map(({ kitCheckResults, ...order }) => ({
      ...order,
      latestKitCheckResult: kitCheckResults[0] || null,
    })), total, page, pageSize);
  }
  const [orders, total] = await Promise.all([
    client.productionOrder.findMany({
      where,
      select: {
        id: true,
        orderNo: true,
        contractId: true,
        contractNoSnapshot: true,
        productId: true,
        productModelSnapshot: true,
        productNameSnapshot: true,
        quantity: true,
        bomId: true,
        bomVersionSnapshot: true,
        warehouseId: true,
        plannedDate: true,
        deliveryDateSnapshot: true,
        kitCheckStatus: true,
        kitCheckRequired: true,
        lastKitCheckedAt: true,
        responsibleId: true,
        status: true,
        version: true,
        remark: true,
        createdAt: true,
        updatedAt: true,
        kitCheckResults: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, shortageCount: true, totalMaterials: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    client.productionOrder.count({ where }),
  ]);
  const items = orders.map(({ kitCheckResults, ...order }) => ({
    ...order,
    latestKitCheckResult: kitCheckResults[0] || null,
  }));
  return paginated(items, total, page, pageSize);
}

async function queryProductionOrder(client: PrismaClient, args: QueryArgs, user: McpUser) {
  const id = text(args, "id");
  if (user.role === "PURCHASE") {
    const order = await client.productionOrder.findFirst({
      where: { id, deletedAt: null, isCurrent: true },
      select: {
        id: true,
        orderNo: true,
        productModelSnapshot: true,
        productNameSnapshot: true,
        quantity: true,
        plannedDate: true,
        bomId: true,
        warehouseId: true,
        status: true,
        kitCheckResults: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, shortageCount: true, detail: true, createdAt: true } },
      },
    });
    if (!order) throw new McpToolError("NOT_FOUND", "生产工单不存在");
    const latestKitCheckResult = order.kitCheckResults[0] || null;
    const detail = Array.isArray(latestKitCheckResult?.detail) ? latestKitCheckResult.detail as Array<Record<string, unknown>> : [];
    return toPlainJson({
      id: order.id,
      orderNo: order.orderNo,
      productModelSnapshot: order.productModelSnapshot,
      productNameSnapshot: order.productNameSnapshot,
      quantity: order.quantity,
      plannedDate: order.plannedDate,
      bomId: order.bomId,
      warehouseId: order.warehouseId,
      status: order.status,
      latestKitCheckResult,
      shortageItems: latestKitCheckResult?.status === "SHORTAGE"
        ? detail.filter((item) => Number(item.shortageQty) > 0).map((item) => ({ materialId: item.materialId, code: item.code, name: item.name, spec: item.spec || null, unit: item.unit, shortageQty: item.shortageQty }))
        : [],
    });
  }
  const order = await client.productionOrder.findFirst({
    where: { id, deletedAt: null, isCurrent: true },
    select: {
      id: true,
      orderNo: true,
      contractId: true,
      contractNoSnapshot: true,
      isStockOrder: true,
      sequenceInContract: true,
      productId: true,
      productModelSnapshot: true,
      productNameSnapshot: true,
      quantity: true,
      bomId: true,
      bomVersionSnapshot: true,
      configuration: true,
      warehouseId: true,
      plannedDate: true,
      deliveryDateSnapshot: true,
      kitCheckStatus: true,
      kitCheckRequired: true,
      lastKitCheckedAt: true,
      responsibleId: true,
      status: true,
      version: true,
      supersedesId: true,
      isCurrent: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      materials: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          materialId: true,
          materialCodeSnapshot: true,
          materialNameSnapshot: true,
          materialSpecSnapshot: true,
          unitSnapshot: true,
          perUnitQuantity: true,
          requiredQuantity: true,
          bomVersionSnapshot: true,
          sortOrder: true,
        },
      },
      kitCheckResults: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, shortageCount: true, totalMaterials: true, detail: true, triggerType: true, createdAt: true } },
      changeRequests: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, reason: true, approvalRemark: true, createdAt: true, approvedAt: true, rejectedAt: true } },
    },
  });
  if (!order) throw new McpToolError("NOT_FOUND", "生产工单不存在");
  const [warehouse, responsible] = await Promise.all([
    client.warehouse.findUnique({ where: { id: order.warehouseId }, select: { id: true, name: true, code: true, isActive: true } }),
    order.responsibleId ? client.user.findUnique({ where: { id: order.responsibleId }, select: { id: true, name: true, isActive: true } }) : null,
  ]);
  return toPlainJson({ ...order, warehouse, productionResponsible: responsible, latestKitCheckResult: order.kitCheckResults[0] || null });
}

export function createPrismaMcpDataSource(client: PrismaClient, auditClient: PrismaClient = client): McpDataSource {
  return {
    async findUser(userId) {
      const user = await client.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          isActive: true,
          role: true,
          region: true,
          territories: true,
          viewScope: true,
        },
      });
      if (!user) return null;
      return {
        ...user,
        role: user.role as McpUser["role"],
        territories: parseTerritories(user.territories),
      };
    },

    async execute(toolName, args, user) {
      if (!canCallMcpBusinessTool(toolName, user.role)) {
        throw new McpToolError("FORBIDDEN", "当前角色无权调用此工具");
      }
      if (toolName.startsWith("erp_") && !canViewERP(user.role)) {
        throw new McpToolError("FORBIDDEN", "当前用户无权访问 ERP");
      }
      if (
        toolName === "erp_purchase_orders_list"
        && user.role === "WAREHOUSE"
        && text(args, "status")
        && !["ORDERED", "PARTIAL_RECEIVED", "RECEIVED"].includes(text(args, "status"))
      ) {
        throw new McpToolError("FORBIDDEN", "仓库管理只能查看已提交或已批准的采购订单");
      }
      switch (toolName) {
        case "crm_customers_list":
          return queryCustomers(client, args, user);
        case "crm_customer_get":
          return queryCustomer(client, args, user);
        case "crm_customer_follows_list":
          return queryCustomerFollows(client, args, user);
        case "crm_products_list":
          return queryProducts(client, args);
        case "crm_product_get":
          return queryProduct(client, args);
        case "crm_contracts_list":
          return queryContracts(client, args, user);
        case "crm_contract_get":
          return queryContract(client, args, user);
        case "crm_shipments_list":
          return queryShipments(client, args, user);
        case "crm_shipment_get":
          return queryShipment(client, args, user);
        case "erp_kit_check":
          return queryKitReadiness(client, args, user);
        case "erp_suppliers_list":
          return querySuppliers(client, args);
        case "erp_supplier_get":
          return querySupplier(client, args, user);
        case "erp_purchase_orders_list":
          return queryPurchaseOrders(client, args, user);
        case "erp_purchase_order_get":
          return queryPurchaseOrder(client, args, user);
        case "erp_inventory_list":
          return queryInventory(client, args);
        case "erp_stock_documents_list":
          return queryStockDocuments(client, args);
        case "erp_stock_movements_list":
          return queryStockMovements(client, args);
        case "erp_boms_list":
          return queryBoms(client, args);
        case "erp_bom_get":
          return queryBom(client, args, user);
        case "erp_production_orders_list":
          return queryProductionOrders(client, args, user);
        case "erp_production_order_get":
          return queryProductionOrder(client, args, user);
        default:
          throw new McpToolError("UNKNOWN_TOOL", "未知或未启用的 MCP 工具");
      }
    },

    async writeAudit(input: McpAuditInput) {
      const result = await auditClient.operationLog.createMany({
        data: [{
          userId: input.userId,
          action: "MCP_CALL",
          entityType: "McpRequest",
          entityId: input.requestId,
          afterData: toPlainJson({
            requestId: input.requestId,
            apiKeyName: input.apiKeyName,
            method: input.method,
            toolName: input.toolName || null,
            success: input.success,
            statusCode: input.statusCode,
            durationMs: input.durationMs,
            rejectionReason: input.rejectionReason || null,
            createdAt: input.createdAt,
          }),
        }],
      });
      if (result.count !== 1) throw new Error("MCP audit insert did not affect exactly one row");
    },
  };
}

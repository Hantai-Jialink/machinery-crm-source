import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { McpDataSource, McpUser } from "@/lib/mcp/application";

const page = z.number().int().min(1).default(1).describe("页码，从 1 开始");
const pageSize = z.number().int().min(1).max(100).default(20).describe("每页数量，最大 100");
const search = z.string().trim().max(100).optional().describe("名称、编号或型号关键词");
const id = z.string().trim().min(1).max(100).describe("记录 ID");

const listInput = z.object({ page, pageSize, search });
const idInput = z.object({ id });
const whoAmIInput = z.object({}).strict();

export const MCP_IDENTITY_TOOL_NAME = "dachuan_identity_who_am_i";

const toolDefinitions = [
  {
    name: "crm_customers_list",
    title: "查询客户列表",
    description: "按当前用户业务线和负责省市范围查询未删除客户。",
    schema: listInput.extend({
      status: z.string().trim().max(40).optional(),
      province: z.string().trim().max(40).optional(),
      city: z.string().trim().max(40).optional(),
      assignedUserId: z.string().trim().max(100).optional(),
    }),
  },
  { name: "crm_customer_get", title: "查询客户详情", description: "按 ID 查询有权访问的客户详情。", schema: idInput },
  {
    name: "crm_customer_follows_list",
    title: "查询客户跟进记录",
    description: "按客户 ID 查询有权访问的跟进记录。",
    schema: z.object({ customerId: id, page, pageSize }),
  },
  {
    name: "crm_products_list",
    title: "查询产品列表",
    description: "查询产品主数据和中文资料。",
    schema: listInput.extend({
      productType: z.enum(["MAIN", "OPTIONAL"]).optional(),
    }),
  },
  { name: "crm_product_get", title: "查询产品详情", description: "按 ID 查询产品及多语言资料。", schema: idInput },
  {
    name: "crm_contracts_list",
    title: "查询合同列表",
    description: "按客户权限范围查询未删除合同。",
    schema: listInput.extend({
      status: z.enum(["DRAFT", "SIGNED", "CANCELLED", "COMPLETED", "ARCHIVED"]).optional(),
      paymentStatus: z.enum(["UNPAID", "PARTIAL_PAID", "PAID"]).optional(),
      customerId: z.string().trim().max(100).optional(),
    }),
  },
  { name: "crm_contract_get", title: "查询合同详情", description: "按 ID 查询有权访问的合同、明细和回款摘要。", schema: idInput },
  {
    name: "crm_shipments_list",
    title: "查询发货记录",
    description: "按客户权限范围查询发货记录和发货状态。",
    schema: listInput.extend({
      status: z.enum(["NOT_SHIPPED", "PARTIAL_SHIPPED", "SHIPPED"]).optional(),
      contractId: z.string().trim().max(100).optional(),
      customerId: z.string().trim().max(100).optional(),
      dateStart: z.string().date().optional(),
      dateEnd: z.string().date().optional(),
    }),
  },
  { name: "crm_shipment_get", title: "查询发货详情", description: "按 ID 查询有权访问的发货记录。", schema: idInput },
  {
    name: "erp_suppliers_list",
    title: "查询供应商列表",
    description: "按 ERP 角色权限查询未删除供应商。",
    schema: listInput.extend({ active: z.boolean().optional() }),
  },
  { name: "erp_supplier_get", title: "查询供应商详情", description: "按 ID 查询供应商。", schema: idInput },
  {
    name: "erp_purchase_orders_list",
    title: "查询采购订单列表",
    description: "查询采购订单；仓库角色只能查看已提交、部分到货或全部到货订单。",
    schema: listInput.extend({
      status: z.enum(["DRAFT", "ORDERED", "PARTIAL_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
      supplierId: z.string().trim().max(100).optional(),
    }),
  },
  { name: "erp_purchase_order_get", title: "查询采购订单详情", description: "按 ID 查询采购订单、明细和供应商快照。", schema: idInput },
  {
    name: "erp_inventory_list",
    title: "查询库存",
    description: "按仓库、物料或预警状态查询当前库存。",
    schema: listInput.extend({
      warehouseId: z.string().trim().max(100).optional(),
      categoryId: z.string().trim().max(100).optional(),
      alertOnly: z.boolean().default(false),
    }),
  },
  {
    name: "erp_stock_documents_list",
    title: "查询出入库单",
    description: "查询正式入库单或出库单及其明细。",
    schema: z.object({
      direction: z.enum(["IN", "OUT"]),
      page,
      pageSize,
      warehouseId: z.string().trim().max(100).optional(),
      productionOrderId: z.string().trim().max(100).optional(),
      purchaseOrderId: z.string().trim().max(100).optional(),
    }),
  },
  {
    name: "erp_stock_movements_list",
    title: "查询库存流水",
    description: "查询库存变动流水，不接受任意 SQL 或字段表达式。",
    schema: z.object({
      page,
      pageSize,
      warehouseId: z.string().trim().max(100).optional(),
      materialId: z.string().trim().max(100).optional(),
      type: z.enum(["STOCK_IN", "STOCK_OUT", "CHECK_ADJUST", "TRANSFER_IN", "TRANSFER_OUT"]).optional(),
      refType: z.string().trim().max(60).optional(),
      refId: z.string().trim().max(100).optional(),
    }),
  },
  {
    name: "erp_boms_list",
    title: "查询整机用料清单",
    description: "查询整机用料清单版本和用料明细。",
    schema: listInput.extend({
      productId: z.string().trim().max(100).optional(),
      active: z.boolean().optional(),
    }),
  },
  { name: "erp_bom_get", title: "查询用料清单详情", description: "按 ID 查询完整用料层级；沿用现有 BOM 详情权限。", schema: idInput },
  {
    name: "erp_production_orders_list",
    title: "查询生产工单列表",
    description: "查询当前版本生产工单；采购角色仅返回采购所需字段。",
    schema: listInput.extend({
      status: z.enum(["DRAFT", "ISSUED", "CHANGE_PENDING", "CANCELLED"]).optional(),
    }),
  },
  { name: "erp_production_order_get", title: "查询生产工单详情", description: "按 ID 查询生产工单；采购角色返回受限视图。", schema: idInput },
  {
    name: "erp_kit_check",
    title: "只读齐套检查",
    description: "根据工单冻结用料和当前仓库库存即时计算齐套结果，不保存结果、不扣减库存。",
    schema: z.object({ productionOrderId: id }),
  },
] as const;

export const MCP_TOOL_NAMES = toolDefinitions.map((tool) => tool.name);

function plainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, current) => typeof current === "bigint" ? current.toString() : current));
}

function resultEnvelope(requestId: string, toolName: string, generatedAt: Date, data: unknown) {
  return {
    ok: true,
    data: plainJson(data),
    meta: {
      requestId,
      tool: toolName,
      generatedAt: generatedAt.toISOString(),
    },
    error: null,
  };
}

function errorEnvelope(requestId: string, toolName: string, generatedAt: Date, error: unknown) {
  const safeError = error instanceof McpToolError
    ? { code: error.code, message: error.message }
    : { code: "INTERNAL_ERROR", message: "工具执行失败" };
  return {
    ok: false,
    data: null,
    meta: {
      requestId,
      tool: toolName,
      generatedAt: generatedAt.toISOString(),
    },
    error: safeError,
  };
}

export function createMcpToolErrorResult(
  requestId: string,
  toolName: string,
  generatedAt: Date,
  error: unknown,
) {
  const envelope = errorEnvelope(requestId, toolName, generatedAt, error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
    structuredContent: envelope,
    isError: true,
  };
}

export class McpToolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "McpToolError";
  }
}

export function registerMcpTools(
  server: McpServer,
  context: {
    requestId: string;
    user: McpUser;
    dataSource: McpDataSource;
    now: () => Date;
    includeBusinessTools?: boolean;
  },
) {
  server.registerTool(
    MCP_IDENTITY_TOOL_NAME,
    {
      title: "验证当前 ERP 身份",
      description: "返回服务端依据短期用户断言并实时查询数据库得到的当前用户身份、角色和负责范围。不得传入 userId、角色或区域。",
      inputSchema: whoAmIInput,
      annotations: {
        title: "验证当前 ERP 身份",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const envelope = resultEnvelope(context.requestId, MCP_IDENTITY_TOOL_NAME, context.now(), {
        userId: context.user.id,
        isActive: context.user.isActive !== false,
        role: context.user.role,
        region: context.user.region,
        territories: context.user.territories,
        viewScope: context.user.viewScope,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
        structuredContent: envelope,
      };
    },
  );

  if (context.includeBusinessTools === false) return;

  for (const definition of toolDefinitions) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.schema,
        annotations: {
          title: definition.title,
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const data = await context.dataSource.execute(
            definition.name,
            args as Record<string, unknown>,
            context.user,
          );
          const envelope = resultEnvelope(context.requestId, definition.name, context.now(), data);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
            structuredContent: envelope,
          };
        } catch (error) {
          return createMcpToolErrorResult(context.requestId, definition.name, context.now(), error);
        }
      },
    );
  }
}

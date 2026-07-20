import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { McpDataSource, McpUser } from "@/lib/mcp/application";
import {
  canExecuteKitCheck,
  canManageBom,
  canManageSuppliers,
  canViewERP,
  roleRequiresRegionScope,
} from "@/lib/erp-roles";

const page = z.number().int().min(1).default(1).describe("页码，从 1 开始");
const pageSize = z.number().int().min(1).max(100).default(20).describe("每页数量，最大 100");
const search = z.string().trim().max(100).optional().describe("名称、编号或型号关键词");
const id = z.string().trim().min(1).max(100).describe("记录 ID");
const dateStart = z.string().date().optional().describe("开始日期，YYYY-MM-DD");
const dateEnd = z.string().date().optional().describe("结束日期，YYYY-MM-DD");
const MAX_DATE_RANGE_DAYS = 366;

function strictListInput(extra: Record<string, z.ZodTypeAny> = {}) {
  return z.object({ page, pageSize, search, dateStart, dateEnd, ...extra }).strict().superRefine((value, context) => {
    if (Boolean(value.dateStart) !== Boolean(value.dateEnd)) {
      context.addIssue({ code: "custom", message: "dateStart 和 dateEnd 必须同时提供" });
      return;
    }
    if (!value.dateStart || !value.dateEnd) return;
    const start = Date.parse(`${value.dateStart}T00:00:00.000Z`);
    const end = Date.parse(`${value.dateEnd}T00:00:00.000Z`);
    const rangeDays = (end - start) / 86_400_000;
    if (rangeDays < 0 || rangeDays > MAX_DATE_RANGE_DAYS) {
      context.addIssue({ code: "custom", message: `日期范围必须在 0 到 ${MAX_DATE_RANGE_DAYS} 天内` });
    }
  });
}

const idInput = z.object({ id }).strict();
const whoAmIInput = z.object({}).strict();

export const MCP_IDENTITY_TOOL_NAME = "dachuan_identity_who_am_i";

const ALL_ROLES: McpUser["role"][] = ["SUPER_ADMIN", "SALES", "FOREIGN_TRADE", "PURCHASE", "WAREHOUSE"];
const CRM_READ_ROLES = ALL_ROLES.filter((role) => role === "SUPER_ADMIN" || roleRequiresRegionScope(role));
const ERP_VIEW_ROLES = ALL_ROLES.filter(canViewERP);
const SUPPLIER_DETAIL_ROLES = ALL_ROLES.filter(canManageSuppliers);
const BOM_DETAIL_ROLES = ALL_ROLES.filter(canManageBom);
const KIT_CHECK_ROLES = ALL_ROLES.filter(canExecuteKitCheck);

const toolDefinitions = [
  {
    name: "crm_customers_list",
    allowedRoles: CRM_READ_ROLES,
    title: "查询客户列表",
    description: "查询当前用户可查看的客户记录。",
    schema: strictListInput({
      status: z.string().trim().max(40).optional(),
      province: z.string().trim().max(40).optional(),
      city: z.string().trim().max(40).optional(),
      assignedUserId: z.string().trim().max(100).optional(),
    }),
  },
  { name: "crm_customer_get", allowedRoles: CRM_READ_ROLES, title: "查询客户详情", description: "查询当前用户可查看的客户详情。", schema: idInput },
  {
    name: "crm_customer_follows_list",
    allowedRoles: CRM_READ_ROLES,
    title: "查询客户跟进记录",
    description: "查询当前用户可查看的客户跟进记录。",
    schema: strictListInput({ customerId: id }),
  },
  {
    name: "crm_products_list",
    allowedRoles: CRM_READ_ROLES,
    title: "查询产品列表",
    description: "查询产品主数据和中文资料。",
    schema: strictListInput({
      productType: z.enum(["MAIN", "OPTIONAL"]).optional(),
    }),
  },
  { name: "crm_product_get", allowedRoles: CRM_READ_ROLES, title: "查询产品详情", description: "按 ID 查询产品及多语言资料。", schema: idInput },
  {
    name: "crm_contracts_list",
    allowedRoles: CRM_READ_ROLES,
    title: "查询合同列表",
    description: "查询当前用户可查看的合同记录。",
    schema: strictListInput({
      status: z.enum(["DRAFT", "SIGNED", "CANCELLED", "COMPLETED", "ARCHIVED"]).optional(),
      paymentStatus: z.enum(["UNPAID", "PARTIAL_PAID", "PAID"]).optional(),
      customerId: z.string().trim().max(100).optional(),
    }),
  },
  { name: "crm_contract_get", allowedRoles: CRM_READ_ROLES, title: "查询合同详情", description: "查询当前用户可查看的合同详情和回款摘要。", schema: idInput },
  {
    name: "crm_shipments_list",
    allowedRoles: CRM_READ_ROLES,
    title: "查询发货记录",
    description: "查询当前用户可查看的发货记录和状态。",
    schema: strictListInput({
      status: z.enum(["NOT_SHIPPED", "PARTIAL_SHIPPED", "SHIPPED"]).optional(),
      contractId: z.string().trim().max(100).optional(),
      customerId: z.string().trim().max(100).optional(),
    }),
  },
  { name: "crm_shipment_get", allowedRoles: CRM_READ_ROLES, title: "查询发货详情", description: "查询当前用户可查看的发货详情。", schema: idInput },
  {
    name: "erp_suppliers_list",
    allowedRoles: ERP_VIEW_ROLES,
    title: "查询供应商列表",
    description: "查询当前用户可查看的供应商记录。",
    schema: strictListInput({ active: z.boolean().optional() }),
  },
  { name: "erp_supplier_get", allowedRoles: SUPPLIER_DETAIL_ROLES, title: "查询供应商详情", description: "按 ID 查询供应商。", schema: idInput },
  {
    name: "erp_purchase_orders_list",
    allowedRoles: ERP_VIEW_ROLES,
    title: "查询采购订单列表",
    description: "查询当前用户可查看的采购订单。",
    schema: strictListInput({
      status: z.enum(["DRAFT", "ORDERED", "PARTIAL_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
      supplierId: z.string().trim().max(100).optional(),
    }),
  },
  { name: "erp_purchase_order_get", allowedRoles: ERP_VIEW_ROLES, title: "查询采购订单详情", description: "按 ID 查询采购订单、明细和供应商快照。", schema: idInput },
  {
    name: "erp_inventory_list",
    allowedRoles: ERP_VIEW_ROLES,
    title: "查询库存",
    description: "按仓库、物料或预警状态查询当前库存。",
    schema: strictListInput({
      warehouseId: z.string().trim().max(100).optional(),
      categoryId: z.string().trim().max(100).optional(),
      alertOnly: z.boolean().default(false),
    }),
  },
  {
    name: "erp_stock_documents_list",
    allowedRoles: ERP_VIEW_ROLES,
    title: "查询出入库单",
    description: "查询正式入库单或出库单及其明细。",
    schema: strictListInput({
      direction: z.enum(["IN", "OUT"]),
      warehouseId: z.string().trim().max(100).optional(),
      productionOrderId: z.string().trim().max(100).optional(),
      purchaseOrderId: z.string().trim().max(100).optional(),
    }),
  },
  {
    name: "erp_stock_movements_list",
    allowedRoles: ERP_VIEW_ROLES,
    title: "查询库存流水",
    description: "查询当前用户可查看的库存变动流水。",
    schema: strictListInput({
      warehouseId: z.string().trim().max(100).optional(),
      materialId: z.string().trim().max(100).optional(),
      type: z.enum(["STOCK_IN", "STOCK_OUT", "CHECK_ADJUST", "TRANSFER_IN", "TRANSFER_OUT"]).optional(),
      refType: z.string().trim().max(60).optional(),
      refId: z.string().trim().max(100).optional(),
    }),
  },
  {
    name: "erp_boms_list",
    allowedRoles: ERP_VIEW_ROLES,
    title: "查询整机用料清单",
    description: "查询整机用料清单版本和用料明细。",
    schema: strictListInput({
      productId: z.string().trim().max(100).optional(),
      active: z.boolean().optional(),
    }),
  },
  { name: "erp_bom_get", allowedRoles: BOM_DETAIL_ROLES, title: "查询用料清单详情", description: "查询当前用户可查看的完整用料层级。", schema: idInput },
  {
    name: "erp_production_orders_list",
    allowedRoles: ERP_VIEW_ROLES,
    title: "查询生产工单列表",
    description: "查询当前用户可查看的生产工单。",
    schema: strictListInput({
      status: z.enum(["DRAFT", "ISSUED", "CHANGE_PENDING", "CANCELLED"]).optional(),
    }),
  },
  { name: "erp_production_order_get", allowedRoles: ERP_VIEW_ROLES, title: "查询生产工单详情", description: "查询当前用户可查看的生产工单详情。", schema: idInput },
  {
    name: "erp_kit_check",
    allowedRoles: KIT_CHECK_ROLES,
    title: "只读齐套检查",
    description: "根据工单冻结用料和当前仓库库存即时计算齐套结果，不保存结果、不扣减库存。",
    schema: z.object({ productionOrderId: id }).strict(),
  },
] as const;

export const MCP_TOOL_NAMES = toolDefinitions.map((tool) => tool.name);

export const MCP_TOOL_ROLE_MATRIX = Object.fromEntries(
  toolDefinitions.map((tool) => [tool.name, [...tool.allowedRoles]]),
) as Record<(typeof MCP_TOOL_NAMES)[number], McpUser["role"][]>;

export function canCallMcpBusinessTool(toolName: string, role: McpUser["role"]) {
  const definition = toolDefinitions.find((tool) => tool.name === toolName);
  return Boolean(definition && (definition.allowedRoles as readonly string[]).includes(role));
}

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

function executeWithTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new McpToolError("QUERY_TIMEOUT", "查询超过允许等待时间"));
    }, timeoutMs);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function registerMcpTools(
  server: McpServer,
  context: {
    requestId: string;
    user: McpUser | null;
    dataSource: McpDataSource;
    now: () => Date;
    includeBusinessTools?: boolean;
    queryTimeoutMs?: number;
  },
) {
  server.registerTool(
    MCP_IDENTITY_TOOL_NAME,
    {
      title: "验证当前 ERP 身份",
      description: "显示当前登录用户可用于本次只读会话的身份摘要。",
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
      if (!context.user) {
        return createMcpToolErrorResult(
          context.requestId,
          MCP_IDENTITY_TOOL_NAME,
          context.now(),
          new McpToolError("IDENTITY_REQUIRED", "工具调用需要当前登录用户身份"),
        );
      }
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
        if (!context.user) {
          return createMcpToolErrorResult(
            context.requestId,
            definition.name,
            context.now(),
            new McpToolError("IDENTITY_REQUIRED", "工具调用需要当前登录用户身份"),
          );
        }
        try {
          if (!canCallMcpBusinessTool(definition.name, context.user.role)) {
            throw new McpToolError("FORBIDDEN", "当前角色无权调用此工具");
          }
          const data = await executeWithTimeout(context.dataSource.execute(
            definition.name,
            args as Record<string, unknown>,
            context.user,
          ), context.queryTimeoutMs ?? 5_000);
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

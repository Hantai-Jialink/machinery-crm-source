# DachuanPro CRM/ERP 统一只读 MCP

服务入口为 `POST https://mcp.dachuan.pro/api/mcp`，传输协议优先使用 Streamable HTTP。服务以现有 Next.js Route Handler 运行，查询只经过固定 Prisma 调用；没有 SQL、资源写入或审批类工具。

## 工具目录

| 模块 | 工具 |
| --- | --- |
| 客户及跟进 | `crm_customers_list`、`crm_customer_get`、`crm_customer_follows_list` |
| 产品 | `crm_products_list`、`crm_product_get` |
| 合同 | `crm_contracts_list`、`crm_contract_get` |
| 发货 | `crm_shipments_list`、`crm_shipment_get` |
| 供应商 | `erp_suppliers_list`、`erp_supplier_get` |
| 采购订单 | `erp_purchase_orders_list`、`erp_purchase_order_get` |
| 库存及出入库 | `erp_inventory_list`、`erp_stock_documents_list`、`erp_stock_movements_list` |
| 整机用料清单 | `erp_boms_list`、`erp_bom_get` |
| 生产工单 | `erp_production_orders_list`、`erp_production_order_get` |
| 齐套检查 | `erp_kit_check` |

全部工具都声明 `readOnlyHint: true`、`destructiveHint: false`。分页默认 20、最大 100。工具参数由 Zod 固定校验，不接受字段表达式、SQL、模型名或自定义排序。

## 鉴权与数据范围

每个 API Key 在 `MCP_API_KEYS_JSON` 中绑定一个现有 `User.id`。服务端只保存 Key 的 SHA-256，每次请求重新读取该用户；禁用用户会立即失效。

- `SALES`、`FOREIGN_TRADE`：客户、跟进、合同和发货沿用业务线及省市负责范围。
- `SUPER_ADMIN`：沿用现有全局视图；BOM 详情和即时齐套检查仍仅管理员可用。
- `PURCHASE`：可访问 ERP，生产工单只返回采购所需视图。
- `WAREHOUSE`：采购订单只允许既有仓库可见状态；其他 ERP 查询沿用现有查看权限。
- 产品沿用当前登录用户可查询的公共产品数据。

工具结果统一为：

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "...",
    "tool": "crm_customers_list",
    "generatedAt": "2026-07-17T08:00:00.000Z"
  },
  "error": null
}
```

## API Key 生成

在源码目录执行：

```powershell
corepack pnpm mcp:keygen
```

把输出的 `KEY_HASH` 写入服务端 `MCP_API_KEYS_JSON`，把 `API_KEY` 仅写入 FastGPT。不要把明文 Key 提交到 Git、镜像或日志。

## FastGPT 4.15.1 接入

1. 在 FastGPT 的 MCP Server 配置中选择 HTTP/SSE 类型入口。
2. 地址填写 `https://mcp.dachuan.pro/api/mcp`。
3. 自定义请求头填写 `Authorization: Bearer <API_KEY>`。
4. 保存后刷新工具列表，应发现本页列出的 21 个工具。
5. 先调用 `crm_products_list` 或该 Key 角色允许的列表工具验证；业务查询错误会出现在统一返回的 `error` 字段。

FastGPT 4.15.1 的实现会先尝试 Streamable HTTP；仅在特定 4xx 响应时回退旧 SSE，因此该地址无需另设 SSE 端点。反向代理需允许 POST，并保留 Authorization、Host 和 `MCP-Protocol-Version` 请求头。

## 审计

每个 MCP 协议请求写入现有 `OperationLog`：`action=MCP_CALL`、`entityType=McpRequest`。记录请求 ID、Key 名称、协议方法、工具名、参数字段名、成功状态、HTTP 状态和耗时；不记录参数值或明文 API Key，避免客户搜索词、ID 等业务信息进入日志。来源或 Key 被拒绝时，以 `MCP_AUDIT_USER_ID` 指定的既有用户作为日志外键归属。已认证调用若审计写入失败，会返回 503 且不交付查询结果。

部署和回滚见 [DEPLOYMENT.md](./DEPLOYMENT.md)，验证证据见 [TEST_REPORT.md](./TEST_REPORT.md)。

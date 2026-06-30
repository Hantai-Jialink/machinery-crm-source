# DachuanPro ERP 板块规划设计书 v2.1

> **文档版本**: v2.1（v2 + Claude 技术评审修正）  
> **日期**: 2026-06-24  
> **状态**: 待厂内讨论确认  
> **参考**: Claude v1 战略框架 + Hermes/DeepSeek v2 施工图 + Claude 技术评审（7条修正）  
> **本次修正**: 详见附录A「v2→v2.1 修正清单」

---

## 〇、设计原则

1. **长在 CRM 上，不另起炉灶** —— 复用登录权限、区域隔离、审计日志、软删除(deletedAt)、Decimal 金额规范
2. **先跑通最小闭环，再逐步扩展** —— 每期独立上线，能立刻用
3. **BOM 是骨架，必须早建** —— 第 2 期就做，不做等到后期返工
4. **明确不做清单** —— 避免过度建设、踩坑
5. **明细走独立表，不走 JSON** —— 和现有 CRM 的 ContractItem / QuoteItem 风格保持一致
6. **库存流水可追溯** —— 每一笔加减都留痕（StockMovement），审计和盘点有据可查

---

## 一、背景 & 现状盘点

### 1.1 现有 CRM 的家底（ERP 要对接的）

| 现有模块 | ERP 怎么用 |
|----------|-----------|
| Customer 客户 | 销售端，ERP 不动 |
| Product 产品（+ 多语言、出厂价） | **成品主数据**，BOM 的顶层——一台 CK5116 |
| CustomerQuote / Contract | **生产任务来源**——签了合同 → 生成生产工单 |
| ContractPayment 收款 | 应收已有，ERP 补「应付」与之对称 |
| Shipment 发货 | 生产完成 → 发货，已有，衔接即可 |
| User（角色/区域隔离） | 扩展新角色：仓管、采购、生产 |
| OperationLog / 审计 | 所有 ERP 操作沿用同一套日志 |

### 1.2 现有 CRM 的表设计规范（ERP 必须对齐）

| 规范 | 现有做法 | ERP 对齐要求 |
|------|---------|------------|
| 明细存储 | ContractItem / QuoteItem（独立表） | StockInItem / StockOutItem / StockCheckItem（独立表） |
| 软删除 | `deletedAt` 字段 | 统一用 `deletedAt` |
| 金额 | `Decimal(12,2)` | 统一用 `Decimal(12,2)` |
| 操作日志 | `writeOperationLog`（beforeData/afterData JSON） | 沿用 |
| 权限 | Role 枚举 + 接口层校验 | 扩展 Role 枚举 |

### 1.3 为什么做 ERP

CRM 管「跟谁签了多少合同」（对外的线）。
ERP 要补「该做什么→缺什么料→买什么→做到哪了→花了多少钱」（对内的线）。

衔接点：**签了合同 = 要生产的任务来源**；**Product + BOM = 物料需求来源**。

---

## 二、不做 / 暂缓清单

| 项目 | 决策 | 原因 |
|------|------|------|
| 完整 MES（设备联机采集信号） | ❌ 不做 | 投入大、维护难、小批量 ROI 低 |
| 从零自建总账会计 | ❌ 不做 | 对接金蝶/用友，避免财务合规坑 |
| 高级排程 APS | ❌ 暂缓 | 先人工排，数据沉淀够再说 |
| 总账/凭证系统 | ❌ 不做 | 导出现有财务软件处理 |

---

## 三、分期建设路线

```
第 1 期              第 2 期              第 3 期              第 4 期              第 5 期
物料主数据           BOM + 库存           采购 + 供应商        生产 + 齐套           成本核算
+ 铸件库存           + 出入库闭环          + 收货入库           + 车间报工            + 应付账款
（地基）             （骨架立起来）        （进销存闭环）       （全链条打通）         （算清每台利润）

每期独立上线，下期在上期基础上叠加，不返工。
```

| 期数 | 重点 | 能做什么 | 前置依赖 |
|:--:|------|---------|:--:|
| 1 | 物料 + 库存 | 录铸件、出入库、盘点、看库存金额 | — |
| 2 | BOM | 建机床物料清单、库存运转闭环 | 第1期 |
| 3 | 采购 + 供应商 | 按 BOM 算缺料→下采购单→收货入库 | 第2期 |
| 4 | 生产 + 齐套 | 合同→工单→齐套检查→车间报工 | 第3期 |
| 5 | 成本 + 应付 | 单台毛利、供应商付款 | 第4期 |

---

## 四、第 1 期：物料主数据 + 铸件库存（本期实施）

### 4.1 目标

把数控插床、插齿机的铸件录入系统，知道有什么、有多少、值多少钱。
仓管员日常可独立操作出入库，无需超级管理员权限。

### 4.2 功能范围

| 功能 | 说明 |
|------|------|
| 物料分类管理 | 机身铸件 / 工作台铸件 / 立柱铸件 / 滑枕铸件 / 刀架铸件 / 其他铸件 / 外购件 / 电气件 / 标准件 |
| 物料（铸件）档案 | 编号（图号）、名称、规格、材质、标准单价、单位 |
| 仓库管理 | 1 个仓库（预留多仓库扩展） |
| 初始库存录入 | 现有盘点数量录进去（支持 Excel 批量导入） |
| 入库操作 | 采购入库、退料入库、盘盈入库、初始入库 |
| 出库操作 | 生产领料出库、盘亏出库 |
| 库存查询 | 按物料编号/名称/分类筛选，显示数量 + 金额，低于安全库存标红预警 |
| 库存流水 | 每一笔出入库自动记录（谁、什么时候、什么物料、加/减多少、变化前后数量） |
| 库存盘点 | 创建盘点单 → 录实盘数 → 自动算差异 → 生成盘盈盘亏报告 |

### 4.3 新增数据表（11 张）

> 命名约定：ERP 表用 `erp_` 前缀，示例：实际表名 `erp_warehouses`

#### 4.3.1 Warehouse（仓库）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| name | String | 仓库名称 |
| code | String (unique) | 仓库编码 |
| address | String? | 仓库地址 |
| isActive | Boolean | 启用状态（默认 true） |

#### 4.3.2 MaterialCategory（物料分类）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| name | String | 分类名称 |
| code | String | 编码 |
| parentId | String? | 上级分类（树形结构） |
| sortOrder | Int | 排序 |

**预置分类**：机身铸件 | 工作台铸件 | 立柱铸件 | 滑枕铸件 | 刀架铸件 | 其他铸件 | 外购件 | 电气件 | 标准件 | 其他

> 注：虽然第 1 期聚焦铸件，但从第 2 期 BOM 开始就需要外购件/电气件/标准件，故分类从第一天就预置全。

#### 4.3.3 Material（物料主表 —— ERP 核心基础）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| code | String (unique) | 物料编号（图号），如 CK5116-01-01 |
| name | String | 名称，如「机身铸件」 |
| categoryId | String | 分类 |
| spec | String? | 规格 |
| materialType | String? | 材质，如 HT250 |
| drawingNo | String? | 图号 |
| unit | String | 单位（件/套/kg/m） |
| standardPrice | Decimal(12,2)? | 标准单价（元） |
| safetyStock | Decimal(10,2)? | 安全库存预警线 |
| remark | String? | 备注 |
| isActive | Boolean | 启用/停用（默认 true） |
| deletedAt | DateTime? | 软删除标记（统一 CRM 规范） |

> **设计要点**：Material 表字段结构从一开始就支持所有物料类型（铸件/外购件/电气件/标准件），不等到后期改表。

#### 4.3.4 Inventory（库存台账）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| warehouseId | String | 仓库 |
| materialId | String | 物料 |
| quantity | Decimal(10,2) | 当前数量 |
| totalAmount | Decimal(12,2) | 总金额 |
| avgPrice | Decimal(12,2)? | 移动平均价 |

> 每个 (warehouseId, materialId) 组合只有一条记录（唯一约束）。

#### 4.3.5 StockIn（入库单头）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| batchNo | String (unique) | 单号，如 SI-20260624-001 |
| warehouseId | String | 仓库 |
| type | enum | PURCHASE / RETURN / INITIAL / CHECK_IN / OTHER |
| remark | String? | 备注 |
| createdById | String | 操作人 |
| createdAt | DateTime | 创建时间 |

#### 4.3.6 StockInItem（入库单明细 —— 🆕 v2.1 新增，替代 JSON）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| stockInId | String | 所属入库单 |
| materialId | String | 物料 |
| quantity | Decimal(10,2) | 数量 |
| unitPrice | Decimal(12,2) | 单价 |
| amount | Decimal(12,2) | 金额 |
| sortOrder | Int | 排序 |

> **设计理由**：和现有 CRM 的 ContractItem、QuoteItem 保持一致——独立明细表，可查询、可索引、可追溯。避免了 JSON 大字段的"存进去查不出来"问题。

#### 4.3.7 StockOut（出库单头）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| batchNo | String (unique) | 单号，如 SO-20260624-001 |
| warehouseId | String | 仓库 |
| type | enum | PRODUCTION / CHECK_OUT / OTHER |
| remark | String? | 备注 |
| createdById | String | 操作人 |
| createdAt | DateTime | 创建时间 |

#### 4.3.8 StockOutItem（出库单明细 —— 🆕 v2.1 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| stockOutId | String | 所属出库单 |
| materialId | String | 物料 |
| quantity | Decimal(10,2) | 数量 |
| sortOrder | Int | 排序 |

#### 4.3.9 StockCheck（盘点单头）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| batchNo | String (unique) | 单号，如 SC-20261231-001 |
| warehouseId | String | 仓库 |
| checkDate | DateTime | 盘点日期 |
| status | enum | DRAFT / CHECKING / DONE |
| createdById | String | 操作人 |
| createdAt | DateTime | 创建时间 |

#### 4.3.10 StockCheckItem（盘点单明细 —— 🆕 v2.1 新增，替代 JSON）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| stockCheckId | String | 所属盘点单 |
| materialId | String | 物料 |
| bookQty | Decimal(10,2) | 账面数量 |
| actualQty | Decimal(10,2)? | 实盘数量（DRAFT 时可为空） |
| diffQty | Decimal(10,2)? | 差异数量（盘盈/盘亏） |
| diffAmount | Decimal(12,2)? | 差异金额 |
| reason | String? | 差异原因 |

#### 4.3.11 StockMovement（库存流水总账 —— 🆕 v2.1 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| warehouseId | String | 仓库 |
| materialId | String | 物料 |
| type | enum | STOCK_IN / STOCK_OUT / CHECK_ADJUST |
| quantity | Decimal(10,2) | 变化量（正=加，负=减） |
| beforeQty | Decimal(10,2) | 变化前数量 |
| afterQty | Decimal(10,2) | 变化后数量 |
| refType | String | 来源单据类型（StockIn / StockOut / StockCheck） |
| refId | String | 来源单据 ID |
| remark | String? | 备注 |
| createdById | String | 操作人 |
| createdAt | DateTime | 创建时间 |

> **设计理由**：这是审计和盘点的命根子。和银行卡交易明细一个道理——不只告诉你"当前余额 100"，而是告诉你"怎么从 100 变成 80 的"。每条流水自动生成，不可手动修改。

### 4.4 新增页面（6 个）

| 路径 | 页面 | 核心功能 |
|------|------|---------|
| `/erp/materials` | 物料管理 | 增删改查、分类树筛选、搜索、Excel 批量导入 |
| `/erp/inventory` | 库存总览 | 库存列表（数量+金额）、安全库存预警标红、流水记录 |
| `/erp/stock-in` | 入库单 | 新建入库单（选物料→填数量单价→提交）、历史列表 |
| `/erp/stock-out` | 出库单 | 新建出库单（选物料→填数量→校验库存→提交）、历史列表 |
| `/erp/stock-check` | 盘点单 | 新建盘点、录实盘数、自动算差异、生成盘盈盘亏报告 |
| `/erp/warehouse` | 仓库设置 | 仓库增删改（初期 1 个，扩展预留） |

### 4.5 权限

**新增角色**：`WAREHOUSE`（仓管员），加入 Role 枚举。

| 操作 | SUPER_ADMIN | WAREHOUSE | SALES / FOREIGN_TRADE |
|------|:--:|:--:|:--:|
| 查看库存 | ✅ 全部 | ✅ 本仓库 | ✅ 只读 |
| 入库 / 出库 | ✅ | ✅ | ❌ |
| 盘点操作 | ✅ | ✅ | ❌ |
| Excel 批量导入 | ✅ | ✅ | ❌ |
| 管理用户 / 权限 | ✅ | ❌ | ❌ |
| 管理客户 / 合同 | ✅ | ❌ | ✅ |

### 4.6 核心业务逻辑

**入库（原子操作，防并发）：**

```
① 校验物料 + 仓库存在
② 创建入库单 + 明细（StockIn + StockInItem）
③ 事务内：
   a. Inventory.quantity += 入库数量（Prisma increment，不是读出来再加）
   b. Inventory.totalAmount += 入库金额
   c. StockMovement 写流水（beforeQty → afterQty）
④ 记录操作日志
```

**出库（原子操作，防并发）：**

```
① 校验物料 + 仓库存在
② 事务内：
   a. 查当前库存 → 校验 quantity >= 出库量
   b. Inventory.quantity -= 出库数量（Prisma decrement/increment 负值）
   c. StockMovement 写流水
③ 创建出库单 + 明细
④ 低于安全库存 → 前端预警提示
⑤ 记录操作日志
```

**盘点：**

```
① 创建盘点单（DRAFT）→ 自动抓取当前库存作为账面数（bookQty）
② 仓管员逐条录实盘数（actualQty）（CHECKING 状态）
③ 提交 → 自动计算 diffQty = actualQty - bookQty
④ 盘盈/盘亏：更新 Inventory + 写 StockMovement（CHECK_ADJUST 类型）
⑤ 生成盘点报告（DONE）
```

### 4.7 后端 API（约 18 个端点）

| 模块 | 端点 | 方法 | 说明 |
|------|------|:--:|------|
| 物料 | `/api/erp/materials` | GET/POST | 列表+搜索 / 新增 |
| 物料 | `/api/erp/materials/[id]` | GET/PUT/DELETE | 详情 / 编辑 / 软删除 |
| 物料 | `/api/erp/materials/import` | POST | Excel 批量导入 |
| 物料分类 | `/api/erp/material-categories` | GET | 分类树 |
| 仓库 | `/api/erp/warehouses` | GET/POST | 列表 / 新增 |
| 仓库 | `/api/erp/warehouses/[id]` | PUT/DELETE | 编辑 / 删除 |
| 库存 | `/api/erp/inventory` | GET | 库存总览（含筛选+预警） |
| 入库 | `/api/erp/stock-in` | GET/POST | 列表 / 创建 |
| 入库 | `/api/erp/stock-in/[id]` | GET | 详情（含明细） |
| 出库 | `/api/erp/stock-out` | GET/POST | 列表 / 创建 |
| 出库 | `/api/erp/stock-out/[id]` | GET | 详情（含明细） |
| 盘点 | `/api/erp/stock-checks` | GET/POST | 列表 / 创建（DRAFT） |
| 盘点 | `/api/erp/stock-checks/[id]` | GET/PUT | 详情 / 提交（CHECKING→DONE） |
| 流水 | `/api/erp/stock-movements` | GET | 库存流水查询 |

---

## 五、第 2 期：BOM（物料清单）+ 库存正式运转

### 5.1 为什么第 2 期就要做 BOM

BOM（Bill of Materials）是机床 ERP 的骨架：
- 没有 BOM，不知道一台机床用哪些铸件 → 库存数据只是散列表
- 没有 BOM，算不出缺什么料 → 采购没法精准
- 没有 BOM，成本核算无从谈起

### 5.2 新增表

#### BomHeader（BOM 主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| productId | String | 关联 CRM 的 Product（机床型号） |
| version | String | 版本号，如 v1.0 |
| isActive | Boolean | 是否当前有效版本 |
| remark | String? | 备注 |

#### BomItem（BOM 明细）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String UUID | 主键 |
| bomId | String | 所属 BOM |
| materialId | String | 物料 |
| quantity | Decimal(10,2) | 单台用量 |
| level | Int | 层级（支持多级 BOM，如部件→零件） |
| parentItemId | String? | 上级物料（多级 BOM 时用） |
| sortOrder | Int | 排序 |

### 5.3 示例

```
CK5116 数控插床 (Product)
├── 机身铸件 CK5116-01-01 ×1
├── 工作台铸件 CK5116-01-02 ×1
├── 立柱铸件 CK5116-01-03 ×1
├── 滑枕铸件 CK5116-01-04 ×1
├── 刀架铸件 CK5116-01-05 ×1
├── 变速箱部件 (子 BOM)
│   ├── 变速箱铸件 ×1
│   ├── 齿轮 ×4
│   └── 轴承 ×4
└── ...
```

### 5.4 新增页面

| 路径 | 页面 | 功能 |
|------|------|------|
| `/erp/bom` | BOM 管理 | 按产品查看/编辑 BOM，版本管理 |

---

## 六、第 3 期：供应商 + 采购 + 收货入库

### 6.1 新增表

| 表 | 说明 |
|----|------|
| Supplier | 供应商（可复用 Customer 表结构） |
| PurchaseOrder | 采购订单头 |
| PurchaseOrderItem | 采购明细 |
| GoodsReceipt | 收货入库单（关联 PurchaseOrder → StockIn） |

### 6.2 核心流程

```
BOM 展开算需求 → 对比库存 → 缺料清单 → 生成采购申请 → 采购订单 → 收货入库 → 库存自动增加
```

---

## 七、第 4 期：生产工单 + 齐套检查 + 轻量报工

### 7.1 新增表

| 表 | 说明 |
|----|------|
| ProductionOrder | 生产工单（从合同明细生成） |
| KittingCheck | 齐套检查结果 |
| WorkReport | 车间报工（工序+开工/完工+操作人+时间） |

### 7.2 核心流程

```
合同签订 → 一键生成生产工单 → BOM 展开 × 库存 → 齐套检查
                                              ↓
                              缺料 → 驱动采购 ↗    齐套 → 开工 → 报工 → 完工
```

### 7.3 齐套检查的价值

机床厂最值钱的功能。一台 CK5116 有几十个铸件，少一个就装不了。
系统自动告诉你「缺哪几个铸件，差多少，谁在供」，比人工翻本子快百倍。

---

## 八、第 5 期：成本核算 + 应付账款

- 按单台机床归集物料成本 + 外协费 + 人工
- 对比合同价，算真实毛利
- 应付账款管理（对供应商的付款）
- 与 CRM 收款模块左右对称

---

## 九、技术实施要点

### 9.1 目录结构

```
src/
├── app/(app)/erp/          ← ERP 页面
│   ├── materials/
│   ├── inventory/
│   ├── stock-in/
│   ├── stock-out/
│   ├── stock-check/
│   ├── warehouse/
│   └── bom/                （第 2 期）
├── components/erp/          ← ERP 组件
├── lib/erp/                 ← ERP 业务逻辑
└── app/api/erp/             ← ERP API
    ├── materials/
    ├── inventory/
    ├── stock-in/
    ├── stock-out/
    ├── stock-checks/
    ├── stock-movements/
    └── warehouses/
```

### 9.2 安全规范（每期遵守）

1. **权限**：扩展现有 Role 枚举，接口层校验，沿用区域隔离
2. **审计**：所有增删改走 `writeOperationLog`
3. **删除**：软删除，使用 `deletedAt` 字段（和 CRM 统一）
4. **金额**：`Decimal(12,2)`
5. **数量**：`Decimal(10,2)`（支持小数，如钢材按 kg 计）
6. **并发**：库存加减用 Prisma `increment`，在事务内操作
7. **结构**：Prisma 模型 + 迁移 + API + 页面，风格统一

### 9.3 第 1 期施工预估

| 工作块 | 预估 Agent 工时 | 说明 |
|------|:--:|------|
| Prisma Schema + 迁移 | 2-3h | 11 张表 + 枚举 + 索引 + 关联 |
| API 路由（18 端点） | 4-6h | 权限校验 + 并发安全 + 事务 |
| 前端页面（6 页） | 6-8h | React 组件 + 表单 + 列表 + Excel 导入 |
| 权限中间件 | 1-2h | Role 枚举扩展 + 仓管路由守卫 |
| 侧边栏/导航 | 0.5h | 菜单项 + 路由注册 |
| 联调测试 | 2-3h | 全流程跑通 + 边角修复 |
| **合计** | **≈16-22h** | 三 Agent 并行 ≈ 6-8h 墙钟时间 |

### 9.4 多 Agent 分工

| Agent | 负责 | 工具 |
|------|------|:--:|
| Agent A | Prisma Schema + 数据库迁移 + API 路由 | Claude Code |
| Agent B | 前端页面（React 组件 + 表单 + 列表） | Codex |
| Agent C | 权限中间件 + 导航 + 代码审查 | delegate_task |
| 总调度 | 生成规格书 → 分派 → 联调验收 → 报告 | Hermes |

---

## 十、待 Ace 确认的事项

| # | 问题 | 默认方案 | 状态 |
|---|------|---------|:--:|
| ① | 铸件编号格式？ | 用工厂现有图号体系（如 CK5116-01-01） | ⏳ |
| ② | 标准单价谁来定？ | Ace 提供每个铸件的参考价 | ⏳ |
| ③ | 初始库存数量来源？ | 先盘点一次，做 Excel 批量导入 | ⏳ |
| ④ | 仓库名字？ | 「主仓库」 | ⏳ |
| ⑤ | 铸件分类是否 OK？ | 机身/工作台/立柱/滑枕/刀架/其他铸件 + 外购件/电气件/标准件 | ⏳ |
| ⑥ | 第 1 期是否包含生产领料出库？ | 做——没有出库，库存只有加没有减 | ⏳ |
| ⑦ | 侧边栏 ERP 菜单位置？ | 「产品库」下方 | ⏳ |
| ⑧ | 出库时是否需要填"领料人/用途"？ | 先不做，简单模式（只记物料+数量） | ⏳ |

---

## 十一、名词对照表

| 中文 | 英文 | 说明 |
|------|------|------|
| 物料/铸件 | Material | 原材料、铸件、零部件、外购件 |
| 物料清单 | BOM (Bill of Materials) | 一台机床由哪些物料组成 |
| 仓库 | Warehouse | 存放物料的地方 |
| 库存台账 | Inventory | 每个物料的当前数量和金额 |
| 入库单 | StockIn | 入库凭证 |
| 出库单 | StockOut | 出库凭证 |
| 盘点单 | StockCheck | 盘点核对凭证 |
| 库存流水 | StockMovement | 每一笔出入库的不可篡改记录 |
| 齐套检查 | Kitting Check | 检查是否所有零件都齐了可以装配 |
| 供应商 | Supplier | 物料供应方 |
| 采购订单 | PurchaseOrder (PO) | 向供应商下单的凭证 |
| 生产工单 | ProductionOrder | 制造一台机床的任务单 |
| BOM 展开 | BOM Explosion | 把成品展开为所有子物料的需求量 |

---

## 附录 A：v2 → v2.1 修正清单

| # | 修正项 | 严重度 | 说明 |
|---|--------|:--:|------|
| 1 | `items: Json` → 独立明细表 | 🔴 | 新增 StockInItem、StockOutItem、StockCheckItem 三张表，对齐 CRM 的 ContractItem 风格 |
| 2 | 缺少库存流水 → 新增 StockMovement | 🔴 | 每一笔出入库自动记流水，审计和盘点的命根子 |
| 3 | 缺少仓管角色 → 新增 WAREHOUSE 角色 | 🟡 | 仓管员日常可独立操作库存，无需超管权限 |
| 4 | 物料分类预置仅铸件 → 加外购件/电气件/标准件 | 🟡 | 表结构本身已通用，预置分类补全，第 2 期 BOM 无缝对接 |
| 5 | 库存更新有并发漏洞 → 改用 Prisma increment 原子操作 | 🟡 | 杜绝两人同时操作丢数据 |
| 6 | 缺少出库单独立建模 → 新增 StockOut + StockOutItem | 🟡 | 出入库对称，单据体系完整 |
| 7 | `isActive` → `deletedAt` 软删除 | 🟢 | 和 CRM 统一软删除规范 |
| 8 | quantity `Int` → `Decimal(10,2)` | 🟢 | 支持铸件按件、钢材按公斤、标准件按套 |

---

> **下一步**：Ace 和厂里同事讨论后，拍板第八章待确认事项 → Hermes 生成 Prisma Schema + API 规格书 → 三 Agent 并行施工第 1 期。

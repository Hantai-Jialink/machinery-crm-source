# DachuanPro ERP 第 1 期 — API 规格书 v1

> 配套 `prisma/schema.prisma`（ERP 13 张表）与迁移 `20260630000000_erp_phase1`。
> 路由根：`src/app/api/erp/`。所有响应统一信封：`{ ok: boolean, data?, error?, message? }`。

## 通用约定

- **认证**：所有端点要求登录（NextAuth session）。未登录 → `401`。
- **权限角色**：`SUPER_ADMIN` / `WAREHOUSE`（仓管） / `SALES` / `FOREIGN_TRADE`。
  - 写操作（入/出库、盘点、物料增删改、导入、仓库维护）：`SUPER_ADMIN` + `WAREHOUSE`。
  - 读操作（库存/物料/流水查询）：全角色（销售只读）。
  - 仓库的删除：仅 `SUPER_ADMIN`。
  - 无权限 → `403`。
- **金额** `Decimal(12,2)`，**数量** `Decimal(10,2)`；JSON 中以字符串传递避免精度丢失。
- **软删除**：物料用 `deletedAt`，查询默认 `deletedAt: null`。
- **审计**：所有增删改调用 `writeOperationLog({ action, entityType, entityId, beforeData, afterData })`。
- **并发安全**：库存加减一律在 `prisma.$transaction` 内用 `increment`/`decrement`，禁止"读出来再写回"。
- **单号生成**：`SI-YYYYMMDD-NNN`（入库）/ `SO-YYYYMMDD-NNN`（出库）/ `SC-YYYYMMDD-NNN`（盘点），当日序号在事务内取 `count+1`。

---

## 1. 物料 Materials

### 1.1 `GET /api/erp/materials` — 列表 + 搜索
- **权限**：全角色（读）
- **入参（query）**：`keyword?`（匹配 code/name/drawingNo）、`categoryId?`、`isActive?`、`page=1`、`pageSize=20`
- **出参**：`{ data: Material[], total, page, pageSize }`，每条带 `category{ id,name,code }`
- **核心 Prisma**：
  ```ts
  prisma.material.findMany({
    where: { deletedAt: null,
      ...(categoryId && { categoryId }),
      ...(keyword && { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }, { drawingNo: { contains: keyword } }] }) },
    include: { category: true },
    orderBy: { code: 'asc' }, skip, take })
  ```

### 1.2 `POST /api/erp/materials` — 新增
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参（body）**：`code*`、`name*`、`categoryId*`、`spec?`、`materialType?`、`drawingNo?`、`unit?`、`standardPrice?`、`safetyStock?`、`weight?`、`remark?`
- **出参**：`{ data: Material }`；`code` 重复 → `409`
- **核心 Prisma**：`prisma.material.create({ data })` → `writeOperationLog('CREATE','Material',id)`

### 1.3 `GET /api/erp/materials/[id]` — 详情
- **权限**：全角色（读）
- **出参**：`{ data: Material & { category, inventories[] } }`，含各仓库当前库存
- **核心 Prisma**：`findUnique({ where:{id}, include:{ category:true, inventories:{ include:{ warehouse:true } } } })`，`deletedAt!=null` → `404`

### 1.4 `PUT /api/erp/materials/[id]` — 编辑
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参**：同 1.2（均可选；`code` 改动需查重）
- **核心 Prisma**：读 before → `update({ where:{id}, data })` → `writeOperationLog('UPDATE',...,{before,after})`

### 1.5 `DELETE /api/erp/materials/[id]` — 软删除
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **业务校验**：若该物料存在库存 `quantity > 0`，拒绝删除 → `409`（提示先清库存）
- **核心 Prisma**：`update({ where:{id}, data:{ deletedAt: new Date() } })` → 审计

### 1.6 `POST /api/erp/materials/import` — Excel 批量导入
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参**：`multipart/form-data`，字段 `file`（.xlsx，sheet「物料主数据」）
- **出参**：`{ created, updated, skipped, errors: [{ row, code, reason }] }`
- **核心逻辑**：解析行 → 按 `分类` find-or-create `MaterialCategory` → 按 `code` `upsert` Material（复用 `prisma/seed-bk5030.ts` 的解析逻辑）→ 整体放入一个 `$transaction`，逐行收集错误不阻断。

---

## 2. 物料分类 Material Categories

### 2.1 `GET /api/erp/material-categories` — 分类树
- **权限**：全角色（读）
- **出参**：树形 `[{ id,name,code,sortOrder,children:[...] }]`
- **核心 Prisma**：`findMany({ orderBy:{ sortOrder:'asc' } })` 后在内存按 `parentId` 组装成树。

---

## 3. 仓库 Warehouses

### 3.1 `GET /api/erp/warehouses` — 列表
- **权限**：全角色（读）
- **入参**：`includeInactive?=false`
- **核心 Prisma**：`findMany({ where:{ ...(!includeInactive && { isActive:true }) }, orderBy:{ code:'asc' } })`

### 3.2 `POST /api/erp/warehouses` — 新增
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参**：`name*`、`code*`、`address?`、`isActive?=true`；`code` 重复 → `409`
- **核心 Prisma**：`create({ data })` → 审计

### 3.3 `PUT /api/erp/warehouses/[id]` — 编辑
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **核心 Prisma**：`update({ where:{id}, data })` → 审计

### 3.4 `DELETE /api/erp/warehouses/[id]` — 删除/停用
- **权限**：`SUPER_ADMIN`
- **业务校验**：仓库下存在库存或单据 → 不物理删除，改 `isActive:false`；否则可删
- **核心 Prisma**：有引用 `update({ data:{ isActive:false } })`，无引用 `delete()` → 审计

---

## 4. 库存 Inventory

### 4.1 `GET /api/erp/inventory` — 库存总览（筛选 + 预警）
- **权限**：全角色（读）
- **入参**：`warehouseId?`、`categoryId?`、`keyword?`、`onlyBelowSafety?=false`、`page`、`pageSize`
- **出参**：每条 `{ material{code,name,unit,safetyStock,standardPrice}, warehouse{name}, quantity, totalAmount, avgPrice, belowSafety:boolean }`
- **核心 Prisma**：
  ```ts
  prisma.inventory.findMany({
    where: { ...(warehouseId && { warehouseId }),
      material: { deletedAt: null, ...(categoryId && { categoryId }),
        ...(keyword && { OR:[{code:{contains:keyword}},{name:{contains:keyword}}] }) } },
    include: { material: { include:{ category:true } }, warehouse: true } })
  // belowSafety = safetyStock!=null && quantity < safetyStock；onlyBelowSafety 时内存过滤
  ```

---

## 5. 入库 Stock In

### 5.1 `GET /api/erp/stock-in` — 列表
- **权限**：全角色（读）
- **入参**：`warehouseId?`、`type?`、`dateFrom?`、`dateTo?`、`page`、`pageSize`
- **出参**：单头列表 + `itemCount`、`totalAmount`（聚合明细）
- **核心 Prisma**：`stockIn.findMany({ where, include:{ items:true, warehouse:true }, orderBy:{ createdAt:'desc' } })`

### 5.2 `POST /api/erp/stock-in` — 创建入库（原子事务）
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参**：`warehouseId*`、`type*`、`remark?`、`items*: [{ materialId, quantity, unitPrice }]`
- **出参**：`{ data: StockIn & { items } }`
- **核心逻辑（防并发）**：
  ```ts
  await prisma.$transaction(async (tx) => {
    // 校验仓库 + 所有物料存在且未删除
    const batchNo = await genBatchNo(tx, 'SI');
    const stockIn = await tx.stockIn.create({ data:{ batchNo, warehouseId, type, remark, createdById,
      items:{ create: items.map((it,i)=>({ materialId:it.materialId, quantity:it.quantity, unitPrice:it.unitPrice,
        amount: D(it.quantity).mul(it.unitPrice), sortOrder:i*10 })) } }, include:{ items:true } });
    for (const it of items) {
      const inv = await tx.inventory.upsert({ where:{ warehouseId_materialId:{ warehouseId, materialId:it.materialId } },
        create:{ warehouseId, materialId:it.materialId, quantity:0, totalAmount:0 }, update:{} });
      const before = inv.quantity;
      const updated = await tx.inventory.update({ where:{ id:inv.id },
        data:{ quantity:{ increment: it.quantity }, totalAmount:{ increment: D(it.quantity).mul(it.unitPrice) } } });
      await tx.stockMovement.create({ data:{ warehouseId, materialId:it.materialId, type:'STOCK_IN',
        quantity: it.quantity, beforeQty: before, afterQty: updated.quantity,
        refType:'StockIn', refId: stockIn.id, createdById } });
    }
    return stockIn;
  });
  // 事务后 writeOperationLog('CREATE','StockIn',id)
  ```

### 5.3 `GET /api/erp/stock-in/[id]` — 详情（含明细）
- **权限**：全角色（读）
- **核心 Prisma**：`findUnique({ where:{id}, include:{ items:{ include:{ material:true } }, warehouse:true } })`

---

## 6. 出库 Stock Out

### 6.1 `GET /api/erp/stock-out` — 列表
- **权限**：全角色（读）；入参/出参同 5.1（type 取值 `PRODUCTION/CHECK_OUT/OTHER`）

### 6.2 `POST /api/erp/stock-out` — 创建出库（原子事务 + 库存校验）
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参**：`warehouseId*`、`type*`、`remark?`、`items*: [{ materialId, quantity }]`
- **出参**：`{ data: StockOut & { items }, warnings: [{ materialId, quantity, safetyStock }] }`（低于安全库存的预警）
- **核心逻辑（防并发 + 防超卖）**：
  ```ts
  await prisma.$transaction(async (tx) => {
    const batchNo = await genBatchNo(tx, 'SO');
    for (const it of items) {
      const inv = await tx.inventory.findUnique({ where:{ warehouseId_materialId:{ warehouseId, materialId:it.materialId } } });
      if (!inv || D(inv.quantity).lt(it.quantity)) throw new HttpError(409, `库存不足: ${it.materialId}`);
    }
    const stockOut = await tx.stockOut.create({ data:{ batchNo, warehouseId, type, remark, createdById,
      items:{ create: items.map((it,i)=>({ materialId:it.materialId, quantity:it.quantity, sortOrder:i*10 })) } }, include:{ items:true } });
    for (const it of items) {
      const inv = await tx.inventory.findUnique({ where:{ warehouseId_materialId:{ warehouseId, materialId:it.materialId } } });
      const before = inv.quantity;
      const avg = inv.avgPrice ?? (D(inv.quantity).gt(0) ? D(inv.totalAmount).div(inv.quantity) : D(0));
      const updated = await tx.inventory.update({ where:{ id:inv.id },
        data:{ quantity:{ decrement: it.quantity }, totalAmount:{ decrement: D(it.quantity).mul(avg) } } });
      await tx.stockMovement.create({ data:{ warehouseId, materialId:it.materialId, type:'STOCK_OUT',
        quantity: D(it.quantity).neg(), beforeQty: before, afterQty: updated.quantity,
        refType:'StockOut', refId: stockOut.id, createdById } });
    }
    return stockOut;
  });
  // 事务后比对 safetyStock 生成 warnings；writeOperationLog
  ```

### 6.3 `GET /api/erp/stock-out/[id]` — 详情（含明细）
- **权限**：全角色（读）；逻辑同 5.3

---

## 7. 盘点 Stock Check

### 7.1 `GET /api/erp/stock-checks` — 列表
- **权限**：全角色（读）；入参 `warehouseId?`、`status?`、分页

### 7.2 `POST /api/erp/stock-checks` — 创建盘点单（DRAFT，抓账面数）
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参**：`warehouseId*`、`checkDate?`、`materialIds?`（不传=全仓库物料）、`remark?`
- **核心逻辑**：
  ```ts
  await prisma.$transaction(async (tx) => {
    const batchNo = await genBatchNo(tx, 'SC');
    const invs = await tx.inventory.findMany({ where:{ warehouseId,
      ...(materialIds?.length && { materialId:{ in: materialIds } }) }, include:{ material:true } });
    return tx.stockCheck.create({ data:{ batchNo, warehouseId, checkDate: checkDate ?? new Date(),
      status:'DRAFT', remark, createdById,
      items:{ create: invs.map((iv,i)=>({ materialId: iv.materialId, bookQty: iv.quantity, sortOrder:i*10 })) } } });
  });
  ```

### 7.3 `GET /api/erp/stock-checks/[id]` — 详情（含明细 + 差异）
- **权限**：全角色（读）
- **核心 Prisma**：`findUnique({ where:{id}, include:{ items:{ include:{ material:true } }, warehouse:true } })`

### 7.4 `PUT /api/erp/stock-checks/[id]` — 录实盘数 / 提交（CHECKING → DONE）
- **权限**：`SUPER_ADMIN` / `WAREHOUSE`
- **入参**：`action: 'SAVE' | 'SUBMIT'`、`items: [{ id, actualQty, reason? }]`
- **行为**：
  - `SAVE`：状态置 `CHECKING`，仅写各明细 `actualQty`（不动库存）。
  - `SUBMIT`：算差异并调整库存（盘盈/盘亏），状态置 `DONE`，不可再改。
- **核心逻辑（SUBMIT，原子事务）**：
  ```ts
  await prisma.$transaction(async (tx) => {
    const check = await tx.stockCheck.findUnique({ where:{id}, include:{ items:{ include:{ material:true } } } });
    if (check.status === 'DONE') throw new HttpError(409,'盘点单已完成');
    for (const it of check.items) {
      const actual = bodyMap[it.id]?.actualQty ?? it.actualQty;
      const diff = D(actual).sub(it.bookQty);
      const price = it.material.standardPrice ?? D(0);
      await tx.stockCheckItem.update({ where:{id:it.id},
        data:{ actualQty:actual, diffQty:diff, diffAmount:D(diff).mul(price), reason: bodyMap[it.id]?.reason } });
      if (!D(diff).eq(0)) {
        const inv = await tx.inventory.findUnique({ where:{ warehouseId_materialId:{ warehouseId:check.warehouseId, materialId:it.materialId } } });
        const before = inv.quantity;
        const updated = await tx.inventory.update({ where:{ id:inv.id },
          data:{ quantity:{ increment: diff }, totalAmount:{ increment: D(diff).mul(price) } } });
        await tx.stockMovement.create({ data:{ warehouseId:check.warehouseId, materialId:it.materialId,
          type:'CHECK_ADJUST', quantity: diff, beforeQty: before, afterQty: updated.quantity,
          refType:'StockCheck', refId: check.id, remark: bodyMap[it.id]?.reason, createdById } });
      }
    }
    return tx.stockCheck.update({ where:{id}, data:{ status:'DONE' } });
  });
  // writeOperationLog('SUBMIT','StockCheck',id)
  ```

---

## 8. 库存流水 Stock Movements

### 8.1 `GET /api/erp/stock-movements` — 流水查询
- **权限**：全角色（读）
- **入参**：`materialId?`、`warehouseId?`、`type?`、`refType?`、`refId?`、`dateFrom?`、`dateTo?`、`page`、`pageSize`
- **出参**：`{ data: StockMovement[], total }`，含 `material{code,name}`、`warehouse{name}`，按 `createdAt desc`
- **核心 Prisma**：
  ```ts
  prisma.stockMovement.findMany({ where:{ ...(materialId && {materialId}), ...(warehouseId && {warehouseId}),
    ...(type && {type}), ...(refType && {refType}),
    ...((dateFrom||dateTo) && { createdAt:{ ...(dateFrom&&{gte:dateFrom}), ...(dateTo&&{lte:dateTo}) } }) },
    include:{ material:true, warehouse:true }, orderBy:{ createdAt:'desc' }, skip, take })
  ```
- **说明**：流水只读，无任何写/改/删端点（审计命根子，不可篡改）。

---

## 端点汇总（18 路由 / 23 方法）

| # | 模块 | 路径 | 方法 | 权限 |
|--:|------|------|------|------|
| 1 | 物料 | `/api/erp/materials` | GET / POST | 读全 / 写仓管 |
| 2 | 物料 | `/api/erp/materials/[id]` | GET / PUT / DELETE | 读全 / 写仓管 |
| 3 | 物料 | `/api/erp/materials/import` | POST | 仓管 |
| 4 | 分类 | `/api/erp/material-categories` | GET | 读全 |
| 5 | 仓库 | `/api/erp/warehouses` | GET / POST | 读全 / 写仓管 |
| 6 | 仓库 | `/api/erp/warehouses/[id]` | PUT / DELETE | 仓管 / 删超管 |
| 7 | 库存 | `/api/erp/inventory` | GET | 读全 |
| 8 | 入库 | `/api/erp/stock-in` | GET / POST | 读全 / 写仓管 |
| 9 | 入库 | `/api/erp/stock-in/[id]` | GET | 读全 |
| 10 | 出库 | `/api/erp/stock-out` | GET / POST | 读全 / 写仓管 |
| 11 | 出库 | `/api/erp/stock-out/[id]` | GET | 读全 |
| 12 | 盘点 | `/api/erp/stock-checks` | GET / POST | 读全 / 写仓管 |
| 13 | 盘点 | `/api/erp/stock-checks/[id]` | GET / PUT | 读全 / 写仓管 |
| 14 | 流水 | `/api/erp/stock-movements` | GET | 读全 |

> 权限校验建议封装 `requireRole(session, ['SUPER_ADMIN','WAREHOUSE'])` 中间件；
> 金额/数量运算统一用 `Prisma.Decimal`（简写 `D`），杜绝浮点误差。

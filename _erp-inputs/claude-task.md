# ERP Phase 1 — Claude 任务书

## 你的角色
DachuanPro ERP 第 1 期主架构师。负责设计 Prisma Schema、种子数据、和 API 规格。

## 工作环境
- 项目根目录在此会话的工作目录
- Prisma: `./node_modules/.bin/prisma` (版本 6.8.2)
- 输入文件在 `_erp-inputs/` 目录

## 约束（必须遵守）
1. **不要动 CRM 现有代码** — Customer/Contract/Product 等已有模型一行都不改
2. 金额统一 Decimal(12,2)，数量 Decimal(10,2)
3. 明细表独立建表（对齐 CRM 的 ContractItem 风格），不用 JSON
4. 软删除用 deletedAt
5. 表名用 @@map() 蛇形命名

## 执行步骤

### 1. 读现有代码
```bash
cat prisma/schema.prisma
ls src/app/\(app\)/
```

### 2. 读 Excel 和规划书
```bash
python3 -c "
import openpyxl
wb = openpyxl.load_workbook('_erp-inputs/BK5030-ERP物料模板.xlsx')
for sn in wb.sheetnames:
    ws = wb[sn]
    print(f'=== {sn} ({ws.max_row} rows) ===')
    for row in ws.iter_rows(min_row=1, max_row=min(3, ws.max_row), values_only=True):
        print(row)
"
cat _erp-inputs/DachuanPro-ERP-规划设计书-v2.1.md
```

### 3. 扩展 Prisma Schema (prisma/schema.prisma)
- Role 枚举加 WAREHOUSE
- 新增 13 张表：

| 表 | 关键字段 |
|----|---------|
| Warehouse | id, name, code(unique), address, isActive |
| MaterialCategory | id, name, code, parentId(自引用树形), sortOrder |
| Material | id, code(unique), name, categoryId, spec, unit, standardPrice Decimal(12,2), safetyStock, drawingNo, deletedAt |
| Inventory | id, warehouseId, materialId, quantity, totalAmount — (warehouseId,materialId)唯一 |
| StockIn | id, batchNo(unique), warehouseId, type(PURCHASE/RETURN/INITIAL/CHECK_IN/OTHER), createdById→User |
| StockInItem | id, stockInId, materialId, quantity, unitPrice, amount, sortOrder |
| StockOut | id, batchNo(unique), warehouseId, type(PRODUCTION/CHECK_OUT/OTHER), createdById→User |
| StockOutItem | id, stockOutId, materialId, quantity, sortOrder |
| StockCheck | id, batchNo(unique), warehouseId, checkDate, status(DRAFT/CHECKING/DONE) |
| StockCheckItem | id, stockCheckId, materialId, bookQty, actualQty, diffQty, diffAmount, reason |
| StockMovement | id, warehouseId, materialId, type(STOCK_IN/STOCK_OUT/CHECK_ADJUST), quantity±, beforeQty, afterQty, refType, refId |
| BomHeader | id, productId→Product, version, isActive (第2期预留) |
| BomItem | id, bomId, materialId, quantity, level, parentItemId(自引用), sortOrder (第2期预留) |

每表都要: UUID PK, createdAt, @@map, 合适索引。

### 4. 写种子脚本 prisma/seed-bk5030.ts
读 Excel「物料主数据」sheet → Material 记录；读「产品BOM」sheet → BomHeader + BomItem。
先建 MaterialCategory 预置分类再关联。独立运行: `npx tsx prisma/seed-bk5030.ts`

### 5. Prisma 迁移
```bash
./node_modules/.bin/prisma migrate dev --name erp_phase1
```

### 6. API 规格
输出到 `_erp-inputs/api-spec-v1.md`：18个API端点的 方法/路径/入参/出参/权限/核心Prisma逻辑

## 完工标准
- [ ] schema.prisma 扩展，CRM 表未动
- [ ] Role 有 WAREHOUSE
- [ ] 13 张新表定义
- [ ] seed-bk5030.ts 可运行
- [ ] prisma migrate dev 成功
- [ ] api-spec-v1.md 已输出

开始执行。不用等我确认，做完所有步骤再汇报。

# DachuanPro CRM/ERP 当前开发状态

- 当前系统为 DachuanPro CRM/ERP 平台。
- 已进入 ERP 二期开发。
- 当前开发必须保护已有 CRM 功能、权限和正式数据。
- 每次重要补丁完成后，需要更新本文件。

## 2026-07-13｜ERP 第四期：生产工单受控闭环（待数据库迁移与部署）

- 已在 `codex/erp-phase4-production-kit-check` 完成工单草稿、下达、BOM 物料快照、独立齐套检查历史、领料/退料和缺料采购草稿来源关联。
- 已下达工单只能经变更申请和超级管理员审批生成新版本；审批同时保留旧版本/快照、生成新快照并新建齐套记录。
- 已删除生产进度百分比和开工、暂停、完工等生产状态机，也未引入合同台套分配或数量占用。
- 数据库迁移只新增生产工单、变更申请、物料快照、齐套记录，以及既有入/出库和采购草稿的可空来源关联字段、索引和外键；尚未在任何数据库执行。
- 上线前必须先备份数据库，并人工复核 `prisma/migrations/20260713090000_erp_phase4_production_part_a/migration.sql` 与 `prisma/migrations/20260713110000_erp_phase4_purchase_sources/migration.sql`，不得执行 `db:reset`。

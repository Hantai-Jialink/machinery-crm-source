# DachuanPro CRM/ERP 当前开发状态

- 当前系统为 DachuanPro CRM/ERP 平台。
- 已进入 ERP 二期开发。
- 当前开发必须保护已有 CRM 功能、权限和正式数据。
- 每次重要补丁完成后，需要更新本文件。

## 2026-07-13｜ERP 第四期：生产工单最小闭环（待数据库迁移与部署）

- 已在 `codex/erp-phase4-production-kit-check` 完成生产工单草稿、下达、状态跟踪、BOM 物料快照、齐套检查和缺料采购草稿联动。
- 生产领料、退料已安全关联生产工单；领料仍走库存校验和库存流水，退料仍走入库和库存流水。
- 数据库迁移仅新增 `erp_production_*`、`erp_kit_check_results` 表，并为既有 ERP 入/出库单新增可空 `productionOrderId`；尚未在任何数据库执行。
- 上线前必须先备份数据库，并人工复核 `prisma/migrations/20260713090000_erp_phase4_production_part_a/migration.sql`，不得执行 `db:reset`。

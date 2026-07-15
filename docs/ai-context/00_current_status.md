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
- 上线前必须先备份数据库，并人工复核 `prisma/migrations/20260713090000_erp_phase4_production_part_a/migration.sql`、`prisma/migrations/20260713110000_erp_phase4_purchase_sources/migration.sql` 与 `prisma/migrations/20260713120000_erp_phase4_shortage_purchase_source_guard/migration.sql`，不得执行 `db:reset`。
- 已新增物料级缺料采购来源唯一约束：同一齐套检查、同一物料仅允许一个活动采购来源；取消或软删除草稿会释放活动占位，历史来源保留。

## 2026-07-15｜ERP 第四期验收增强（已开发，未迁移、未部署）

- 分支：`codex/erp-phase4-procurement-delivery-enhancements`。
- 已增加合同明细交期与生产工单交期快照、库存变化齐套复检队列、安全库存采购需求、备货/工单/月度计划/手工四类采购来源、月度生产计划、入出库业务快照与附件、供应商交期跟踪/承诺历史/分批交付/提醒/绩效。
- 原有生产工单、齐套历史、领退料、采购订单与缺料来源表均保留；新采购需求层在正式采购订单之前工作，不会自动生成正式订单。
- 新迁移为 `prisma/migrations/20260715100000_erp_phase4_procurement_delivery/migration.sql`，回滚脚本同目录 `rollback.sql`；均未在任何数据库执行。
- 本地 Prisma 校验、TypeScript、48 项测试和 Next.js 生产构建通过；Windows 本地 standalone 启动受 pnpm 符号链接 `EPERM` 阻断，需在 Linux CI 再执行干净环境 `/login` 冒烟。

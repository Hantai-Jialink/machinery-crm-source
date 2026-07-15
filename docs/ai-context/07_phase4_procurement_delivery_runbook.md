# ERP 第四期采购与交期增强：迁移及任务说明

## 边界

本次开发未连接生产服务器、未连接生产数据库、未部署、未执行 migration。上线前必须备份数据库、项目目录和上传目录，并再次确认生产路径、PM2 服务名、Nginx、`.env` 与外置 `UPLOAD_DIR`。

## 数据库文件

- 正向迁移：`prisma/migrations/20260715100000_erp_phase4_procurement_delivery/migration.sql`
- 回滚脚本：`prisma/migrations/20260715100000_erp_phase4_procurement_delivery/rollback.sql`

回滚脚本会删除本期新增业务表和字段，因此只能在确认没有需要保留的新业务数据、应用代码已先回滚且数据库备份可恢复时执行。不要执行 `prisma migrate reset` 或项目中的 `db:reset`。

## 定时任务

设置仅服务器持有的 `ERP_CRON_SECRET`，并选定一个有效管理员用户 ID 作为系统齐套检查执行人。以下为 cron 示例，实际域名和时间需上线时确认：

```cron
*/10 * * * * curl -fsS -X POST -H "x-cron-secret: $ERP_CRON_SECRET" -H "x-system-user-id: ADMIN_USER_ID" https://YOUR_HOST/api/erp/kit-rechecks/process
0 8 * * * curl -fsS -X POST -H "x-cron-secret: $ERP_CRON_SECRET" https://YOUR_HOST/api/erp/delivery-reminders/run
```

两个任务均具备幂等约束：齐套队列按生产工单唯一，齐套快照按触发键唯一；交期通知按采购明细、日期和阈值唯一。管理员也可通过相同接口在登录状态手动执行。

## 验证重点

1. 先在隔离测试库执行迁移并核对旧采购单、库存、生产工单数量不变。
2. 逐项执行用户给出的十个验收场景，尤其检查部分到货、来源分摊和月度计划部分转工单。
3. 在 Linux standalone 干净目录验证 Prisma 6.8.2、应用启动和 `/login` 返回 200/302/307。
4. 附件目录必须继续使用外置 `UPLOAD_DIR`，部署包不得覆盖正式上传目录。

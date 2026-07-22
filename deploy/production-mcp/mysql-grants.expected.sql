-- 生产证明模板：仅由 DBA 在隔离会话执行 SHOW GRANTS；不得直接作为生产变更脚本执行。
-- `172.30.31.10` 是 dachuan-mcp-prod 固定 Docker 子网中 MCP 容器的地址。
-- 如数据库不在该 Docker 网络，必须先以 MCP 容器实际连接执行 SELECT CURRENT_USER()，
-- 再将下面的 Host 替换为 MCP_DATABASE_GRANT_HOST 的实际值；绝不能使用 localhost。

SHOW GRANTS FOR 'dachuan_mcp_read'@'172.30.31.10';
SHOW GRANTS FOR 'dachuan_mcp_audit'@'172.30.31.10';

-- 期望的最小权限形态（示例，不含口令且不创建账户）。
-- 首批白名单仅 who_am_i、crm_customer_get、crm_contract_get。
GRANT SELECT ON machinery_crm.`users` TO 'dachuan_mcp_read'@'172.30.31.10';
GRANT SELECT ON machinery_crm.`customers` TO 'dachuan_mcp_read'@'172.30.31.10';
GRANT SELECT ON machinery_crm.`customer_quotes` TO 'dachuan_mcp_read'@'172.30.31.10';
GRANT SELECT ON machinery_crm.`follow_records` TO 'dachuan_mcp_read'@'172.30.31.10';
GRANT SELECT ON machinery_crm.`contracts` TO 'dachuan_mcp_read'@'172.30.31.10';
GRANT SELECT ON machinery_crm.`contract_items` TO 'dachuan_mcp_read'@'172.30.31.10';
GRANT SELECT ON machinery_crm.`contract_payments` TO 'dachuan_mcp_read'@'172.30.31.10';
GRANT SELECT ON machinery_crm.`shipments` TO 'dachuan_mcp_read'@'172.30.31.10';

-- 审计账户不得读取任何业务表，只能写入现有审计表。
GRANT INSERT ON machinery_crm.`operation_logs` TO 'dachuan_mcp_audit'@'172.30.31.10';

-- 两账户均不得拥有 UPDATE、DELETE、CREATE、ALTER、DROP、FILE、PROCESS 或 GRANT OPTION。
-- read 账户不得拥有 operation_logs INSERT；audit 账户不得拥有业务表 SELECT。

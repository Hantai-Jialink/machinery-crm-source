-- 证明模板：仅由正式 DBA 在隔离会话中执行 SHOW GRANTS；本文件不得直接在生产执行。
-- 业务读取账户：仅 SELECT。请按实际工具涉及的表逐表授予，不使用 ALL PRIVILEGES。
SHOW GRANTS FOR 'dachuan_mcp_read'@'localhost';
SHOW GRANTS FOR 'dachuan_mcp_audit'@'localhost';

-- 期望形态（示例，不含口令且不自动创建账户）：
-- GRANT SELECT ON machinery_crm.`users` TO 'dachuan_mcp_read'@'localhost';
-- GRANT SELECT ON machinery_crm.`customers` TO 'dachuan_mcp_read'@'localhost';
-- GRANT SELECT ON machinery_crm.`contracts` TO 'dachuan_mcp_read'@'localhost';
-- GRANT INSERT ON machinery_crm.`operation_logs` TO 'dachuan_mcp_audit'@'localhost';
--
-- 两个账户均不得拥有 UPDATE、DELETE、CREATE、ALTER、DROP、FILE、PROCESS 或 GRANT OPTION。
-- dachuan_mcp_audit 不得拥有任何业务表 SELECT；dachuan_mcp_read 不得拥有 operation_logs INSERT。

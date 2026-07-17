# 身份桥接隔离环境验收

本目录只用于 PoC 真实链路验收，不是生产部署模板。默认且唯一准入模式是 `MCP_TOOL_MODE=IDENTITY_POC`。在 `accept` 输出完整 PASS 前，禁止切换 `FULL_READ_ONLY`，也禁止开始 21 个业务工具的第二阶段身份适配。

## 固定版本与边界

| 组件 | 固定版本/标签 |
| --- | --- |
| FastGPT 源码 | `a0aec83f2ae444f5783416d17d0d9d12b7c1dc39` |
| FastGPT 自定义镜像 | `dachuan-fastgpt:v4.15.1-identity-acceptance.1` |
| CRM/Gateway/MCP | `dachuanpro-crm-erp-mcp:1.2.0-identity-acceptance.1` |
| MySQL | `mysql:8.0.43` |
| Redis | `redis:7.2-alpine` |
| MongoDB | `mongo:5.0.32` |
| pgvector | `pgvector/pgvector:0.8.0-pg15` |

MySQL、Redis、MongoDB、PostgreSQL 和 MinIO 只使用本 Compose 项目的命名卷。数据库初始化只执行仓库现有 migration；固定 seed 脚本同时检查 `IDENTITY_ACCEPTANCE_ENV=isolated` 和数据库主机名 `mysql`，不满足即拒绝。没有生产地址、生产账号或生产数据导入步骤。

## 一键启动

Windows PowerShell：

```powershell
.\deploy\identity-acceptance\start.ps1
```

Linux：

```bash
./deploy/identity-acceptance/start.sh
```

首次执行会：生成仅保存在忽略文件中的随机密钥；克隆并校验精确 FastGPT 提交；应用可回滚补丁；运行 FastGPT 定向测试；构建固定镜像；启动隔离 MySQL、Redis、CRM/Gateway/MCP、FastGPT 依赖和 Nginx；应用现有 migration 并写入六名显式标记的验收用户。

本机入口：CRM `http://127.0.0.1:18080`，FastGPT `http://127.0.0.1:18081`，MCP `http://127.0.0.1:18080/api/mcp`。Nginx 日志格式不记录 Header、Cookie 或请求正文。

## FastGPT 一次性验收配置

1. 用 `.env.identity-acceptance` 中的 `FASTGPT_ROOT_PASSWORD` 登录隔离 FastGPT。
2. 创建 MCP 工具集，地址填 `http://nginx:8080/api/mcp`，只配置 `Authorization: Bearer <MCP_SERVICE_KEY>`。不要配置任何 `X-Dachuan-*` 头。
3. 确认管理界面能发现且只发现 `dachuan_identity_who_am_i`。
4. 创建只用于验收的 Agent，挂载该工具，并要求收到“调用 who_am_i”请求时实际调用工具。
5. 创建该 Agent 的专用 API Key，写入 `.env.identity-acceptance` 的 `AGENT_GATEWAY_FASTGPT_API_KEY`，然后只重建 CRM：

```powershell
docker compose --env-file .\deploy\identity-acceptance\.env.identity-acceptance -f .\deploy\identity-acceptance\docker-compose.yml up -d --force-recreate crm
```

这些值不得复制到提示词、普通 FastGPT 变量、浏览器 localStorage、聊天记录或工单。

## 一键验收与逐项覆盖

Windows：

```powershell
.\deploy\identity-acceptance\accept.ps1
```

Linux：

```bash
./deploy/identity-acceptance/accept.sh
```

验收 runner 逐项检查：

1. 服务身份完成 `initialize`、`ping/tools/list`，目录保持 `IDENTITY_POC`；
2. `tools/call` 缺用户断言时拒绝，不能执行 `who_am_i`；
3. 正常用户和 48 路两用户/多会话/多标签页交错调用不串身份与 requestId；
4. 篡改、过期、错误 `iss/aud/kid` 断言全部拒绝；
5. Redis JTI 撤销立即生效；
6. 同一令牌下，数据库中的角色、区域和停用状态实时生效；
7. FastGPT 4.15.1 管理端真实 `/api/core/app/mcpTools/getTools` 完成工具发现；
8. 两个真实 CRM 登录 Session 以 24 路多标签页、流式/非流式混合请求经过 Gateway → FastGPT → MCP，每个 requestId 的 OperationLog 均落到预期 ERP userId；
9. 成功和拒绝审计可定位，且审计、工具响应、全部隔离服务捕获日志均不含已配置密钥或 JWT 形态的动态断言。

任一检查失败时脚本返回非零，不生成通过结论。证据保存在被 Git 忽略的 `acceptance-output/`，提交前不得把这些日志加入 Git。

## 回滚

默认回滚仅停止隔离栈并保留命名卷：

```powershell
.\deploy\identity-acceptance\rollback.ps1
```

只有明确确认后才删除本 Compose 项目的隔离卷：

```powershell
.\deploy\identity-acceptance\rollback.ps1 -PurgeIsolatedData
```

Linux 分别使用 `rollback.sh` 和 `rollback.sh --purge-isolated-data`。本方案未修改 Prisma Schema/migration，因此没有数据库结构回滚 SQL，也不会触碰生产部署。

## 第二阶段准入记录

只有同时具备以下证据才能把 `MCP_TOOL_MODE` 改为 `FULL_READ_ONLY` 并开始独立第二个 Commit：镜像 revision/测试标签与本地 `sha256` image ID、Compose 全服务健康、上述九组检查全部 PASS、OperationLog 抽检、日志敏感信息扫描为零、明确记录验收时间和操作者。FastGPT 定向测试不可跳过；自动化单测通过或直接 MCP 调用通过均不能替代真实 CRM → Gateway → FastGPT → MCP 链路。

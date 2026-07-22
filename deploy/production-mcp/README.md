# FULL_READ_ONLY 生产灰度包

此目录是受门禁保护的生产灰度包，不是立即部署包。它不会停止或覆盖现有 FastGPT 3100、CRM、Nginx 或其他 Docker Compose 项目。

## 不可跳过的门禁

1. `fastgpt-v4.15.2-compatibility.json` 必须由精确 FastGPT 4.15.2 源码兼容移植产生，记录源码提交、原始镜像 digest、补丁 SHA256、聚焦测试和并发验收 PASS。
2. Canary FastGPT 必须已经健康；该包只连接 Canary，不会修改正式 3100。
3. `.env.production` 必须为 0600，且只有 `SUPER_ADMIN` 与至多两个批准的业务只读工具。
4. `backup.sh` 先成功，`deploy.sh` 才允许启动新的 `dachuan-mcp-prod` 项目。

## 脚本顺序

每条命令分别执行并检查 PASS：

```bash
bash ./preflight.sh /secure/path/.env.production
```

```bash
bash ./backup.sh /secure/path/.env.production
```

```bash
bash ./deploy.sh /secure/path/.env.production
```

```bash
bash ./healthcheck.sh /secure/path/.env.production
```

```bash
bash ./super-admin-accept.sh /secure/path/.env.production /secure/path/identity-agent-request.json /secure/path/super-admin-cookie.jar
```

失败时只执行：

```bash
bash ./rollback.sh /secure/path/.env.production
```

禁止执行 Prisma migration、`db:reset`、`docker compose down`（针对现有项目）、停止 3100、删除 Redis 卷或清理 `operation_logs`。

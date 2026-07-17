# MCP Docker 部署与回滚

该方案启动复用现有 MySQL 的独立 Next.js MCP 实例，不执行 Prisma migration，不覆盖主应用或 uploads。生产环境为 Linux/宝塔；所有生产命令均应逐条执行并检查结果。

## 0. 上线前确认与备份

先确认现有 CRM、PM2、Nginx、环境文件和上传目录正常：

```bash
curl -fSs https://现有CRM域名/login -o /dev/null
```

```bash
pm2 list
```

```bash
sudo nginx -t
```

```bash
test -f /opt/machinery-crm-v108-release/.env
```

```bash
test -d /opt/machinery-crm-uploads
```

备份现有项目、数据库和准备修改的 Nginx 配置。`mysqldump` 应使用服务器已有的受限凭据文件或交互式密码，不要把密码写进命令历史：

```bash
sudo tar -C /opt -czf /opt/machinery-crm-v108-release-pre-mcp-20260717.tar.gz machinery-crm-v108-release
```

```bash
mysqldump --single-transaction --routines --triggers machinery_crm > /opt/machinery_crm-pre-mcp-20260717.sql
```

```bash
sudo cp /etc/nginx/conf.d/mcp.conf /etc/nginx/conf.d/mcp.conf.pre-mcp-20260717
```

若 `mcp.conf` 尚不存在，跳过最后一条并备份实际将修改的上级配置。成功标准是两个备份文件存在且非空，`nginx -t` 仍通过；任一备份失败立即停止。

## 1. 在构建机生成镜像

低配置生产服务器不现场执行 `pnpm build` 或 `docker compose build`。在有 Docker Engine 的 Linux CI/构建机执行：

```bash
docker build -f Dockerfile.mcp -t dachuanpro-crm-erp-mcp:1.0.0 .
```

```bash
docker save dachuanpro-crm-erp-mcp:1.0.0 -o dachuanpro-crm-erp-mcp-1.0.0.tar
```

确认镜像构建成功且 tar 非空，再把源码中的 `docker-compose.mcp.yml`、`.env.mcp.example`、`deploy/nginx/mcp.conf.example` 和镜像 tar 传到服务器专用目录。不要把 `.env.mcp` 打入镜像或传到不可信平台。

仍在可信构建机的源码目录生成 API Key；把 `KEY_HASH` 交给服务器环境配置，明文 `API_KEY` 只交给 FastGPT 管理员：

```bash
corepack pnpm mcp:keygen
```

## 2. 在服务器配置并启动

进入专用部署目录，复制模板并填写真实值：

```bash
cp .env.mcp.example .env.mcp
```

把构建机生成的 `KEY_HASH` 写入 `.env.mcp`，明文只配置到 FastGPT。确认 `MCP_API_KEYS_JSON` 中每个 `userId` 和 `MCP_AUDIT_USER_ID` 都是现有用户 ID。数据库账号不需要 DDL 权限，但必须能读取业务数据并写入现有 `OperationLog`。

加载已构建镜像并启动只监听本机 3010 的服务：

```bash
docker load -i dachuanpro-crm-erp-mcp-1.0.0.tar
```

```bash
docker compose -f docker-compose.mcp.yml up -d --no-build
```

```bash
docker compose -f docker-compose.mcp.yml ps
```

```bash
curl -fSs http://127.0.0.1:3010/api/mcp/health
```

成功标准：容器状态为 healthy，健康接口返回 `status=ok`。容器退出、unhealthy、数据库连接错误或审计写入错误都视为失败，先看日志，不继续配置公网入口：

```bash
docker compose -f docker-compose.mcp.yml logs --tail 100 dachuanpro-mcp
```

## 3. 配置 Nginx 与 FastGPT

把 `deploy/nginx/mcp.conf.example` 按真实域名和证书路径复制到 Nginx 配置目录。加载前必须检查语法：

```bash
sudo nginx -t
```

```bash
sudo systemctl reload nginx
```

```bash
curl -fSs https://mcp.dachuan.pro/api/mcp/health
```

在 FastGPT 填写 `https://mcp.dachuan.pro/api/mcp` 和 `Authorization: Bearer <API_KEY>`，执行工具发现与最小查询，再到 `OperationLog` 确认 `MCP_CALL`。最后重新检查现有 CRM 登录、`pm2 list`、uploads 和 Nginx，确认主系统未受影响。

## 4. 配置轮换

先把新旧 Key/hash 同时保留在 `MCP_API_KEYS_JSON` 并重启容器；FastGPT 切换成功后再删除旧项并再次重启。不要在日志或工单中粘贴明文 Key。

## 5. 回滚

本功能没有 schema/migration 变更，数据库无需执行回滚 SQL，历史 `OperationLog` 应保留。先撤回 Nginx MCP 配置并验证，再停止独立容器：

```bash
sudo cp /etc/nginx/conf.d/mcp.conf.pre-mcp-20260717 /etc/nginx/conf.d/mcp.conf
```

```bash
sudo nginx -t
```

```bash
sudo systemctl reload nginx
```

```bash
docker compose -f docker-compose.mcp.yml down
```

若需回到上一 MCP 镜像，修改 Compose 的 `image` 标签后执行：

```bash
docker compose -f docker-compose.mcp.yml up -d --no-build
```

回滚成功标准：MCP 公网入口已撤下或恢复上一版本，现有 CRM 登录正常、PM2 online、Nginx 检查通过、uploads 仍在。禁止执行 `prisma migrate reset`、`db:reset`、`DROP DATABASE`、`TRUNCATE`，也禁止删除主项目目录、上传目录或数据库审计记录。

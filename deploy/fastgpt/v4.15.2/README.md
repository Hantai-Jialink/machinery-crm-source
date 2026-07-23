# FastGPT v4.15.2 可信 MCP 身份补丁

适用且仅适用于 FastGPT 源码提交：

```text
b9b6e2305e70823c9706291de4b19c4dc3ae05f6
```

该提交对应用户指定的 FastGPT 4.15.2 基线（`v4.15.2^{}` 指向同一 commit）。补丁不会把用户断言写入变量或模型输入，只在服务端 HTTP 请求、工作流 `AsyncLocalStorage` 和 MCP 出站调用之间传递。

与 v4.15.1 补丁的差异：适配 4.15.2 源码树（含 `queryUrlFileMap` 上下文字段、`AGENT_ENGINE` 枚举扩展），并把 `deploy/version/v4.15/docker-compose.template.yml` 的 `AGENT_ENGINE` 由 `default` 改为 `fastAgent`。

## Linux 应用与回滚

```bash
./apply.sh /opt/src/FastGPT
```

```bash
./rollback.sh /opt/src/FastGPT
```

脚本先执行 `git apply --check`；应用脚本还会校验 HEAD 精确提交为 `b9b6e23`。任何预检失败都应停止，不得强制套用。

## Windows 应用与回滚

Windows 版脚本（`apply.ps1`/`rollback.ps1`）如需，可从同仓库 `deploy/fastgpt/v4.15.1/` 参照，把 `expected_commit` 改为本基线 commit。生产部署在 Linux 服务器进行，通常用 `.sh`。

## 测试与固定镜像

应用后在 FastGPT 源码目录执行定向测试（v4.15.2 补丁未携带测试文件 hunk，需手动跑上游自带测试确认无回归）：

```bash
cd packages/service
corepack pnpm exec vitest run -c vitest.config.ts test/core/app/mcp.test.ts test/core/workflow/utils/context.test.ts --coverage=false
```

随后用 `deploy/identity-acceptance/build-fastgpt.sh`（或等价 `docker build -f deploy/identity-acceptance/Dockerfile.fastgpt`）构建自定义镜像，并固定标签：

```text
dachuan-fastgpt:v4.15.2-identity-poc.1
```

Compose/Kubernetes 必须引用这个不可变标签或进一步固定 digest，不得使用 `latest`。部署前保存原 FastGPT 镜像标签/digest；回滚时恢复原镜像并重启 FastGPT，不需要修改 CRM/ERP 数据库。

## 自建镜像 /health 健康检查坑（canary 教训，重要）

自建 standalone 镜像（ENTRYPOINT `node ./projects/app/server.js`）与官方 `labring/fastgpt` 镜像不同：**官方镜像挂了根 `/health` 路由，自建 mirror 缺，根 `/health` 返回 404**。FastGPT 默认 healthcheck `fetch('http://localhost:3000/health')` 会因 404 永远 unhealthy。

部署时必须二选一处理：
- **修法①（推荐，最简）**：把 `fastgpt-app` 的 healthcheck 改为自建镜像里真实存在的端点。构建后先 `docker run` 起镜像，依次 `curl` 试 `/`、`/_next/...`、`/api/...`，找到返回 200 的，填入 compose 的 healthcheck。
- **修法②**：在 Dockerfile.fastgpt 的 entrypoint 套一层 wrapper，或改 standalone server.js，挂一个返回 200 的 `/health` 路由。

不要沿用 `localhost:3000/health` 不改，否则容器持续 unhealthy、compose `--wait` 卡死。

## 变更范围

- Chat Completions 入口读取两个可信头（`x-dachuan-user-assertion`、`x-dachuan-request-id`）；
- 工作流 dispatch 将身份放入已有请求级上下文；
- MCP Streamable HTTP/SSE 出站先移除静态 `X-Dachuan-*` 头；聊天时追加两个请求级可信头，管理端发现时只生成 requestId；
- `docker-compose.template.yml` 的 `AGENT_ENGINE` 改为 `fastAgent`。

MCP 固定的 `Authorization` 服务 Key 仍由 FastGPT MCP Server 配置提供。补丁传递的只是用户断言和 requestId，三者在 MCP 端共同校验。

## 回滚

`./rollback.sh <FastGPT源码目录>` 反向 patch，或在生产把 `fastgpt-app` 镜像改回官方 `fastgpt:v4.15.2` 后 `docker compose up -d --no-build fastgpt`。不涉及 CRM/ERP 数据库变更，无需执行迁移回滚 SQL。

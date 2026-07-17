# FastGPT v4.15.1 可信 MCP 身份补丁

适用且仅适用于 FastGPT 源码提交：

```text
a0aec83f2ae444f5783416d17d0d9d12b7c1dc39
```

该提交对应用户指定的 FastGPT 4.15.1 基线。补丁不会把用户断言写入变量或模型输入，只在服务端 HTTP 请求、工作流 `AsyncLocalStorage` 和 MCP 出站调用之间传递。

## Windows 应用与回滚

```powershell
.\apply.ps1 -FastGptSource C:\src\FastGPT
```

```powershell
.\rollback.ps1 -FastGptSource C:\src\FastGPT
```

## Linux 应用与回滚

```bash
./apply.sh /opt/src/FastGPT
```

```bash
./rollback.sh /opt/src/FastGPT
```

脚本先执行 `git apply --check`；应用脚本还会校验 HEAD 精确提交。任何预检失败都应停止，不得强制套用。

## 测试与固定镜像

应用后在 FastGPT 源码目录执行：

```bash
cd packages/service
```

```bash
corepack pnpm exec vitest run -c vitest.config.ts test/core/workflow/utils/context.test.ts --coverage=false
```

随后按 FastGPT 4.15.1 原构建流程生成自定义镜像，并固定标签：

```text
dachuan-fastgpt:v4.15.1-identity-poc.1
```

Compose/Kubernetes 必须引用这个不可变标签或进一步固定 digest，不得使用 `latest`。部署前保存原 FastGPT 镜像标签/digest；回滚时恢复原镜像并重启 FastGPT，不需要修改 CRM/ERP 数据库。

## 变更范围

- Chat Completions 入口读取两个可信头；
- 工作流 dispatch 将身份放入已有请求级上下文；
- MCP Streamable HTTP/SSE 出站先移除静态 `X-Dachuan-*` 头，再追加两个请求级可信头；
- 并发测试验证两个上下文不串值。

MCP 固定的 `Authorization` 服务 Key仍由 FastGPT MCP Server 配置提供。补丁传递的只是用户断言和 requestId，三者在 MCP 端共同校验。

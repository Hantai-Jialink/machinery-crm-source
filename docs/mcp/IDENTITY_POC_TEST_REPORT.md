# CRM/ERP Agent 身份桥接 PoC 测试报告

- 日期：2026-07-17
- 分支：`codex/unified-readonly-mcp`
- 基线：`dd0338f55de16e6ebf6fb4a6e7cae3ebb2a8fa43`
- 范围：身份桥接 PoC；不包含联网搜索和 21 个业务工具的新身份权限矩阵

## 需求覆盖

| 验证项 | 自动化证据 | 结果 |
| --- | --- | --- |
| 两名用户并发不串身份 | Gateway 并发签发/转发测试、MCP 并发 `who_am_i` 测试、FastGPT AsyncLocalStorage 并发测试 | 通过 |
| 伪造 userId/角色/区域无效 | `who_am_i` 使用 strict 空参数；伪造参数返回 `INVALID_ARGUMENT`；有效 Ed25519 sub 映射到实时 DB 用户 | 通过 |
| 过期、篡改、错误 iss/aud | JWT 单测覆盖固定错误码；同时校验 alg/kid/nbf 和 300～900 秒实际寿命 | 通过 |
| 用户停用或角色变化立即生效 | 同一断言连续调用时修改模拟数据库用户；角色立即更新、停用立即 403 | 通过 |
| 请求与审计定位具体 ERP userId | 成功/停用审计断言 userId、requestId、工具、状态和固定拒绝原因 | 通过 |
| 三凭证缺一拒绝 | 服务 Key、用户断言、requestId 分别缺失测试 | 通过 |
| 旧管理员 Key 不绕过 | strict 模式残留 userId 仍拒绝；生产环境即使显式打开兼容开关也拒绝启动 | 通过 |
| Key 轮换、JTI 撤销 | 多 kid 验证旧 Token、active kid 签发新 Token、撤销后拒绝 | 通过 |
| 浏览器/日志不泄密 | Gateway 不转发浏览器 Cookie/Authorization，响应正文无断言；审计只保存参数键名 | 通过 |
| FastGPT 静态头不能冒充用户 | MCP 出站先移除 MCP 配置中的静态 `X-Dachuan-*`，只注入当前请求上下文值 | 通过（补丁静态检查） |
| Gateway CSRF 来源 | 非 CRM Origin 在读取 Session 前拒绝 | 通过 |
| FastGPT 补丁可应用/回滚 | 精确提交上依次执行 rollback → apply → `git diff --check` → rollback，最终工作树干净 | 通过 |

## 质量门禁

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 主仓库全量自动化 | `corepack pnpm test` | 20 个测试文件、105 项测试全部通过 |
| TypeScript | `corepack pnpm exec tsc --noEmit` | 通过，0 错误 |
| ESLint | `corepack pnpm lint` | 通过，0 错误；510 条仓库既有 warning |
| Next.js 生产构建 | `corepack pnpm build` | 通过；包含 `/api/agent-gateway/chat`、`/api/mcp` |
| FastGPT 请求上下文 | 在 `packages/service` 执行 `corepack pnpm exec vitest run -c vitest.config.ts test/core/workflow/utils/context.test.ts --coverage=false` | 1 文件、64 项通过 |
| Patch 格式 | `git apply --check`、`git diff --check`、反向 `git apply -R --check` | 通过 |
| Ed25519 keygen | 生成临时文件、解析数组/kid/privateJwk、验证不输出私钥后安全删除 | 通过 |
| Prisma/migration 范围 | `git diff --name-only dd0338f -- prisma/schema.prisma prisma/migrations` | 无输出 |
| Docker 实构建 | `docker version` | 当前 Windows 环境无 Docker，未执行 |

## 未声称完成的验证

- 未启动真实 FastGPT、Redis、MySQL 的全网络链路；当前证据分别覆盖 Gateway、FastGPT 请求上下文和 MCP 三段。上线准入前仍需在隔离环境执行两用户流式/非流式端到端压测并核对真实 `OperationLog`。
- FastGPT 管理界面的 MCP 工具发现不处于聊天请求上下文，strict 模式会拒绝无用户断言的刷新。PoC 需从隔离非生产环境导入已发现的工具配置；下一阶段必须验证该配置路径，生产禁止为此开启 legacy。
- 未连接生产数据库，未执行 migration、seed、部署或远程推送。
- 未运行 FastGPT 全仓测试；仅运行与补丁直接相关的 service context 测试。每次 FastGPT 升级都必须在其完整构建环境重新执行全仓门禁。
- Redis 实现已使用官方客户端、TTL、SHA-256 键和原子 Lua 限流，但本机无 Docker，未做真实 Redis 故障/多实例集成测试。
- PoC 自动化通过不等于允许开启 `FULL_READ_ONLY`；必须先完成上述隔离环境验收，再开始 21 个业务工具权限矩阵阶段。

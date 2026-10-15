# AI 问答助手 A 方实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只实现 A 方负责的 H5、BFF、共享接口契约、B 方 Mock、自动化测试与部署准备，使 A 方在没有真实 B 方服务时也能独立开发和验收，并可在接口冻结后无缝切换至 B 方真实服务。

**Architecture:** 使用 pnpm workspace 管理 TypeScript Monorepo。H5 为 React + Vite 移动端 SPA，BFF 为独立 Fastify 服务；H5 永远只访问 A 方 `/api/v1/*`。A 方维护共享 OpenAPI/JSON Schema、SSE 解析器和 Mock B 服务，真实知识库、Search、RAG、Agent 与数据导入均不在本计划实施范围内。

**Tech Stack:** TypeScript、React、Vite、Fastify、PostgreSQL、Redis、Ajv、Vitest、Playwright、pnpm workspace、Docker Compose。

---

## 1. 范围基线

### A 方实现

- H5 首页、Chat、结构化卡片、引用、推荐追问、反馈、错误态和地图高亮。
- BFF 的 Session、Config、Chat Stream、非流式降级、Feedback、Events Batch、Entity Detail。
- `request_id`、`conversation_id`、`message_id`、幂等、超时、限流、日志和错误映射。
- OpenAPI、JSON Schema、SSE Fixture、生成的 TypeScript 类型和 Contract Test。
- B 方 Mock，仅用于模拟冻结接口和异常场景。
- A 方数据库、Redis、监控、构建、部署和回滚准备。

### 明确不实现

- 真实知识库、向量库、搜索索引、Rerank、RAG、AI Agent。
- Excel/CSV/文档导入、知识发布、知识缺口管理和 B 方运营后台。
- 实时室内定位、UWB/蓝牙导航、自动路线规划。
- 现有微信小程序业务改造；只验证 web-view 跳转参数和业务域名接入。

## 2. 已冻结的 A 方技术决策

1. 以《API 接口契约与数据 Schema V1.0》作为字段和路径的主基线。
2. `message.delta` 使用 `data.delta`，不使用需求文档样例中的 `data.text`。
3. 行为埋点使用 `POST /api/v1/events/batch`。
4. 地图定位使用 `entity.card.actions[].type=highlight_booth` 及 `booth_id/map_shape_id`；V1 不自行新增 `map.highlight` SSE 事件。
5. H5 使用 `fetch + ReadableStream` 处理 POST SSE，不使用只支持 GET 的原生 EventSource。
6. 未知 SSE event 安全忽略并记录；收到 `message.error` 后立即结束，不再接收 `message.done`。
7. BFF 采用白名单转发，不向浏览器透出内部 trace、Prompt、模型信息、密钥和内部异常栈。
8. B 服务不可用时，Feedback 仍先在 A 方落库，再由 outbox 异步重试 I06。
9. E08 服务端会话历史作为 P1；P0 先保证同一浏览器刷新后通过本地缓存续接。

## 3. 目标目录结构

```text
.
├─ apps/
│  ├─ h5/                         # React H5
│  │  └─ src/
│  │     ├─ app/                  # 路由、全局 Provider、错误边界
│  │     ├─ features/home/        # 欢迎页和快捷入口
│  │     ├─ features/chat/        # 消息、输入、流式状态机
│  │     ├─ features/cards/       # 展商、产品、活动卡片
│  │     ├─ features/citations/   # 引用展示
│  │     ├─ features/feedback/    # 赞踩和原因
│  │     ├─ features/map/         # SVG/PNG 地图和展位高亮
│  │     └─ shared/               # API Client、配置、UI 基础能力
│  ├─ bff/                        # A 方公网 API
│  │  └─ src/
│  │     ├─ routes/               # E01-E07
│  │     ├─ services/             # 会话、聊天、反馈、埋点
│  │     ├─ upstream/             # B 方 Client 与白名单适配
│  │     ├─ persistence/          # PostgreSQL/Redis Adapter
│  │     ├─ observability/        # request_id、日志、指标
│  │     └─ security/             # token、限流、CORS、输入校验
│  └─ mock-b/                     # A 方维护的 B 接口 Mock
├─ packages/
│  ├─ contracts/                  # OpenAPI、JSON Schema、SSE Fixture
│  ├─ generated-types/            # Schema 生成的 TypeScript 类型
│  ├─ sse/                        # SSE parser/encoder
│  └─ test-fixtures/              # 固定联调数据
├─ tests/
│  ├─ contract/
│  ├─ integration/
│  └─ e2e/
├─ deploy/
│  ├─ docker-compose.yml
│  ├─ nginx/
│  └─ env/
└─ docs/
   ├─ runbooks/
   └─ acceptance/
```

## 4. 实施任务

### Task 1：初始化 Monorepo 与质量基线

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/h5/package.json`
- Create: `apps/bff/package.json`
- Create: `apps/mock-b/package.json`

- [x] 创建 pnpm workspace，固定 `apps/*` 与 `packages/*` 两类包。
- [x] 配置 TypeScript strict、ESLint、Prettier、Vitest 和统一脚本。
- [x] 加入 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- [x] 创建 `.env.example`，只放变量名和安全示例，不写真实密钥。
- [x] 执行 `pnpm install`，预期成功生成 lockfile。
- [x] 执行 `pnpm lint && pnpm typecheck && pnpm test`，预期空工程基线通过。

### Task 2：建立机器可读接口契约

**Files:**

- Create: `packages/contracts/openapi-public-v1.yaml`
- Create: `packages/contracts/openapi-internal-v1.yaml`
- Create: `packages/contracts/schemas/common.schema.json`
- Create: `packages/contracts/schemas/chat.schema.json`
- Create: `packages/contracts/schemas/card.schema.json`
- Create: `packages/contracts/schemas/citation.schema.json`
- Create: `packages/contracts/schemas/feedback.schema.json`
- Create: `packages/contracts/schemas/events.schema.json`
- Create: `packages/contracts/schemas/error.schema.json`
- Create: `packages/contracts/scripts/generate-types.ts`
- Test: `tests/contract/schema-validation.test.ts`

- [x] 先写 Contract Test，校验所有 Schema 可被 Ajv 加载。
- [x] 写失败 Fixture，确认缺少 `request_id`、非法 enum、错误 `delta/text` 字段会失败。
- [x] 按 V1.0 文档实现 E01-E07、I01-I08 和通用 Error Schema。
- [x] 生成 TypeScript 类型并检查生成结果无 `any`。
- [x] 执行 `pnpm test:contract`，预期所有正确 Fixture 通过、错误 Fixture被拒绝。

### Task 3：建立 20 条固定 Mock Fixture

**Files:**

- Create: `packages/test-fixtures/chat-stream-exhibitor.sse`
- Create: `packages/test-fixtures/chat-stream-booth.sse`
- Create: `packages/test-fixtures/chat-stream-abstain.sse`
- Create: `packages/test-fixtures/chat-stream-error.sse`
- Create: `packages/test-fixtures/search-exact.json`
- Create: `packages/test-fixtures/search-fuzzy.json`
- Create: `packages/test-fixtures/search-hybrid.json`
- Create: `packages/test-fixtures/retrieve-no-knowledge.json`
- Create: `packages/test-fixtures/entity-exhibitor.json`
- Create: `packages/test-fixtures/config-default.json`
- Test: `tests/contract/fixtures.test.ts`

- [x] 覆盖正常问答、展位定位、展商卡、产品卡、活动卡、引用、推荐追问。
- [x] 覆盖歧义、拒答、冲突、旧届、429、503、超时、流中断和未知事件。
- [x] 每条 Fixture 都通过对应 JSON Schema 或 SSE 事件 Schema。
- [x] 保证 fixture 中的 `entity_id/booth_id/map_shape_id/source_id` 稳定且相互关联。

### Task 4：实现 B 方 Mock 服务

**Files:**

- Create: `apps/mock-b/src/server.ts`
- Create: `apps/mock-b/src/routes/agent.ts`
- Create: `apps/mock-b/src/routes/search.ts`
- Create: `apps/mock-b/src/routes/retrieve.ts`
- Create: `apps/mock-b/src/routes/resolve.ts`
- Create: `apps/mock-b/src/routes/quality.ts`
- Create: `apps/mock-b/src/routes/health.ts`
- Test: `apps/mock-b/test/routes.test.ts`

- [x] 先写路由测试，确认 I01-I08 的状态码、Header 和 Schema。
- [x] 根据 query 关键字选择固定 Fixture，不实现真实搜索或 Agent。
- [x] 支持延迟、首事件前失败、首事件后断流、503 和未知事件注入。
- [x] 执行 Mock 路由测试，预期全部通过。

### Task 5：实现 BFF 基础框架、Session 与 Config

**Files:**

- Create: `apps/bff/src/app.ts`
- Create: `apps/bff/src/server.ts`
- Create: `apps/bff/src/routes/session.ts`
- Create: `apps/bff/src/routes/config.ts`
- Create: `apps/bff/src/security/session-token.ts`
- Create: `apps/bff/src/observability/request-context.ts`
- Create: `apps/bff/src/config/runtime-config.ts`
- Test: `apps/bff/test/session.test.ts`
- Test: `apps/bff/test/config.test.ts`

- [x] 测试 E01 创建匿名会话、返回短期 token 和默认 conversation。
- [x] 测试 E02 按 `expo_id` 返回欢迎语、快捷入口和功能开关。
- [x] 实现 `X-Request-Id` 沿用/生成和统一响应 Envelope。
- [x] 实现 token 校验、CORS allowlist、输入长度和基础限流。
- [x] 执行 BFF 测试，预期 E01/E02 和错误码全部通过。

### Task 6：实现 SSE 编解码和 Chat BFF

**Files:**

- Create: `packages/sse/src/parser.ts`
- Create: `packages/sse/src/encoder.ts`
- Create: `packages/sse/src/event-guard.ts`
- Create: `apps/bff/src/routes/chat-stream.ts`
- Create: `apps/bff/src/routes/chat.ts`
- Create: `apps/bff/src/upstream/b-client.ts`
- Create: `apps/bff/src/upstream/event-whitelist.ts`
- Test: `packages/sse/test/parser.test.ts`
- Test: `apps/bff/test/chat-stream.test.ts`

- [x] 先写 SSE 分片测试，覆盖一个 UTF-8 中文字符被拆分到多个网络 chunk。
- [x] 测试事件顺序、终止事件唯一性、未知事件忽略和内部字段裁剪。
- [x] 实现 E03 到 I01 的 POST 流式代理和 Abort 传播。
- [x] 实现 E04 到 I02 的非流式降级。
- [x] 首事件后断流不透明重试；首事件前仅允许同 request_id 重试一次。
- [x] 执行 SSE、Chat 集成测试，预期全部通过。

### Task 7：实现 H5 壳、首页和会话恢复

**Files:**

- Create: `apps/h5/src/main.tsx`
- Create: `apps/h5/src/app/App.tsx`
- Create: `apps/h5/src/app/router.tsx`
- Create: `apps/h5/src/features/home/HomePage.tsx`
- Create: `apps/h5/src/shared/api/client.ts`
- Create: `apps/h5/src/shared/session/session-store.ts`
- Create: `apps/h5/src/styles/tokens.css`
- Test: `apps/h5/src/features/home/HomePage.test.tsx`

- [x] 先写首页测试：加载配置、展示快捷入口、点击后进入 Chat 并带入 query。
- [x] 实现 anonymous session 初始化和 localStorage 恢复。
- [x] 401 时清除过期 token、重建会话并给出可理解提示。
- [x] 确保主流手机宽度无横向滚动，配置内容不写死在组件中。

### Task 8：实现 Chat 流式状态机

**Files:**

- Create: `apps/h5/src/features/chat/ChatPage.tsx`
- Create: `apps/h5/src/features/chat/chat-reducer.ts`
- Create: `apps/h5/src/features/chat/use-chat-stream.ts`
- Create: `apps/h5/src/features/chat/MessageList.tsx`
- Create: `apps/h5/src/features/chat/Composer.tsx`
- Create: `apps/h5/src/features/chat/StatusIndicator.tsx`
- Test: `apps/h5/src/features/chat/chat-reducer.test.ts`
- Test: `apps/h5/src/features/chat/ChatPage.test.tsx`

- [x] 先写状态机测试，覆盖 start/status/delta/card/citation/suggestion/done/error。
- [x] 实现输入校验、防重复发送、`client.message_id` 幂等键。
- [x] 使用 AbortController 实现停止生成，并记录 `stream_cancel`。
- [x] 流式不可用时调用 E04，保持同一消息 UI。
- [x] 错误态区分 401、429、超时、上游不可用和流中断。

### Task 9：实现结构化卡片、引用、建议与反馈

**Files:**

- Create: `apps/h5/src/features/cards/EntityCard.tsx`
- Create: `apps/h5/src/features/cards/ExhibitorCard.tsx`
- Create: `apps/h5/src/features/cards/ProductCard.tsx`
- Create: `apps/h5/src/features/cards/EventCard.tsx`
- Create: `apps/h5/src/features/citations/CitationList.tsx`
- Create: `apps/h5/src/features/chat/SuggestionList.tsx`
- Create: `apps/h5/src/features/feedback/FeedbackSheet.tsx`
- Create: `apps/bff/src/routes/feedback.ts`
- Test: `apps/h5/src/features/cards/cards.test.tsx`
- Test: `apps/bff/test/feedback.test.ts`

- [x] 所有可点击实体只读取结构化 ID，不从 AI 文本猜字段。
- [x] 引用只显示 B 方返回的真实 `source_id/page_or_row`。
- [x] 赞踩与 `request_id/message_id` 绑定；负反馈原因符合枚举。
- [x] 相同 `feedback_id` 重发不重复计数。
- [x] I06 不可用时 E05 仍返回成功并写入 outbox。

### Task 10：实现地图与展位高亮

**Files:**

- Create: `apps/h5/src/features/map/MapPage.tsx`
- Create: `apps/h5/src/features/map/MapCanvas.tsx`
- Create: `apps/h5/src/features/map/map-registry.ts`
- Create: `apps/h5/src/features/map/use-map-viewport.ts`
- Create: `apps/h5/public/maps/demo-hall.svg`
- Create: `apps/h5/src/features/map/map-shapes.json`（未放入 `packages/test-fixtures`：该目录已被 Task 3 的测试锁定为恰好 20 条场景 fixture 的封闭集合）
- Test: `apps/h5/src/features/map/MapPage.test.tsx`
- Test: `tests/e2e/booth-highlight.spec.ts`

- [x] 测试 `highlight_booth` action 能打开正确馆图并定位 shape。
- [x] 实现缩放、拖拽、复位和可见高亮状态。
- [x] 多展位时展示选择；shape 缺失时显示展位号和降级提示。
- [x] 地图素材未提供时使用 demo SVG，不阻塞组件和接口开发。

### Task 11：实现 Events Batch、持久化和异步 Outbox

**Files:**

- Create: `apps/bff/src/routes/events-batch.ts`
- Create: `apps/bff/src/persistence/schema.prisma`
- Create: `apps/bff/src/persistence/repositories.ts`
- Create: `apps/bff/src/services/quality-outbox.ts`
- Create: `apps/bff/src/workers/quality-signal-worker.ts`
- Test: `apps/bff/test/events-batch.test.ts`
- Test: `apps/bff/test/quality-outbox.test.ts`

- [x] 建立 anonymous_session、conversation、message、feedback、analytics_event、quality_signal_outbox 表。
- [x] 单批最多 50 条，`event_id` 幂等，埋点失败不阻塞 Chat。
- [x] outbox 使用有限重试和退避，保留最后错误但不记录 Authorization。
- [x] 执行数据库与 worker 集成测试，预期重复事件不重复入库。

> 本地/测试数据库：开发容器 `assistant-dev-postgres`（`docker run postgres:15-alpine`，宿主机端口 55532），与本机已运行的其他项目 Postgres 容器（默认 5432 端口）相互独立。正式部署的 Postgres 由 Task 13 的 `deploy/docker-compose.yml` 提供；`pnpm install` 会自动执行 `prisma generate`（根 `postinstall` 脚本 + `pnpm.onlyBuiltDependencies` 放行 prisma 相关构建脚本）。

### Task 12：完善安全、监控和运维

**Files:**

- Create: `apps/bff/src/security/rate-limit.ts`
- Create: `apps/bff/src/security/redaction.ts`
- Create: `apps/bff/src/observability/logger.ts`
- Create: `apps/bff/src/observability/metrics.ts`
- Create: `docs/runbooks/incident-tracing.md`
- Create: `docs/runbooks/release-and-rollback.md`
- Test: `apps/bff/test/security.test.ts`

- [x] 日志自动脱敏 Authorization、Cookie、token 和自由文本中的敏感字段。
- [x] 实现可配置限流、超时、Retry-After 和统一用户提示。
- [x] 日志包含 request_id、trace_id、conversation_id、error_code 和版本信息。
- [x] 建立流中断率、429、上游错误、反馈失败、首事件延迟指标。
- [x] 写明发布、回滚和按 request_id 排障步骤。

### Task 13：端到端验收与发布准备

**Files:**

- Create: `tests/e2e/home-to-chat.spec.ts`
- Create: `tests/e2e/stream-cancel.spec.ts`
- Create: `tests/e2e/feedback.spec.ts`
- Create: `tests/e2e/error-recovery.spec.ts`
- Create: `tests/e2e/mobile-layout.spec.ts`
- Create: `docs/acceptance/a-side-acceptance-checklist.md`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/nginx/default.conf`

- [x] 跑通文档 T01-T12 中属于 A 方的 UI、流式、反馈和错误恢复部分（详见 `docs/acceptance/a-side-acceptance-checklist.md` 第 1 节）。
- [x] UI 规格（`docs/superpowers/specs/2026-08-24-ai-qa-assistant-chat-ui-design.md`）收口：结构/交互/无障碍/响应式已完成并有截图与测试证据，E07 实体详情页已实现（含展商/产品/活动三类分组重构）。**仍未完成**（依赖外部条件，非本方代码范围）：正式品牌色与 Logo、展馆平面图素材、产品卡图片字段（Schema 未开放此字段，已提交契约变更提案）（详见验收清单第 3、6 节）。
- [x] 跑通 API-01、02、11、12、13、14、15（详见同文档第 2 节；API-01 在本任务中补齐了此前遗漏的 `client.message_id` 幂等实现）。
- [ ] 在微信内置浏览器、iOS Safari 和 Android Chrome 的代表环境完成验收记录。**未完成**：本环境无真机/云真机可用，只能跑桌面 Chromium 的 Playwright e2e；已在验收清单第 6 节留出人工核对表，需要有真机访问权限的人补上。
- [x] 验证 Nginx 不缓存 SSE，正式路径使用同源 `/api/*`（`deploy/nginx/default.conf` 关闭 `proxy_buffering`/`proxy_cache`）。
- [x] 执行 `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`，全部通过（最近一次：254 个单元/集成测试 + 40 个 e2e 测试）。

## 5. 阶段 Gate

| Gate                | 完成条件                                 | 允许进入下一阶段的证据              |
| ------------------- | ---------------------------------------- | ----------------------------------- |
| G0 契约冻结         | Schema、路径、枚举、错误码、SSE 顺序确定 | Contract Test 与 20 条 Fixture 通过 |
| G1 A 方 Mock 可演示 | 首页、Chat、卡片、引用、地图、反馈可用   | 本地一键启动演示录像或现场演示      |
| G2 BFF 主链路完成   | E01-E07、幂等、限流、SSE、降级通过       | API 集成测试报告                    |
| G3 真实 B 联调准备  | Mock 可替换，内部 Client 无业务泄漏      | 切换 `B_SERVICE_BASE_URL` 即可联调  |
| G4 上线准备         | 兼容、监控、回滚、域名配置完成           | A 方验收清单全部勾选                |

## 6. A 方验收口径

- H5 不含模型、FastGPT、知识库或数据库密钥。
- H5 只调用 A 方 `/api/v1/*`。
- Chat 正常流式输出；停止生成、非流式降级和断流错误可验证。
- 未知 SSE event 不崩溃，内部 trace 不透出。
- 每个可交互实体都有稳定结构化 ID。
- 展位定位基于 `booth_id/map_shape_id`；缺失映射有明确降级提示。
- 反馈和埋点均有幂等键，且与 request_id/message_id 关联。
- B 方 I06 暂不可用不影响用户反馈提交成功。
- A 方可以只启动 Mock B 完成全部前端和 BFF 验收。
- 真实 B 服务接入只更换配置和适配测试，不重写 H5 业务逻辑。

## 7. 开工顺序

首次执行只做以下四项，完成后再进入 UI 大规模开发：

1. 初始化 Monorepo 与质量命令。
2. 将 V1.0 接口文档转为 OpenAPI、JSON Schema 和生成类型。
3. 建立 20 条固定 Fixture 与 Mock B。
4. 跑通最小链路：E01 Session → E02 Config → E03 SSE → H5 显示一条带展商卡的回答。

这四项完成即形成第一个可验证基线，后续卡片、地图、反馈和运维能力都在该基线上增量实现。

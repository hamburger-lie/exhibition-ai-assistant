# A 方验收清单

**状态：未完成。** 自动化范围内的项目已通过，含 E07 实体详情、Redis 会话/限流
存储、会话鉴权守卫、Nginx 多实例转发；真机、正式域名/CDN、品牌资产、展馆图、
小程序五类依赖外部条件的项目**尚未验证**，本文档不对这些项目打勾。

依据《H5 与知识库系统需求及分工说明书 V1.0》第 11 节（T01-T12）、《API 接口契约
与数据 Schema V1.0》第 13 节（API-01~15）以及
`docs/superpowers/specs/2026-08-24-ai-qa-assistant-chat-ui-design.md`（UI 规格）。

最近一次执行：`pnpm lint` / `pnpm typecheck` / `pnpm test`（254 个单元与集成测试，
含 Redis 集成 12 例、会话鉴权守卫 15 例、入场动效追踪 7 例）/ `pnpm build` /
`CI=1 pnpm test:e2e`（40 个 e2e，含输入框自适应高度 6 例）全部通过。另有一次
Docker Compose + Nginx 多实例的真实链路验证（见第 5 节）。真机测试用的大批量
样例数据（84 条展商/产品/活动，聊天内可按名称精确匹配到卡片）见
`docs/acceptance/real-device-test-urls.md`。

---

## 1. T01-T12 中的 A 方部分

| ID | 场景 | A 方职责 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| T01 | `3B-12 在哪里？` | 依 `booth_id/map_shape_id` 打开馆图并高亮 | ✅ | `MapPage.test.tsx`；`tests/e2e/booth-highlight.spec.ts` |
| T02 | 展商精确查询 | 展位/馆号只读结构化字段 | ✅ | `cards.test.tsx`（`resolveBoothContext` 用例） |
| T03 | 同名展商歧义 | 呈现澄清，不擅自选择 | ✅ | `chat-ambiguous` fixture 契约测试 |
| T09 | 知识库无资料 | 呈现 `abstain`，不编造引用 | ✅ | `chat-reducer.test.ts` |
| T10 | 规则冲突 | 呈现 `conflict` | ✅ | `chat-conflict` fixture 契约测试 |
| T08 | 跨届次查询 | 旧届硬过滤，不静默回落 | ✅ | `session.test.ts`、`config.test.ts` |
| T11 | 点踩「信息过期」 | 与 `request_id` 绑定并进入 outbox | ✅ | `feedback.test.ts`；`tests/e2e/feedback.spec.ts` |
| T12 | 流式中途断网 | 显示可理解错误 + 恢复路径，不留无限 loading | ✅ | `tests/e2e/error-recovery.spec.ts` |

T04-T07 主要是 B 方检索质量；A 方只负责按 schema 忠实渲染，由通用卡片/引用用例覆盖。

## 2. API-01~15 中的 A 方部分

| ID | 通过标准 | 状态 | 证据 |
| --- | --- | --- | --- |
| API-01 | 重复 `client.message_id` 只生成一次回答 | ✅ | `message-idempotency.test.ts`（8 例：并发选主、进程重启后回放、租约接管、失败释放）+ `chat.test.ts` 跨端点用例 + 第 5 节真实重启验证 |
| API-02 | 首事件后断线不透明重试并记录 `STREAM_INTERRUPTED` | ✅ | `chat-stream.test.ts`；`error-recovery.spec.ts` |
| API-11 | 同 `feedback_id` 不重复计数 | ✅ | `feedback.test.ts` |
| API-12 | I06 不可用时 E05 仍成功并进队列重试 | ✅ | `feedback.test.ts`、`quality-outbox.test.ts` |
| API-13 | 未知 SSE event 安全忽略 | ✅ | `packages/sse/test/parser.test.ts`；`chat-stream.test.ts`；第 5 节真实链路 |
| API-14 | B 503 映射为统一 user_message，不泄露内部异常 | ✅ | `chat-stream.test.ts`；`schema-validation.test.ts` |
| API-15 | 可点击实体有稳定 ID，展位定位有 `booth_id` | ✅ | `cards.test.tsx` |

## 3. UI 规格符合性（Task 7–10 收口）

| 规格条目 | 状态 | 证据 |
| --- | --- | --- |
| §3 空对话首屏即会话页，无「首页→Chat」层级 | ✅ | `ChatPage.test.tsx`；`home-to-chat.spec.ts`；截图 01 |
| §3.1 欢迎区 + 四个 2×2 快捷入口 + 两条问题示例 + 底部输入区 | ✅ | `WelcomeScreen.test.tsx`；截图 01 |
| §3.2 用户右侧浅色气泡 / AI 左侧自然文本 | ✅ | 截图 02 |
| §4.2 卡片纵向排列、>3 张可折叠、缺失字段隐藏 | ✅ | `MessageList.tsx` `CardStack`；截图 02 |
| §4.3 引用默认折叠为「参考依据 N」 | ✅ | `cards.test.tsx`；`home-to-chat.spec.ts`；截图 03 |
| §4.4 推荐追问 ≤4 条；反馈在完成后出现；负反馈走底部层 | ✅ | `chat-reducer.test.ts`、`FeedbackSheet.test.tsx`；截图 04 |
| §5.1 空内容禁用发送、>800 字提示、1–4 行自增、生成期间可编辑不可重发、方形停止图标 | ✅ | `Composer.test.tsx`；截图 07 |
| §5.2 stage → 用户可读状态文案，首个 delta 后收起 | ✅ | `StatusIndicator.test.ts`、`chat-reducer.test.ts` |
| §5.3 上滑不被强制拉回底部 + 「回到最新」 | ✅ | `use-auto-scroll.ts`（`ChatPage` 集成） |
| §5.4 停止生成保留已生成内容并立即恢复输入 | ✅ | `stream-cancel.spec.ts`；截图 07 |
| §6 七类异常均有用户文案 + 恢复路径 | ✅ | `error-recovery.spec.ts`；截图 06 |
| §7.2 地图返回、可缩放、底部信息卡、真实描边高亮、缺 `map_shape_id` 降级 | ✅ | `MapPage.test.tsx`；`booth-highlight.spec.ts`；截图 05、08 |
| §8.2 正文 16px/1.65、无小于 12px 正文 | ✅ | `design-tokens.test.ts` |
| §8.1 正文对比度 ≥4.5:1、图形 ≥3:1 | ✅ | `design-tokens.test.ts`（按 WCAG 公式实算） |
| §8.4 统一 SVG 线性图标、无 Emoji、触控 ≥44×44、动效 150–250ms、支持 reduced-motion | ✅ | `design-tokens.test.ts`、`WelcomeScreen.test.tsx`、`mobile-layout.spec.ts` |
| §9 375/390/430 与横屏无横向滚动、safe-area、dvh | ✅ | `mobile-layout.spec.ts`（4 视口 × 2 页面）、`design-tokens.test.ts` |
| §8.1 正式品牌主色 | ❌ **未完成** | 见第 6 节：当前是中性占位，等待官方品牌规范 |
| §7.1 实体详情页 | ✅ | `EntityDetailPage.test.tsx`；`tests/e2e/entity-detail.spec.ts`；`apps/bff/src/routes/entities.ts` + `fixture-entity-provider.ts` |

UI 截图：`docs/acceptance/ui-screenshots/`（390×844 移动视口，动效关闭以保证稳定）。

## 4. 自动化命令

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
CI=1 pnpm test:e2e
```

`CI=1` 会关闭 Playwright 的 `reuseExistingServer`，确保 e2e 一定跑在本次构建产物上，
不会复用残留的旧服务。

## 5. Docker Compose + Nginx 真实链路验证

用 `docker compose -p assistant-acceptance --profile mock up -d --build` 起完整栈
（Postgres + Mock B + BFF + Nginx/H5），通过 `http://localhost:8081` 实测：

| 验证项 | 结果 |
| --- | --- |
| POST SSE 的 `Content-Type` | `text/event-stream; charset=utf-8` ✅ |
| Nginx 未缓冲 | 生效配置含 `proxy_buffering off`、`proxy_cache off`、`proxy_request_buffering off`；响应带 `X-Accel-Buffering: no`、`Transfer-Encoding: chunked` ✅ |
| 完整事件序列 | start → status → delta → entity.card → citation → suggestion.list → done ✅ |
| 未知事件 | `debug.trace` 被丢弃，其余事件正常收束 ✅ |
| 429 | HTTP 429 + `RATE_LIMITED` + `Retry-After: 2` 透传 ✅ |
| 503 | HTTP 503 + `UPSTREAM_UNAVAILABLE`，无内部异常泄露 ✅ |
| 上游超时 | 29.9s 后 HTTP 504 + `AI_UPSTREAM_TIMEOUT` ✅ |
| 断流 | 两个合法事件后结束，无终止事件 ✅ |
| 停止生成（客户端断开） | BFF 无 error 级日志、后续请求正常、幂等槽位已释放 ✅ |
| 幂等跨进程重启 | 重启 BFF 容器后同一 `client.message_id` 返回**完全相同**的 `message_id` ✅ |
| 迁移 | 容器启动时自动 `prisma migrate deploy` ✅ |

> 说明：本次是本机 `localhost:8081` 的 HTTP 验证，**不等于**正式域名 + HTTPS + CDN
> 环境下的结论，后者仍未验证（见第 6 节）。

### 5.1 多实例转发验证（bff 2 副本 + Nginx + Redis 共享状态）

**背景缺陷**：`deploy/nginx/default.conf` 原先写死 `proxy_pass http://bff:3000`，
Nginx 只在启动时解析一次 `bff` 域名，多实例（`docker compose --scale bff=2`）
场景下所有流量会被钉死在其中一个容器上，此前一次「8/8 通过」的结论是错的——
那 8 个请求全部打在同一实例。已修复为 Docker 内嵌 DNS + 变量式 `proxy_pass`
（见配置文件注释），本节是修复后的复验。

执行命令（只重建/重启 nginx 容器，未动 bff/h5/mock-b/postgres/redis 镜像，
未跑 `pnpm install`）：

```bash
DOCKER_BUILDKIT=0 docker compose -p assistant-acceptance --env-file deploy/.env.acceptance \
  -f deploy/docker-compose.yml --profile mock build nginx
docker compose -p assistant-acceptance --env-file deploy/.env.acceptance \
  -f deploy/docker-compose.yml --profile mock up -d --no-deps nginx
```

| 验证项 | 结果 |
| --- | --- |
| `nginx -t` | `syntax is ok` / `test is successful` ✅ |
| `nginx -T` 生效配置 | 含 `resolver 127.0.0.11 valid=10s`、`set $bff_upstream http://bff:3000; proxy_pass $bff_upstream$request_uri;`（变量式，非写死解析）✅ |
| 两个 BFF 实例同时在线 | `assistant-acceptance-bff-1`、`assistant-acceptance-bff-2` 全程 `Up`，未重建 ✅ |
| 经 Nginx 连续请求分散到两实例 | 干净对照批次：20 个请求前后统计 `incoming request` 日志行数，bff-1 增量 10、bff-2 增量 10（此前累计计数 bff-1=28→38、bff-2=9→19，两侧均 >0）✅ |
| 跨实例会话认证 | 在 bff-1 容器内直连 `172.23.0.5:3000` 创建 session，取 `session_token` 后直连 `172.23.0.7:3000`（bff-2）请求受保护端点 `GET /api/v1/entities/exhibitor/exhibitor_huayan?expo_id=expo_demo_2026_spring`，返回 `200` 且实体数据正确 ✅ |
| 跨实例限流计数共享 | 同一来源 IP 交替直连 bff-1/bff-2（`172.23.0.5`→`172.23.0.7`→…，`BFF_RATE_LIMIT_MAX=5`），第 1–4 次两实例均 `200`，第 5 次起两实例**同时**转为 `429`，证明计数在 Redis 中跨实例共享，而非各实例本地计数 ✅ |

> 说明：验证使用容器内直连（`docker exec` + Node/wget 打到容器 IP），绕开
> Nginx 以便精确控制「哪个实例发 token、哪个实例验 token」；跨实例分流本身
> 由上一行「经 Nginx 连续请求」证明。

## 6. 尚未完成 / 需要外部条件的项目

以下项目**不能**因为自动化通过就视为完成：

- [ ] **真机验收**：微信内置浏览器（Android / iOS）、iOS Safari、Android Chrome。
      本环境只有桌面 Chromium，无真机或云真机，`isMobile` 视口模拟**不能**替代真机。
      重点需人工确认：iOS Safari 下 `fetch + ReadableStream` 接收 POST SSE 的真实表现、
      微信 WebView 内核差异、键盘弹起后的输入区贴合。

  | 环境 | 首屏 | 流式渲染 | 停止生成 | 反馈 | 地图高亮 | 无横向滚动 | 键盘避让 |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | 微信内置浏览器（Android） | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
  | 微信内置浏览器（iOS） | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
  | iOS Safari | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
  | Android Chrome | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

- [ ] **正式域名 / HTTPS / CDN**：需在真实域名与 CDN 上复验 SSE 长连接不被边缘节点
      缓存或截断；本仓库未接入具体 CDN，无法在此环境验证。
- [ ] **小程序 web-view 接入**：业务域名配置与跳转参数（`expo_id` 等）需在真实小程序中验证。
- [ ] **官方 Logo 与品牌主色**：当前 `--brand-*` 全是中性占位色，顶部 Logo 是占位方块。
      拿到品牌规范后只需替换 `apps/h5/src/styles/tokens.css` 的 `--brand-*` 与 Logo 资源，
      组件无需改动；替换后需重跑 `design-tokens.test.ts` 复验对比度。
- [x] **展馆平面图素材**：已换成 官方参观指南图，A 区 9 个馆 + B 区 10 个馆共
      2116 个展位，1947 个（92%）可在图上精确高亮，由 `scripts/extract-hall-maps.py`
      从官方矢量 PDF 提取（详见 `docs/acceptance/hall-maps.md`）。
- [ ] **A 区展位编号需换成权威来源**：A 区源 PDF 的编号被转成了矢量轮廓、读不到
      文字，现用逐展位 OCR 补出 830 个（在 B 区实测：正确 92.9%、漏 5.6%、
      **错 1.5%**）。错的那部分（预计约 12 个展位）会高亮到错误位置，SVG 里已用
      `data-source="ocr"` 标出。**向主办方要一份 A 区未转曲的 PDF 即可 100% 准确**，
      重跑脚本，不需要改代码。B 区 1104 个展位是活文字提取，无此问题。
- [ ] **产品卡图片**：UI 规格 §4.2 要求产品图片，但已冻结的 `card.schema.json`
      `ProductPayload` 没有图片字段（只有 `ExhibitorPayload.logo_url`）。按「缺失字段直接隐藏，
      不显示虚构占位值」处理；已提交契约变更提案（未改 Schema），需 B 方/契约所有者确认后才能
      实际加字段。

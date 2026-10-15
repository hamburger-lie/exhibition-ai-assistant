# 排障手册：按 request_id 定位问题

适用范围：A 方 BFF（`apps/bff`）及其依赖的 Mock/真实 B 服务。

## 1. 日志结构

BFF 使用 Fastify 内建的 pino 日志（`apps/bff/src/observability/logger.ts`）。每条日志都是一行 JSON，包含：

| 字段          | 含义                                             |
| ------------- | ------------------------------------------------ |
| `request_id`  | 与响应头 `X-Request-Id` 一致，可回传给用户/前端用于关联 |
| `trace_id`    | 内部专用关联 ID，**不会**返回给浏览器              |
| `conversation_id` | 命中 Chat 相关路由（E03/E04）时绑定             |
| `error_code`  | 命中 `sendError` 时记录（如 `RATE_LIMITED`、`AI_UPSTREAM_TIMEOUT`） |
| `service` / `version` | 固定为 `bff` / 部署时的 `BFF_SERVICE_VERSION` |

`Authorization`、`Cookie`、`*.token`、`*.session_token`、`*.password` 等字段由 pino 的 `redact` 配置自动替换为 `[REDACTED]`，日志采集端不会看到明文凭据。任何需要手工记录任意对象（例如上游错误体）时，必须先经过 `apps/bff/src/security/redaction.ts` 的 `redactObject`/`redactString`，其规则同时覆盖已知敏感字段名和自由文本中形如 `Bearer <token>` 的片段。

## 2. 定位一次失败请求

1. 从用户反馈或前端错误提示中拿到 `request_id`（前端在收到 `message.error` 或错误响应时都会展示/记录该值；也可以直接看响应头 `X-Request-Id`）。
2. 在日志采集系统按 `request_id` 过滤，得到该请求在 BFF 内的全部日志行。
3. 若需要跨请求排查同一条 Chat（例如“首事件前重试”产生的第二次请求），两次尝试共用同一个 `request_id`（决策：首事件前失败仅允许同一 `request_id` 重试一次），可以一次性看到两次尝试的日志。
4. 若涉及上游（Mock B / 真实 B 服务），BFF 转发时不会把内部 `trace_id`/Prompt/模型信息透出给浏览器，但会记录在 BFF 自己的日志里，可结合 `trace_id` 继续在 B 侧日志中查找（前提是 B 侧也记录了同一个 `trace_id`，需要在 B 服务实现中约定透传）。

## 3. 常见错误码与含义

| `error_code`         | HTTP 状态 | 典型原因                               | 排查方向                         |
| --------------------- | --------- | -------------------------------------- | -------------------------------- |
| `INVALID_ARGUMENT`     | 400       | 请求体不符合 JSON Schema               | 检查客户端版本/参数拼接           |
| `SESSION_EXPIRED`      | 401       | `session_token` 过期或无效             | 引导前端清除本地会话重新创建       |
| `EXPO_NOT_FOUND`       | 404       | `expo_id` 未知或命中旧届硬过滤          | 确认前端携带的 `expo_id`          |
| `RATE_LIMITED`         | 429       | 单 IP 超过 `BFF_RATE_LIMIT_MAX`         | 查看 `/internal/metrics` 的 `rate_limited_total` |
| `AI_UPSTREAM_TIMEOUT`  | 504       | 上游在 `B_SERVICE_TIMEOUT_MS` 内未响应 | 检查 B 服务健康状况、网络延迟      |
| `UPSTREAM_UNAVAILABLE` | 503       | 上游连接失败或返回非 200               | 检查 Mock B/B 服务是否存活         |
| `STREAM_INTERRUPTED`   | （客户端本地状态，不经过 sendError） | 首事件后连接中断，BFF 不做透明重试 | 查看 `/internal/metrics` 的 `stream_interrupted_total`，结合该 `request_id` 的日志确认断流时间点 |

## 4. `/internal/metrics`

`GET /internal/metrics` 返回当前进程内存指标快照（JSON），覆盖验收清单要求的五类信号：

- `stream_interrupted_total`：SSE 首事件后未收到终止事件即结束的次数
- `rate_limited_total`：命中限流的次数（按路径分组）
- `upstream_errors_total`：转发给用户的上游相关错误（按 `error_code` 分组）
- `feedback_failures_total`：反馈转发给 I06 失败的次数（仍计入 outbox，不影响用户看到的成功响应）
- `first_event_latency_ms`：从收到请求到转发第一条已知 SSE 事件的耗时分布（`count`/`sum`/`p50`/`p95`/`p99`）

该端点不在 `/api/v1/*` 公网面下，且被限流中间件豁免（保证限流触发时仍可被拉取），生产环境必须在反向代理层禁止公网访问，只允许内部监控采集。

## 5. 反馈转发失败（I06 不可用）排查

`POST /api/v1/feedback` 对负反馈会立即尝试转发质量信号给 B 方 I06，失败不影响用户看到的成功响应，而是写入 `quality_signal_outbox` 表（`apps/bff/src/persistence/schema.prisma`）。排查步骤：

```bash
# 连接部署环境的 Postgres 后执行
SELECT feedback_id, attempts, last_error, next_attempt_at, resolved_at
FROM quality_signal_outbox
WHERE resolved_at IS NULL
ORDER BY next_attempt_at ASC
LIMIT 50;
```

- `attempts` 达到 5 次后会被“停放”（`next_attempt_at` 设为远future），不再自动重试，但 `last_error` 保留最后一次失败原因供人工核实；`last_error` 中绝不包含 `Authorization`。
- 正常情况下 `apps/bff/src/workers/quality-signal-worker.ts` 每 30 秒轮询一次未解决的记录并重试（指数退避，`5s * 2^attempts`，上限 5 分钟）。

## 6. 会话与限流（Redis）相关错误码

| 现象 | 可能原因 | 排查 |
| --- | --- | --- |
| 受保护端点大面积 401 `SESSION_EXPIRED` | 会话已过期，或 Redis 被清空 | 正常情况下 H5 会自动重建会话；若持续，检查 `BFF_SESSION_TTL_SECONDS` 与 Redis 是否被清过 |
| 受保护端点大面积 503 `UPSTREAM_UNAVAILABLE`，日志含 `session lookup` | Redis 不可用，鉴权失败关闭 | 检查 Redis 存活与 `REDIS_URL` |
| 全站 503，日志含 `rate limit check` | Redis 不可用，限流失败关闭 | 同上 |
| 单个 IP 持续 429 | 命中共享限流配额 | 查 `assistant:ratelimit:<ip>` 的值与 PTTL；响应头 `Retry-After` 即剩余秒数 |
| E07 返回 503，日志含 `no entity detail provider configured` | 未配置实体数据源 | 见发布手册第 7 节 |

> 这些日志只包含操作名与错误码。**任何情况下都不要**为了排查去打印
> Authorization 头或会话令牌；需要定位具体用户时用 `request_id`。

# 发布与回滚手册

适用范围：A 方 H5（`apps/h5`）、BFF（`apps/bff`）、Mock B（`apps/mock-b`，仅联调环境）。

## 1. 发布前检查

在打包/部署前，必须在仓库根目录顺序执行并全部通过：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm install` 会通过根 `postinstall` 脚本自动执行 `prisma generate`（见 `package.json` 的 `pnpm.onlyBuiltDependencies`），无需单独操作；仅当 `apps/bff/src/persistence/schema.prisma` 有结构变更时才需要额外的迁移步骤（见下）。

## 2. 数据库迁移

BFF 使用 Prisma 管理 `anonymous_session`/`conversation`/`message`/`feedback`/`analytics_event`/`quality_signal_outbox` 六张表。

- **本地/联调**：`pnpm --filter @ai-assistant/bff prisma:migrate`（会连接 `DATABASE_URL` 指向的数据库并生成新的迁移文件）。
- **生产发布**：只执行 `pnpm --filter @ai-assistant/bff prisma:migrate:deploy`（即 `prisma migrate deploy`），只应用仓库里已经存在、经过评审的迁移文件，不会在生产环境交互式生成新迁移。
- 迁移文件位于 `apps/bff/src/persistence/migrations/`，必须随代码一起提交、评审；不要手工修改已应用的迁移 SQL。
- 上线前确认 `DATABASE_URL` 指向正式 PostgreSQL 实例（生产由 `deploy/docker-compose.yml` 提供），而不是本地开发用的容器。

## 3. 发布顺序

1. 确认迁移已在目标环境执行（`prisma migrate deploy` 无失败、无 pending 迁移）。
2. 部署/重启 Mock B 或真实 B 服务（如果本次发布涉及其配置变化）。
3. 部署/重启 BFF：
   - 必需环境变量：`BFF_HOST`、`BFF_PORT`、`B_SERVICE_BASE_URL`、`DATABASE_URL`、`BFF_CORS_ALLOWED_ORIGINS`（必须等于 H5 的正式域名，不能用开发期默认值）。
   - 建议设置：`BFF_SERVICE_VERSION`（写入每条日志，便于按版本过滤）、`BFF_LOG_LEVEL=info`、`B_SERVICE_TIMEOUT_MS`（默认 30000）。
   - 启动后调用 `GET /internal/metrics` 确认进程存活且能返回五类指标的快照（该端点已豁免限流，可用作轻量存活探针；正式健康检查仍建议单独暴露 `/internal/health` 之类的最小探针，避免把指标接口当健康检查长期高频拉取）。
4. 部署 H5 静态产物（`apps/h5/dist`），确认其请求的 `/api/v1/*` 与该次发布的 BFF 版本匹配（H5 同源访问 `/api/*`，不直连 B 服务）。
5. 冒烟验证：
   - 首页可以拉到欢迎语和快捷入口（E01+E02）。
   - 发一条会命中 Mock/真实 B 已知场景的消息，确认流式回答正常结束于 `message.done`。
   - 提交一次反馈（赞/踩），确认返回成功。

## 4. 回滚

- **BFF/H5 代码回滚**：重新部署上一个已知良好的构建产物/镜像即可；BFF 是无状态服务，回滚不需要额外步骤。
- **数据库回滚**：Prisma 的迁移默认不生成自动向下迁移。若某次迁移需要回滚：
  1. 优先评估是否可以“前滚”（forward-fix：新增一个撤销变更的迁移），这比手工回退更安全。
  2. 确需回退表结构时，编写对应的手工 SQL 迁移并按迁移演进历史依次执行，禁止直接 `DROP`/改写已提交的历史迁移文件。
  3. 回滚前对目标表做快照/备份，尤其是 `feedback`、`quality_signal_outbox`（涉及用户提交的数据和未完成的重试队列）。
- **outbox 未完成任务**：数据库层面的回滚不会影响 `quality_signal_outbox` 中尚未解决的记录，worker 重启后会继续按 `next_attempt_at` 处理，无需手工干预。

## 5. 按 request_id 排障入口

发布后如需排查具体请求，参见 [incident-tracing.md](./incident-tracing.md)。

## 6. Redis（会话与限流共享存储）

自本版本起，会话令牌与限流计数都存放在 Redis，**不再是 BFF 进程内存**，
因此多实例部署下令牌与配额是共享的。

### 必需配置

| 变量 | 说明 |
| --- | --- |
| `BFF_STORE_BACKEND` | 生产/联调固定为 `redis`；`memory` **只允许单元测试使用**（无跨实例语义） |
| `REDIS_URL` | 例如 `redis://redis:6379`；所有 BFF 实例必须指向同一个 Redis |

### 启动行为

BFF 启动时会先等待 Redis 就绪（`waitForRedisReady`，10s 超时）再开始监听。
连不上 Redis 时进程直接退出——与其带着坏依赖对外服务、每个请求都 503，
不如让编排层看到启动失败并重试。

### Redis 故障时的行为（失败关闭）

| 场景 | 行为 |
| --- | --- |
| 鉴权时 Redis 不可用 | 返回 503 `UPSTREAM_UNAVAILABLE`，**不放行**请求 |
| 限流时 Redis 不可用 | 返回 503 `UPSTREAM_UNAVAILABLE`，**不跳过**限流 |
| 签发会话时 Redis 不可用 | 返回 503，不签发一个之后无法验证的令牌 |

这是刻意的选择：宁可短暂拒绝服务，也不能出现「Redis 挂了 = 没有鉴权、没有限流」。

日志只记录操作名与 `error_code`，**不记录 token / Cookie / Authorization**。

### 排查

```bash
# 会话键（只看数量与 TTL，不要打印内容）
redis-cli --scan --pattern 'assistant:session:*' | head
redis-cli ttl "assistant:session:<token>"

# 某个 IP 的限流窗口
redis-cli get  'assistant:ratelimit:<ip>'
redis-cli pttl 'assistant:ratelimit:<ip>'
```

> 排障时不要把会话键的 value 贴到工单或聊天里：它虽然不含明文凭据，
> 但键名里带着 token 本身。

### 回滚

- **代码回滚**：BFF 无状态，回滚镜像即可。注意回滚到本版本之前的镜像会退回
  进程内存 session，多实例下会出现「刷新后掉登录态」，因此多实例部署时
  **不建议**回滚到该版本之前。
- **清空会话**（例如怀疑令牌泄露）：`redis-cli --scan --pattern 'assistant:session:*' | xargs redis-cli del`。
  影响：所有用户需要重新建立匿名会话，H5 会自动重建，不需要用户操作。
- **清空限流**：`redis-cli --scan --pattern 'assistant:ratelimit:*' | xargs redis-cli del`。
- **Redis 数据丢失**：不影响正确性，只会让所有人重新建会话；`redis_data` 卷即使清空也可接受。

## 7. E07 实体详情数据源

| 变量 | 取值 | 行为 |
| --- | --- | --- |
| `BFF_ENTITY_DETAIL_PROVIDER` | `fixture` | 使用本地结构化样例，仅供开发/联调 |
| | `none` | 返回 503 `UPSTREAM_UNAVAILABLE` |
| | 未设置 | `NODE_ENV=production` 时为 `none`，其余为 `fixture` |

生产默认 `none` 是刻意的：在接入真实实体数据源之前，E07 宁可明确报「服务暂时不可用」，
也不能返回样例或猜测出来的展商/产品/活动信息。

## 8. Nginx 多实例转发（DNS 钉死陷阱）

多实例部署（`docker compose --scale bff=N`）时，Nginx 反向代理**不能**写死
`proxy_pass http://bff:3000;`——Docker 内嵌 DNS 只在 Nginx worker 启动时解析一次
`bff` 域名，之后长期复用同一个 IP，新扩容或重建的实例永远收不到流量，且故障
时也不会自动摘除已下线的实例。

正确写法（`deploy/nginx/default.conf`）：

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
set $bff_upstream http://bff:3000;
proxy_pass $bff_upstream$request_uri;
```

用变量接收 `proxy_pass` 的目标会强制 Nginx 在每次请求时按 `resolver` 指定的
TTL（此处 10s）重新解析域名，从而在多实例间做基本的轮询式分流。

**验证方法**（不依赖真实压测工具）：连续多次请求经 Nginx 的路径，同时看两个
BFF 实例的日志行数增量是否都 >0；只看「请求全部成功」不够，因为在钉死的情况
下所有请求也会成功，只是全打在一个实例上。2026-08-25 的一次复验记录见
`docs/acceptance/a-side-acceptance-checklist.md` 第 5.1 节。

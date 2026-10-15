import Fastify, { type FastifyInstance } from 'fastify';

import { loadRuntimeConfig, type RuntimeConfig } from './config/runtime-config.js';
import { buildLoggerOptions } from './observability/logger.js';
import { metricsSnapshot } from './observability/metrics.js';
import { registerRequestContext } from './observability/request-context.js';
import {
  UnconfiguredEntityDetailProvider,
  type EntityDetailProvider,
} from './entities/entity-detail-provider.js';
import { FixtureEntityDetailProvider } from './entities/fixture-entity-provider.js';
import { registerChatStreamRoutes } from './routes/chat-stream.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerEntityRoutes } from './routes/entities.js';
import { registerEventsBatchRoutes } from './routes/events-batch.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerCors } from './security/cors.js';
import { registerRateLimit } from './security/rate-limit.js';
import { registerSessionGuard } from './security/require-session.js';
import {
  InMemoryRateLimitStore,
  type RateLimitStore,
} from './stores/rate-limit-store.js';
import {
  InMemorySessionStore,
  type SessionStore,
} from './stores/session-store.js';
import {
  createRedisClient,
  RedisRateLimitStore,
  RedisSessionStore,
} from './stores/redis-stores.js';

function buildEntityProvider(config: RuntimeConfig): EntityDetailProvider {
  return config.entityDetailProvider === 'fixture'
    ? new FixtureEntityDetailProvider()
    : new UnconfiguredEntityDetailProvider();
}

export interface AppStores {
  sessionStore: SessionStore;
  rateLimitStore: RateLimitStore;
  close: () => Promise<void>;
}

/** 按配置创建共享存储；memory 仅供单元测试。 */
export function buildStores(config: RuntimeConfig): AppStores {
  if (config.storeBackend === 'memory') {
    const sessionStore = new InMemorySessionStore();
    const rateLimitStore = new InMemoryRateLimitStore();
    return {
      sessionStore,
      rateLimitStore,
      close: async () => {
        await sessionStore.close();
        await rateLimitStore.close();
      },
    };
  }

  // 两个 store 共用一条连接，避免每个实例开两倍连接数。
  const redis = createRedisClient(config.redisUrl);
  return {
    sessionStore: new RedisSessionStore(redis),
    rateLimitStore: new RedisRateLimitStore(redis),
    close: async () => {
      await redis.quit().catch(() => undefined);
    },
  };
}

export function buildApp(
  config: RuntimeConfig = loadRuntimeConfig(),
  stores: AppStores = buildStores(config),
): FastifyInstance {
  const app = Fastify({
    logger: buildLoggerOptions(config.logLevel, config.serviceVersion),
  });

  registerRequestContext(app);
  registerCors(app, config.corsAllowedOrigins);
  registerRateLimit(app, config.rateLimit, stores.rateLimitStore);
  registerSessionGuard(app, stores.sessionStore);

  registerSessionRoutes(app, config, stores.sessionStore);
  registerConfigRoutes(app);
  registerChatStreamRoutes(app, config);
  registerChatRoutes(app, config);
  registerFeedbackRoutes(app, config);
  registerEventsBatchRoutes(app);
  registerEntityRoutes(app, config, buildEntityProvider(config));

  // Ops-only: not part of the public /api/v1 surface. In production this
  // must sit behind the reverse proxy, not be exposed publicly (see
  // docs/runbooks/incident-tracing.md).
  app.get('/internal/metrics', async () => metricsSnapshot());

  return app;
}

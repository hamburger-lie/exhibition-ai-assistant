import type { FastifyInstance } from 'fastify';

import type { RateLimitConfig } from '../config/runtime-config.js';
import { publicError, sendError } from '../http/response-envelope.js';
import { metrics } from '../observability/metrics.js';
import type { RateLimitStore } from '../stores/rate-limit-store.js';
import { StoreUnavailableError } from '../stores/store-errors.js';

/**
 * 限流。计数落在共享存储（生产为 Redis），因此配额在多个 BFF 实例之间共用，
 * 而不是每个进程各限各的。
 *
 * 失败关闭：存储不可用时返回 503 而不是放行，避免「Redis 挂了等于没有限流」。
 */
export function registerRateLimit(
  app: FastifyInstance,
  options: RateLimitConfig,
  store: RateLimitStore,
): void {
  app.addHook('onRequest', async (request, reply) => {
    // 运维端点（指标抓取）不算公网流量，且限流触发时仍需可拉取。
    if (request.url.startsWith('/internal/')) {
      return;
    }

    let decision;
    try {
      decision = await store.hit(request.ip, options.windowMs, options.max);
    } catch (error) {
      const operation =
        error instanceof StoreUnavailableError ? error.operation : 'rate limit check';
      request.log.error(
        { error_code: 'UPSTREAM_UNAVAILABLE', operation },
        'rate limit store unavailable; failing closed',
      );
      await sendError(
        reply,
        503,
        request.requestId,
        publicError(
          'UPSTREAM_UNAVAILABLE',
          'rate limit store unavailable',
          '服务暂时不可用，请稍后重试。',
          true,
        ),
      );
      return;
    }

    if (!decision.allowed) {
      reply.header('Retry-After', String(decision.retryAfterSeconds));
      metrics.rateLimited.inc({ route: request.url });
      await sendError(
        reply,
        429,
        request.requestId,
        publicError(
          'RATE_LIMITED',
          'rate limit exceeded',
          '当前咨询较多，请稍后重试。',
          true,
        ),
      );
    }
  });
}

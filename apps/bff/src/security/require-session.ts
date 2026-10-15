import type { FastifyInstance } from 'fastify';

import { publicError, sendError } from '../http/response-envelope.js';
import type { SessionRecord, SessionStore } from '../stores/session-store.js';
import { StoreUnavailableError } from '../stores/store-errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: SessionRecord;
  }
}

/** 契约里声明 `security: []` 的公开端点，其余 /api/v1/* 一律要求会话令牌。 */
const PUBLIC_PATHS = new Set(['/api/v1/session', '/api/v1/config']);

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

/**
 * 会话鉴权。
 *
 * 失败关闭：会话存储不可用时返回 503，绝不「放行以免影响体验」——否则
 * Redis 一挂，任何伪造 token 都能访问受保护端点。
 *
 * 日志只记录路径与错误码，绝不记录 token / Authorization / Cookie。
 */
export function registerSessionGuard(
  app: FastifyInstance,
  store: SessionStore,
): void {
  app.decorateRequest('session', undefined);

  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0] ?? '';
    if (!url.startsWith('/api/v1/') || PUBLIC_PATHS.has(url)) {
      return;
    }

    const token = bearerToken(request.headers.authorization);
    if (!token) {
      await sendError(
        reply,
        401,
        request.requestId,
        publicError(
          'SESSION_EXPIRED',
          'missing session token',
          '会话已恢复，请重新发送。',
          true,
        ),
      );
      return;
    }

    let record: SessionRecord | undefined;
    try {
      record = await store.find(token);
    } catch (error) {
      const operation =
        error instanceof StoreUnavailableError ? error.operation : 'session lookup';
      // 只记操作名和错误码，不带任何凭据。
      request.log.error(
        { error_code: 'UPSTREAM_UNAVAILABLE', operation },
        'session store unavailable; failing closed',
      );
      await sendError(
        reply,
        503,
        request.requestId,
        publicError(
          'UPSTREAM_UNAVAILABLE',
          'session store unavailable',
          '服务暂时不可用，请稍后重试。',
          true,
        ),
      );
      return;
    }

    if (!record) {
      await sendError(
        reply,
        401,
        request.requestId,
        publicError(
          'SESSION_EXPIRED',
          'session token is invalid or expired',
          '会话已恢复，请重新发送。',
          true,
        ),
      );
      return;
    }

    request.session = record;
  });
}

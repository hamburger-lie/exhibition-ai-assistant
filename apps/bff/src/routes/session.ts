import type { FastifyInstance } from 'fastify';

import type { RuntimeConfig } from '../config/runtime-config.js';
import { resolveExpo } from '../config/runtime-config.js';
import { publicError, sendError, sendSuccess } from '../http/response-envelope.js';
import {
  newSessionRecord,
  newSessionToken,
  type SessionStore,
} from '../stores/session-store.js';
import { StoreUnavailableError } from '../stores/store-errors.js';
import { formatAjvErrors, getValidator } from '../validation/schema-validator.js';

const SESSION_REQUEST_REF =
  'https://assistant.example/schemas/chat.schema.json#/$defs/SessionRequest';

/** E01: creates an anonymous session and a short-lived session token. */
export function registerSessionRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
  store: SessionStore,
): void {
  const validateSessionRequest = getValidator(SESSION_REQUEST_REF);

  app.post('/api/v1/session', async (request, reply) => {
    if (!validateSessionRequest(request.body)) {
      return sendError(
        reply,
        400,
        request.requestId,
        publicError(
          'INVALID_ARGUMENT',
          formatAjvErrors(validateSessionRequest.errors),
          '请求参数不合法，请刷新页面后重试。',
        ),
      );
    }

    const { expo_id: expoId } = request.body as { expo_id: string };
    const expo = resolveExpo(expoId);

    if (!expo || expo.blocked) {
      return sendError(
        reply,
        404,
        request.requestId,
        publicError(
          'EXPO_NOT_FOUND',
          `${expoId} is not available`,
          '未找到指定届次的展会数据。',
        ),
      );
    }

    const token = newSessionToken();
    const record = newSessionRecord(expoId, config.sessionTokenTtlSeconds);

    try {
      await store.save(token, record, config.sessionTokenTtlSeconds);
    } catch (error) {
      const operation =
        error instanceof StoreUnavailableError ? error.operation : 'session save';
      // 不记录 token 本身。
      request.log.error(
        { error_code: 'UPSTREAM_UNAVAILABLE', operation },
        'session store unavailable; refusing to issue an unverifiable token',
      );
      return sendError(
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
    }

    return sendSuccess(reply, 201, request.requestId, {
      session_id: record.sessionId,
      anonymous_user_id: record.anonymousUserId,
      session_token: token,
      expires_at: record.expiresAt.toISOString(),
      default_conversation_id: record.defaultConversationId,
    });
  });
}

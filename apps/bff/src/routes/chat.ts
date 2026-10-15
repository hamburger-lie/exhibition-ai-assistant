import type { FastifyInstance, FastifyReply } from 'fastify';

import type { RuntimeConfig } from '../config/runtime-config.js';
import {
  mapErrorCodeToStatus,
  publicError,
  sendError,
  sendSuccess,
  type PublicError,
} from '../http/response-envelope.js';
import { metrics } from '../observability/metrics.js';
import { toPublicChatData } from '../services/chat-replay.js';
import {
  acquireChatSlot,
  completeChatSlot,
  releaseChatSlot,
} from '../services/message-idempotency.js';
import {
  buildAgentRequestPayload,
  mapUpstreamError,
  type PublicChatRequestBody,
} from '../upstream/agent-mapping.js';
import { callAgent, type CallAgentResult } from '../upstream/b-client.js';
import { formatAjvErrors, getValidator } from '../validation/schema-validator.js';

const PUBLIC_CHAT_REQUEST_REF =
  'https://assistant.example/schemas/chat.schema.json#/$defs/PublicChatRequest';

const SCENARIO_HEADER = 'x-scenario-id';
const TIMEOUT_ABORT_REASON = 'timeout';

/** E04: non-stream fallback, proxies to I02 and drops internal-only fields. */
export function registerChatRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
): void {
  const validateBody = getValidator(PUBLIC_CHAT_REQUEST_REF);

  app.post('/api/v1/chat', async (request, reply) => {
    if (!validateBody(request.body)) {
      return sendError(
        reply,
        400,
        request.requestId,
        publicError(
          'INVALID_ARGUMENT',
          formatAjvErrors(validateBody.errors),
          '请求参数不合法，请刷新页面后重试。',
        ),
      );
    }

    const body = request.body as PublicChatRequestBody;
    request.log = request.log.child({ conversation_id: body.conversation_id });

    // API-01：相同 client.message_id 只生成一次回答（持久化 + 唯一约束）。
    const clientMessageId = body.client?.message_id;
    if (clientMessageId) {
      const slot = await acquireChatSlot(
        clientMessageId,
        request.requestId,
        config.bClient.preStreamTimeoutMs,
      );

      if (slot.kind === 'replay') {
        return sendSuccess(
          reply,
          200,
          request.requestId,
          toPublicChatData(slot.result),
        );
      }

      if (slot.kind === 'timeout') {
        // 另一实例仍在生成且超过本次等待预算：按超时语义返回可重试错误，
        // 不重复调用上游（契约的 ErrorCode 枚举已冻结，这是其中语义最贴近
        // 「等太久了，请重试」的一个）。
        metrics.upstreamErrors.inc({ code: 'AI_UPSTREAM_TIMEOUT' });
        return sendError(
          reply,
          504,
          request.requestId,
          publicError(
            'AI_UPSTREAM_TIMEOUT',
            'a concurrent request with the same client.message_id is still generating',
            '等待时间较长，请重试。',
            true,
          ),
        );
      }
    }

    const payload = buildAgentRequestPayload(request.requestId, body);
    const controller = new AbortController();
    let generated = false;
    let slotReleased = false;
    const timeoutHandle = setTimeout(() => {
      controller.abort(TIMEOUT_ABORT_REASON);
    }, config.bClient.preStreamTimeoutMs);

    /**
     * 失败时必须先释放幂等槽位再回响应：否则客户端收到错误立刻重试，会撞上
     * 仍是 in_progress 的记录而白等一个等待预算。
     */
    async function failWith(status: number, error: PublicError) {
      if (clientMessageId && !slotReleased) {
        await releaseChatSlot(clientMessageId);
        slotReleased = true;
      }
      return sendError(reply, status, request.requestId, error);
    }

    const scenarioOverride = request.headers[SCENARIO_HEADER];
    const extraHeaders =
      typeof scenarioOverride === 'string'
        ? { [SCENARIO_HEADER]: scenarioOverride }
        : undefined;

    try {
      let outcome: CallAgentResult | undefined;
      for (let attempt = 1; attempt <= config.bClient.maxPreStreamAttempts; attempt += 1) {
        try {
          outcome = await callAgent(
            config.bClient,
            payload,
            controller.signal,
            extraHeaders,
          );
        } catch {
          if (controller.signal.reason === TIMEOUT_ABORT_REASON) {
            metrics.upstreamErrors.inc({ code: 'AI_UPSTREAM_TIMEOUT' });
            return await failWith(
              504,
              publicError(
                'AI_UPSTREAM_TIMEOUT',
                'upstream did not respond before the timeout budget',
                '响应超时，请重试。',
                true,
              ),
            );
          }
          if (attempt < config.bClient.maxPreStreamAttempts) {
            continue;
          }
          metrics.upstreamErrors.inc({ code: 'UPSTREAM_UNAVAILABLE' });
          return await failWith(
            503,
            publicError(
              'UPSTREAM_UNAVAILABLE',
              'failed to reach upstream agent service',
              '服务暂时不可用，请稍后重试。',
              true,
            ),
          );
        }

        if (outcome.status === 200) {
          break;
        }
        if (attempt < config.bClient.maxPreStreamAttempts) {
          continue;
        }
      }

      if (!outcome || outcome.status !== 200) {
        const error = mapUpstreamError(outcome?.status ?? 502, outcome?.body);
        metrics.upstreamErrors.inc({ code: error.code });
        forwardRetryAfter(reply, outcome?.headers);
        return await failWith(mapErrorCodeToStatus(error.code), error);
      }

      const internal = outcome.body as {
        conversation_id: string;
        message_id: string;
        answer: string;
        answer_status: string;
        cards: unknown[];
        citations: unknown[];
        suggestions: string[];
        versions?: { kb?: string; search?: string };
      };

      if (clientMessageId) {
        await completeChatSlot(clientMessageId, {
          conversationId: internal.conversation_id,
          messageId: internal.message_id,
          answer: internal.answer,
          answerStatus: internal.answer_status,
          cards: internal.cards,
          citations: internal.citations,
          suggestions: internal.suggestions,
          requestId: request.requestId,
        });
        generated = true;
      }

      return sendSuccess(reply, 200, request.requestId, {
        conversation_id: internal.conversation_id,
        message_id: internal.message_id,
        answer: internal.answer,
        answer_status: internal.answer_status,
        cards: internal.cards,
        citations: internal.citations,
        suggestions: internal.suggestions,
        ...(internal.versions
          ? {
              versions: {
                kb: internal.versions.kb ?? '',
                search: internal.versions.search ?? '',
              },
            }
          : {}),
      });
    } finally {
      clearTimeout(timeoutHandle);
      // 生成未成功就释放槽位，让用户重试可以重新生成。
      // 安全网：任何未覆盖的异常路径也不会留下卡死的 in_progress 记录。
      if (clientMessageId && !generated && !slotReleased) {
        await releaseChatSlot(clientMessageId);
      }
    }
  });
}

/**
 * 规格 §6：429/503 的恢复要「按 Retry-After」。上游给了 Retry-After 就原样
 * 透传给浏览器，让客户端知道多久后可以重试。
 */
function forwardRetryAfter(reply: FastifyReply, headers: Headers | undefined) {
  const retryAfter = headers?.get('retry-after');
  if (retryAfter) {
    reply.header('Retry-After', retryAfter);
  }
}

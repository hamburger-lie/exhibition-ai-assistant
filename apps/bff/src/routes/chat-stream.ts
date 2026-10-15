import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { encodeSseFrame, SseStreamParser, type SseFrame } from '@ai-assistant/sse';

import type { RuntimeConfig } from '../config/runtime-config.js';
import {
  mapErrorCodeToStatus,
  publicError,
  sendError,
  type PublicError,
} from '../http/response-envelope.js';
import { metrics } from '../observability/metrics.js';
import { buildReplayFrames } from '../services/chat-replay.js';
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
import { streamAgent, type StreamAgentResult } from '../upstream/b-client.js';
import { UpstreamEventWhitelist } from '../upstream/event-whitelist.js';
import { formatAjvErrors, getValidator } from '../validation/schema-validator.js';

const PUBLIC_CHAT_REQUEST_REF =
  'https://assistant.example/schemas/chat.schema.json#/$defs/PublicChatRequest';

const SCENARIO_HEADER = 'x-scenario-id';
const TIMEOUT_ABORT_REASON = 'timeout';

/** E03: proxies POST /api/v1/chat/stream to I01 with an SSE passthrough. */
export function registerChatStreamRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
): void {
  const validateBody = getValidator(PUBLIC_CHAT_REQUEST_REF);

  app.post('/api/v1/chat/stream', async (request, reply) => {
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
        return writeFrames(
          reply,
          buildReplayFrames(request.requestId, slot.result),
        );
      }

      if (slot.kind === 'timeout') {
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
    let clientDisconnected = false;
    // `request.raw`'s 'close' fires as soon as the request body finishes
    // reading, long before the client actually disconnects — the response
    // socket's 'close' is the correct signal (fires on abort, and also
    // after a normal end(), guarded by writableEnded below).
    const onClose = () => {
      if (!reply.raw.writableEnded) {
        clientDisconnected = true;
        controller.abort();
      }
    };
    reply.raw.on('close', onClose);

    const timeoutHandle = setTimeout(() => {
      controller.abort(TIMEOUT_ABORT_REASON);
    }, config.bClient.preStreamTimeoutMs);

    const scenarioOverride = request.headers[SCENARIO_HEADER];
    const extraHeaders =
      typeof scenarioOverride === 'string'
        ? { [SCENARIO_HEADER]: scenarioOverride }
        : undefined;

    const startedAt = Date.now();
    let generated = false;
    let slotReleased = false;

    /**
     * 失败时先释放幂等槽位再回响应，避免客户端立刻重试时撞上仍是
     * in_progress 的记录而白等一个等待预算。
     */
    async function failWith(status: number, error: PublicError) {
      if (clientMessageId && !slotReleased) {
        await releaseChatSlot(clientMessageId);
        slotReleased = true;
      }
      return sendError(reply, status, request.requestId, error);
    }

    try {
      // 首事件前失败仅允许同一 request_id 重试一次；首事件后断流不透明重试。
      let outcome: StreamAgentResult | undefined;
      for (let attempt = 1; attempt <= config.bClient.maxPreStreamAttempts; attempt += 1) {
        try {
          outcome = await streamAgent(
            config.bClient,
            payload,
            controller.signal,
            extraHeaders,
          );
        } catch {
          if (clientDisconnected) {
            return undefined;
          }
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

      if (clientDisconnected) {
        return undefined;
      }

      if (!outcome || outcome.status !== 200 || !outcome.body) {
        const error = mapUpstreamError(outcome?.status ?? 502, outcome?.errorBody);
        metrics.upstreamErrors.inc({ code: error.code });
        forwardRetryAfter(reply, outcome?.headers);
        return await failWith(mapErrorCodeToStatus(error.code), error);
      }

      clearTimeout(timeoutHandle);
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
        connection: 'keep-alive',
      });

      const parser = new SseStreamParser();
      const whitelist = new UpstreamEventWhitelist();
      let firstEventForwarded = false;
      let terminalEventName: string | undefined;
      const accumulated = {
        conversationId: body.conversation_id,
        messageId: '',
        answer: '',
        answerStatus: 'answered',
        cards: [] as unknown[],
        citations: [] as unknown[],
        suggestions: [] as string[],
      };

      for await (const chunk of Readable.fromWeb(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outcome.body as any,
      )) {
        const bytes =
          chunk instanceof Uint8Array ? chunk : Buffer.from(chunk as string);
        const frames = parser.push(bytes);

        for (const frame of frames) {
          const forwarded = whitelist.filter(frame);
          if (forwarded) {
            if (!firstEventForwarded) {
              firstEventForwarded = true;
              metrics.firstEventLatencyMs.observe(Date.now() - startedAt);
            }
            accumulateForReplay(accumulated, forwarded);
            if (forwarded.event === 'message.done' || forwarded.event === 'message.error') {
              terminalEventName = forwarded.event;
            }
            reply.raw.write(encodeSseFrame(forwarded));
          }
        }

        if (whitelist.isTerminated) {
          break;
        }
      }

      if (!whitelist.isTerminated) {
        metrics.streamInterrupted.inc();
      } else if (
        // 只有正常收束（message.done）才写入可回放结果；message.error 或
        // 断流都不写，让用户重试可以重新生成。
        terminalEventName === 'message.done' &&
        clientMessageId &&
        accumulated.messageId
      ) {
        await completeChatSlot(clientMessageId, {
          ...accumulated,
          requestId: request.requestId,
        });
        generated = true;
      }

      reply.raw.end();
      return undefined;
    } finally {
      clearTimeout(timeoutHandle);
      reply.raw.off('close', onClose);
      // 安全网：断流/异常路径也不会留下卡死的 in_progress 记录。
      if (clientMessageId && !generated && !slotReleased) {
        await releaseChatSlot(clientMessageId);
      }
    }
  });
}

interface ReplayAccumulator {
  conversationId: string;
  messageId: string;
  answer: string;
  answerStatus: string;
  cards: unknown[];
  citations: unknown[];
  suggestions: string[];
}

function accumulateForReplay(accumulator: ReplayAccumulator, frame: SseFrame): void {
  const data = (frame.data ?? {}) as Record<string, unknown>;
  switch (frame.event) {
    case 'message.start':
      if (typeof data.message_id === 'string') accumulator.messageId = data.message_id;
      if (typeof data.conversation_id === 'string') {
        accumulator.conversationId = data.conversation_id;
      }
      break;
    case 'message.delta':
      if (typeof data.delta === 'string') accumulator.answer += data.delta;
      break;
    case 'entity.card':
      if (data.card) accumulator.cards.push(data.card);
      break;
    case 'citation':
      if (data.citation) accumulator.citations.push(data.citation);
      break;
    case 'suggestion.list':
      if (Array.isArray(data.items)) {
        accumulator.suggestions = (data.items as Array<{ text?: unknown }>)
          .map((item) => item.text)
          .filter((text): text is string => typeof text === 'string');
      }
      break;
    case 'message.done':
      if (typeof data.answer_status === 'string') {
        accumulator.answerStatus = data.answer_status;
      }
      break;
    default:
      break;
  }
}


/** 把一段完整帧序列写成 SSE 响应（API-01 回放路径）。 */
function writeFrames(reply: FastifyReply, frames: SseFrame[]): undefined {
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
  });
  for (const frame of frames) {
    reply.raw.write(encodeSseFrame(frame));
  }
  reply.raw.end();
  return undefined;
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

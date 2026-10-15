import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import type { RuntimeConfig } from '../config/runtime-config.js';
import { publicError, sendError, sendSuccess } from '../http/response-envelope.js';
import { metrics } from '../observability/metrics.js';
import {
  createFeedbackIfAbsent,
  findFeedbackByFeedbackId,
  markOutboxResolved,
} from '../persistence/repositories.js';
import { enqueueQualitySignal } from '../services/quality-outbox.js';
import { submitQualitySignals, type QualitySignal } from '../upstream/b-client.js';
import { formatAjvErrors, getValidator } from '../validation/schema-validator.js';

const FEEDBACK_REQUEST_REF =
  'https://assistant.example/schemas/feedback.schema.json#/$defs/FeedbackRequest';

// FeedbackRequest 未携带 expo_id；会话/消息表尚未在别处落库前先用已知届次占位。
const DEFAULT_EXPO_ID_FOR_SIGNALS = 'expo_demo_2026_spring';

interface FeedbackRequestBody {
  feedback_id: string;
  request_id: string;
  conversation_id: string;
  message_id: string;
  rating: 'positive' | 'negative';
  reason?: string;
  target?: { entity_type: string; entity_id: string } | null;
  comment?: string;
}

/** E05: thumbs up/down, idempotent by feedback_id; I06 forwarding is best-effort. */
export function registerFeedbackRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
): void {
  const validateBody = getValidator(FEEDBACK_REQUEST_REF);

  app.post('/api/v1/feedback', async (request, reply) => {
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

    const body = request.body as FeedbackRequestBody;

    // 相同 feedback_id 重发不重复计数：直接返回已记录的结果。
    const existing = await findFeedbackByFeedbackId(body.feedback_id);
    if (existing) {
      return sendSuccess(reply, 200, request.requestId, {
        feedback_id: existing.feedbackId,
        accepted: true,
      });
    }

    const record = await createFeedbackIfAbsent({
      feedbackId: body.feedback_id,
      requestId: body.request_id,
      conversationId: body.conversation_id,
      messageId: body.message_id,
      rating: body.rating,
      ...(body.reason ? { reason: body.reason } : {}),
      ...(body.comment ? { comment: body.comment } : {}),
    });

    if (body.rating === 'negative') {
      const signal: QualitySignal = {
        signal_id: `signal_${randomUUID()}`,
        signal_type: 'negative_feedback',
        occurred_at: record.createdAt.toISOString(),
        request_id: body.request_id,
        message_id: body.message_id,
        expo_id: DEFAULT_EXPO_ID_FOR_SIGNALS,
        payload: { reason: body.reason ?? null, target: body.target ?? null },
      };

      // 先落库再尝试转发：即便进程在转发前崩溃，signal 也不会丢失。
      const outboxEntry = await enqueueQualitySignal({
        feedbackId: body.feedback_id,
        signalType: signal.signal_type,
        payload: signal as unknown as Prisma.InputJsonValue,
      });

      try {
        const result = await submitQualitySignals(
          config.bClient,
          [signal],
          new AbortController().signal,
        );
        if (result.status === 202) {
          await markOutboxResolved(outboxEntry.id);
        } else {
          // 非 202 但未抛错：保留在 outbox，由 worker 按退避策略重试。
          metrics.feedbackFailures.inc();
        }
      } catch {
        // I06 不可用时 E05 仍返回成功；失败已经持久化在 outbox。
        metrics.feedbackFailures.inc();
      }
    }

    return sendSuccess(reply, 200, request.requestId, {
      feedback_id: record.feedbackId,
      accepted: true,
    });
  });
}

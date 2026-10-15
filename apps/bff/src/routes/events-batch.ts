import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';

import { publicError, sendError, sendSuccess } from '../http/response-envelope.js';
import { insertAnalyticsEventIfAbsent } from '../persistence/repositories.js';
import { formatAjvErrors, getValidator } from '../validation/schema-validator.js';

const EVENTS_BATCH_REQUEST_REF =
  'https://assistant.example/schemas/events.schema.json#/$defs/EventsBatchRequest';

interface BehaviorEventBody {
  event_id: string;
  event_type: string;
  occurred_at: string;
  request_id: string;
  message_id?: string;
  entity?: { type: string; id: string };
  props?: Record<string, unknown>;
}

/** E06: up to 50 behavior events per batch; idempotent by event_id. */
export function registerEventsBatchRoutes(app: FastifyInstance): void {
  const validateBody = getValidator(EVENTS_BATCH_REQUEST_REF);

  app.post('/api/v1/events/batch', async (request, reply) => {
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

    const { events } = request.body as { events: BehaviorEventBody[] };
    let accepted = 0;

    for (const event of events) {
      try {
        // 埋点失败不阻塞 Chat：单条事件写入失败只跳过该条，不影响整批响应。
        await insertAnalyticsEventIfAbsent({
          eventId: event.event_id,
          eventType: event.event_type,
          occurredAt: new Date(event.occurred_at),
          requestId: event.request_id,
          ...(event.message_id ? { messageId: event.message_id } : {}),
          ...(event.entity ? { entityType: event.entity.type } : {}),
          ...(event.entity ? { entityId: event.entity.id } : {}),
          ...(event.props
            ? { props: event.props as Prisma.InputJsonValue }
            : {}),
        });
        accepted += 1;
      } catch {
        // Skip this event; the rest of the batch still proceeds.
      }
    }

    return sendSuccess(reply, 200, request.requestId, { accepted });
  });
}

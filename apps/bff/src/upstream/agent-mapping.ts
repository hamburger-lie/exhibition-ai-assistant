import { publicError, type PublicError } from '../http/response-envelope.js';
import type { AgentRequestPayload } from './b-client.js';

export interface PublicChatRequestBody {
  conversation_id: string;
  message: string;
  context: {
    expo_id: string;
    locale?: string;
    current_hall_id?: string | null;
    selected_entity_ids?: string[];
  };
  client?: {
    message_id?: string;
    supports?: string[];
  };
}

export function buildAgentRequestPayload(
  requestId: string,
  body: PublicChatRequestBody,
): AgentRequestPayload {
  return {
    request_id: requestId,
    conversation_id: body.conversation_id,
    query: body.message,
    expo_id: body.context.expo_id,
    locale: body.context.locale ?? 'zh-CN',
    context: {
      current_hall_id: body.context.current_hall_id ?? null,
      selected_entity_ids: body.context.selected_entity_ids ?? [],
    },
    options: {
      include_citations: true,
      include_suggestions: true,
      include_internal_trace: false,
    },
  };
}

/**
 * Translates an upstream (I0x) InternalErrorEnvelope-shaped body into a
 * PublicError: keeps code/message/user_message/retryable, strips trace_id
 * and any other internal-only field so nothing leaks to the browser.
 */
export function mapUpstreamError(
  status: number,
  body: Record<string, unknown> | undefined,
): PublicError {
  const errorField =
    body && typeof body.error === 'object' && body.error !== null
      ? (body.error as Record<string, unknown>)
      : undefined;

  if (errorField && typeof errorField.code === 'string') {
    return publicError(
      errorField.code,
      typeof errorField.message === 'string'
        ? errorField.message
        : 'upstream error',
      typeof errorField.user_message === 'string'
        ? errorField.user_message
        : '服务暂时不可用，请稍后重试。',
      typeof errorField.retryable === 'boolean' ? errorField.retryable : true,
    );
  }

  if (status === 429) {
    return publicError(
      'RATE_LIMITED',
      'upstream rate limited',
      '请求过于频繁，请稍后重试。',
      true,
    );
  }

  if (status === 504) {
    return publicError(
      'AI_UPSTREAM_TIMEOUT',
      'upstream timed out',
      '响应超时，请重试。',
      true,
    );
  }

  return publicError(
    'UPSTREAM_UNAVAILABLE',
    `upstream responded with status ${status}`,
    '服务暂时不可用，请稍后重试。',
    true,
  );
}

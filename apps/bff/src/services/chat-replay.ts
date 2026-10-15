import type { SseFrame } from '@ai-assistant/sse';

import type { CachedChatResult } from './message-idempotency.js';

/** 把幂等缓存的结果还原成 E04 的 PublicChatData 形状。 */
export function toPublicChatData(result: CachedChatResult) {
  return {
    conversation_id: result.conversationId,
    message_id: result.messageId,
    answer: result.answer,
    answer_status: result.answerStatus,
    cards: result.cards,
    citations: result.citations,
    suggestions: result.suggestions,
  };
}

/**
 * 把幂等缓存的结果还原成一段完整、以 message.done 收尾的 SSE 序列，供 E03
 * 回放。回放不会再次调用上游，因此 latency/versions 等运行时字段用零值填充，
 * 不伪造上一次的真实观测值。
 */
export function buildReplayFrames(
  requestId: string,
  result: CachedChatResult,
): SseFrame[] {
  const base = { request_id: requestId, message_id: result.messageId };

  return [
    {
      event: 'message.start',
      data: {
        request_id: requestId,
        conversation_id: result.conversationId,
        message_id: result.messageId,
        protocol_version: '1.0.0',
      },
    },
    ...(result.answer
      ? [{ event: 'message.delta', data: { ...base, delta: result.answer } }]
      : []),
    ...result.cards.map((card) => ({
      event: 'entity.card',
      data: { ...base, card },
    })),
    ...result.citations.map((citation) => ({
      event: 'citation',
      data: { ...base, citation },
    })),
    ...(result.suggestions.length > 0
      ? [
          {
            event: 'suggestion.list',
            data: {
              ...base,
              items: result.suggestions.map((text, index) => ({
                id: `${result.messageId}_replay_${index}`,
                text,
              })),
            },
          },
        ]
      : []),
    {
      event: 'message.done',
      data: {
        request_id: requestId,
        conversation_id: result.conversationId,
        message_id: result.messageId,
        answer_status: result.answerStatus,
        intent: 'unknown',
        search_route: 'none',
        confidence: 'medium',
        latency_ms: 0,
        versions: { kb: '', search: '' },
      },
    },
  ];
}

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { SseStreamParser, TerminalEventGuard } from '@ai-assistant/sse';

import {
  ApiError,
  chatFallback,
  streamChat,
  type PublicChatRequestPayload,
} from '../../shared/api/client.js';
import { recordEvent } from '../../shared/telemetry/record-event.js';
import {
  chatReducer,
  createInitialChatState,
  type ChatState,
} from './chat-reducer.js';

/** 规格 §6 的用户文案与恢复能力。 */
const ERROR_COPY: Record<string, { message: string; retryable: boolean }> = {
  NETWORK_UNAVAILABLE: { message: '网络连接异常，请检查后重试', retryable: true },
  SESSION_EXPIRED: { message: '会话已恢复，请重新发送', retryable: true },
  RATE_LIMITED: { message: '当前咨询较多，请稍后重试', retryable: true },
  AI_UPSTREAM_TIMEOUT: { message: '等待时间较长，请重试', retryable: true },
  SEARCH_TIMEOUT: { message: '等待时间较长，请重试', retryable: true },
  RETRIEVE_TIMEOUT: { message: '等待时间较长，请重试', retryable: true },
  UPSTREAM_UNAVAILABLE: { message: '服务暂时不可用，请稍后重试', retryable: true },
  KNOWLEDGE_UNAVAILABLE: { message: '服务暂时不可用，请稍后重试', retryable: true },
  STREAM_INTERRUPTED: {
    message: '回答中断，已保留当前内容，可重新获取',
    retryable: true,
  },
  INVALID_ARGUMENT: { message: '请求参数不合法，请修改后重试', retryable: false },
  EXPO_NOT_FOUND: { message: '未找到指定届次的展会数据', retryable: false },
};

function errorCopy(code: string) {
  return (
    ERROR_COPY[code] ?? { message: '出现了一点问题，请稍后重试', retryable: true }
  );
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseChatStreamOptions {
  conversationId: string;
  expoId: string;
  sessionToken: string;
}

export interface UseChatStreamResult {
  state: ChatState;
  sendMessage: (text: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useChatStream({
  conversationId,
  expoId,
  sessionToken,
}: UseChatStreamOptions): UseChatStreamResult {
  const [state, dispatch] = useReducer(
    chatReducer,
    conversationId,
    createInitialChatState,
  );
  const abortRef = useRef<AbortController | null>(null);
  // 用 ref 兜底并发：reducer 的 isSending 在同一 tick 内可能还没提交。
  const inFlightRef = useRef(false);

  // bootstrap 异步完成后补入服务端签发的默认 conversation_id。
  useEffect(() => {
    if (conversationId && !state.conversationId) {
      dispatch({ type: 'RESET_CONVERSATION', conversationId });
    }
  }, [conversationId, state.conversationId]);

  const runFallback = useCallback(
    async (
      assistantMessageId: string,
      payload: PublicChatRequestPayload,
      fallbackReasonCode: string,
    ) => {
      // 规格 §6：降级期间保持同一消息 UI，只显示「正在整理回答」。
      dispatch({ type: 'FALLBACK_STARTED', assistantMessageId });
      try {
        const { data, requestId } = await chatFallback(payload, sessionToken);
        dispatch({
          type: 'FALLBACK_ANSWER',
          assistantMessageId,
          answer: data.answer,
          answerStatus: data.answer_status,
          cards: data.cards,
          citations: data.citations,
          suggestions: data.suggestions,
          requestId,
        });
      } catch (error) {
        const code = error instanceof ApiError ? error.code : fallbackReasonCode;
        const copy = errorCopy(code);
        dispatch({
          type: 'STREAM_ERROR',
          assistantMessageId,
          code,
          userMessage: copy.message,
          retryable: copy.retryable,
        });
      }
    },
    [sessionToken],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      // 规格 §5.1：不允许重复发送。
      if (inFlightRef.current || trimmed.length === 0) {
        return;
      }
      inFlightRef.current = true;

      const clientMessageId = randomId('client_msg');
      const assistantMessageId = randomId('assistant_msg');

      dispatch({
        type: 'SEND_MESSAGE',
        text: trimmed,
        clientMessageId,
        userMessageId: randomId('user_msg'),
        assistantMessageId,
      });

      const payload: PublicChatRequestPayload = {
        conversation_id: state.conversationId || conversationId,
        message: trimmed,
        context: { expo_id: expoId },
        client: { message_id: clientMessageId, supports: ['sse_v1'] },
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await streamChat(payload, sessionToken, controller.signal);

        if (result.status !== 200 || !result.body) {
          const code = result.errorEnvelope?.error.code ?? 'UPSTREAM_UNAVAILABLE';
          // 首事件前失败：按契约走非流式降级，保持同一消息 UI。
          await runFallback(assistantMessageId, payload, code);
          return;
        }

        const parser = new SseStreamParser();
        const guard = new TerminalEventGuard();
        const reader = result.body.getReader();
        let sawFirstEvent = false;

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          for (const frame of parser.push(value)) {
            if (!guard.accept(frame)) continue;
            sawFirstEvent = true;
            dispatch({ type: 'SSE_EVENT', assistantMessageId, frame });
          }

          if (guard.isTerminated) break;
        }

        if (!guard.isTerminated) {
          if (sawFirstEvent) {
            // 首事件后断流：不做透明重试，保留已生成内容并给出可重试错误。
            const copy = errorCopy('STREAM_INTERRUPTED');
            dispatch({
              type: 'STREAM_ERROR',
              assistantMessageId,
              code: 'STREAM_INTERRUPTED',
              userMessage: copy.message,
              retryable: copy.retryable,
            });
          } else {
            await runFallback(assistantMessageId, payload, 'UPSTREAM_UNAVAILABLE');
          }
        }
      } catch {
        if (controller.signal.aborted) {
          return; // cancel() 已派发 STREAM_CANCELLED。
        }
        const copy = errorCopy('NETWORK_UNAVAILABLE');
        dispatch({
          type: 'STREAM_ERROR',
          assistantMessageId,
          code: 'NETWORK_UNAVAILABLE',
          userMessage: copy.message,
          retryable: copy.retryable,
        });
      } finally {
        abortRef.current = null;
        inFlightRef.current = false;
      }
    },
    [conversationId, expoId, sessionToken, runFallback, state.conversationId],
  );

  const cancel = useCallback(() => {
    const assistantMessage = [...state.messages]
      .reverse()
      .find(
        (message) =>
          message.role === 'assistant' &&
          (message.status === 'pending' || message.status === 'streaming'),
      );

    abortRef.current?.abort();
    inFlightRef.current = false;

    if (assistantMessage) {
      recordEvent('stream_cancel', {
        message_id: assistantMessage.messageId,
        props: { cancel_reason: 'user_initiated' },
      });
      dispatch({
        type: 'STREAM_CANCELLED',
        assistantMessageId: assistantMessage.messageId,
      });
    }
  }, [state.messages]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    dispatch({
      type: 'RESET_CONVERSATION',
      conversationId: randomId('conv'),
    });
  }, []);

  return { state, sendMessage, cancel, reset };
}

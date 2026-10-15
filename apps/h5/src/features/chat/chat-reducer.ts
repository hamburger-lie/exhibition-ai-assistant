import type { SseFrame } from '@ai-assistant/sse';

import type { CitationData, EntityCardData } from '../cards/card-types.js';

export interface SuggestionItem {
  id: string;
  text: string;
}

export type ChatMessageStatus =
  | 'pending'
  | 'streaming'
  | 'done'
  | 'error'
  | 'cancelled';

export interface ChatMessage {
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  status: ChatMessageStatus;
  /** 上游 status.update 的 stage，UI 据此映射用户可读文案（规格 §5.2）。 */
  statusStage: string | null;
  /** stage 未知时的兜底文案。 */
  statusText: string | null;
  cards: EntityCardData[];
  citations: CitationData[];
  suggestions: SuggestionItem[];
  errorCode: string | null;
  errorUserMessage: string | null;
  /** 错误是否可重试，决定是否展示恢复操作（规格 §6）。 */
  errorRetryable: boolean;
  /** 触发本条回答的原始提问，用于错误后的「重试」。 */
  sourceQuery: string | null;
  /** 关联产生本条回答的 BFF 请求，用于反馈绑定。 */
  requestId: string | null;
}

export interface ChatState {
  conversationId: string;
  messages: ChatMessage[];
  isSending: boolean;
  /** 在途消息的幂等键。 */
  pendingClientMessageId: string | null;
}

export function createInitialChatState(conversationId: string): ChatState {
  return {
    conversationId,
    messages: [],
    isSending: false,
    pendingClientMessageId: null,
  };
}

function emptyMessage(
  messageId: string,
  role: ChatMessage['role'],
): ChatMessage {
  return {
    messageId,
    role,
    text: '',
    status: 'pending',
    statusStage: null,
    statusText: null,
    cards: [],
    citations: [],
    suggestions: [],
    errorCode: null,
    errorUserMessage: null,
    errorRetryable: false,
    sourceQuery: null,
    requestId: null,
  };
}

export type ChatAction =
  | {
      type: 'SEND_MESSAGE';
      text: string;
      clientMessageId: string;
      userMessageId: string;
      assistantMessageId: string;
    }
  | { type: 'SSE_EVENT'; assistantMessageId: string; frame: SseFrame }
  | {
      type: 'STREAM_ERROR';
      assistantMessageId: string;
      code: string;
      userMessage: string;
      retryable: boolean;
    }
  | { type: 'STREAM_CANCELLED'; assistantMessageId: string }
  | { type: 'FALLBACK_STARTED'; assistantMessageId: string }
  | {
      type: 'FALLBACK_ANSWER';
      assistantMessageId: string;
      answer: string;
      answerStatus: string;
      cards: EntityCardData[];
      citations: CitationData[];
      suggestions: string[];
      requestId: string;
    }
  | { type: 'RESET_CONVERSATION'; conversationId: string };

function updateMessage(
  state: ChatState,
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
): ChatState {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.messageId === messageId ? updater(message) : message,
    ),
  };
}

function applySseEvent(baseMessage: ChatMessage, frame: SseFrame): ChatMessage {
  const data = (frame.data ?? {}) as Record<string, unknown>;
  const requestId =
    typeof data.request_id === 'string' ? data.request_id : baseMessage.requestId;
  const message: ChatMessage = { ...baseMessage, requestId };

  switch (frame.event) {
    case 'message.start':
      return { ...message, status: 'streaming' };
    case 'status.update':
      return {
        ...message,
        status: 'streaming',
        statusStage: typeof data.stage === 'string' ? data.stage : null,
        statusText:
          typeof data.display_text === 'string' ? data.display_text : null,
      };
    case 'message.delta':
      // 规格 §5.2：收到首个 delta 后状态行收起，改为展示正文。
      return {
        ...message,
        status: 'streaming',
        statusStage: null,
        statusText: null,
        text: message.text + (typeof data.delta === 'string' ? data.delta : ''),
      };
    case 'entity.card':
      return { ...message, cards: [...message.cards, data.card as EntityCardData] };
    case 'citation':
      return {
        ...message,
        citations: [...message.citations, data.citation as CitationData],
      };
    case 'suggestion.list': {
      const items = Array.isArray(data.items) ? data.items : [];
      // 规格 §4.4：推荐追问最多 3–4 条。
      return { ...message, suggestions: (items as SuggestionItem[]).slice(0, 4) };
    }
    case 'message.done':
      return { ...message, status: 'done', statusStage: null, statusText: null };
    case 'message.error': {
      const error = (data.error ?? {}) as Record<string, unknown>;
      return {
        ...message,
        status: 'error',
        statusStage: null,
        statusText: null,
        errorCode: typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR',
        errorUserMessage:
          typeof error.user_message === 'string'
            ? error.user_message
            : '出现了一点问题，请稍后重试。',
        errorRetryable:
          typeof error.retryable === 'boolean' ? error.retryable : true,
      };
    }
    default:
      // 未知事件：安全忽略（规格 §10）。
      return message;
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SEND_MESSAGE': {
      // 防重复发送：已有请求在途时忽略。
      if (state.isSending) {
        return state;
      }

      const userMessage: ChatMessage = {
        ...emptyMessage(action.userMessageId, 'user'),
        text: action.text,
        status: 'done',
      };
      const assistantMessage: ChatMessage = {
        ...emptyMessage(action.assistantMessageId, 'assistant'),
        sourceQuery: action.text,
      };

      return {
        ...state,
        isSending: true,
        pendingClientMessageId: action.clientMessageId,
        messages: [...state.messages, userMessage, assistantMessage],
      };
    }

    case 'SSE_EVENT': {
      const next = updateMessage(state, action.assistantMessageId, (message) =>
        applySseEvent(message, action.frame),
      );
      const isTerminal =
        action.frame.event === 'message.done' ||
        action.frame.event === 'message.error';
      return isTerminal
        ? { ...next, isSending: false, pendingClientMessageId: null }
        : next;
    }

    case 'STREAM_ERROR': {
      const next = updateMessage(state, action.assistantMessageId, (message) => ({
        ...message,
        status: 'error',
        statusStage: null,
        statusText: null,
        errorCode: action.code,
        errorUserMessage: action.userMessage,
        errorRetryable: action.retryable,
      }));
      return { ...next, isSending: false, pendingClientMessageId: null };
    }

    case 'STREAM_CANCELLED': {
      // 规格 §5.4：保留已生成正文与卡片，仅在尾部标记「已停止生成」。
      const next = updateMessage(state, action.assistantMessageId, (message) => ({
        ...message,
        status: 'cancelled',
        statusStage: null,
        statusText: null,
      }));
      return { ...next, isSending: false, pendingClientMessageId: null };
    }

    case 'FALLBACK_STARTED': {
      // 规格 §6：非流式降级期间保持同一消息 UI，仅显示「正在整理回答」。
      return updateMessage(state, action.assistantMessageId, (message) => ({
        ...message,
        status: 'streaming',
        statusStage: 'answering',
        statusText: null,
      }));
    }

    case 'FALLBACK_ANSWER': {
      const next = updateMessage(state, action.assistantMessageId, (message) => ({
        ...message,
        status: 'done',
        statusStage: null,
        statusText: null,
        text: action.answer,
        requestId: action.requestId,
        cards: action.cards,
        citations: action.citations,
        suggestions: action.suggestions.slice(0, 4).map((text, index) => ({
          id: `${action.assistantMessageId}_suggestion_${index}`,
          text,
        })),
      }));
      return { ...next, isSending: false, pendingClientMessageId: null };
    }

    case 'RESET_CONVERSATION':
      return createInitialChatState(action.conversationId);

    default:
      return state;
  }
}

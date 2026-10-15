import { describe, expect, test } from 'vitest';

import {
  chatReducer,
  createInitialChatState,
  type ChatState,
} from './chat-reducer.js';

function sent(state: ChatState) {
  return chatReducer(state, {
    type: 'SEND_MESSAGE',
    text: '帮我找胶原蛋白展商',
    clientMessageId: 'client_1',
    userMessageId: 'user_msg_1',
    assistantMessageId: 'assistant_msg_1',
  });
}

describe('chatReducer: SEND_MESSAGE', () => {
  test('appends a user message and a pending assistant message, and marks sending', () => {
    const state = sent(createInitialChatState('conv_1'));

    expect(state.isSending).toBe(true);
    expect(state.pendingClientMessageId).toBe('client_1');
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]).toMatchObject({ role: 'user', text: '帮我找胶原蛋白展商' });
    expect(state.messages[1]).toMatchObject({ role: 'assistant', status: 'pending' });
  });

  test('ignores a duplicate send while one is already in flight (防重复发送)', () => {
    const first = sent(createInitialChatState('conv_1'));
    const second = chatReducer(first, {
      type: 'SEND_MESSAGE',
      text: '第二条消息',
      clientMessageId: 'client_2',
      userMessageId: 'user_msg_2',
      assistantMessageId: 'assistant_msg_2',
    });

    expect(second).toBe(first);
    expect(second.messages).toHaveLength(2);
  });
});

describe('chatReducer: RESET_CONVERSATION', () => {
  test('clears messages and switches to a new conversation id', () => {
    const state = sent(createInitialChatState('conv_old'));

    const next = chatReducer(state, {
      type: 'RESET_CONVERSATION',
      conversationId: 'conv_new',
    });

    expect(next).toEqual(createInitialChatState('conv_new'));
  });
});

describe('chatReducer: SSE_EVENT lifecycle', () => {
  function withEvent(state: ChatState, event: string, data: Record<string, unknown>) {
    return chatReducer(state, {
      type: 'SSE_EVENT',
      assistantMessageId: 'assistant_msg_1',
      frame: { event, data },
    });
  }

  test('message.start marks the assistant message as streaming', () => {
    const state = withEvent(sent(createInitialChatState('conv_1')), 'message.start', {
      request_id: 'r_1',
      conversation_id: 'conv_1',
      message_id: 'assistant_msg_1',
      protocol_version: '1.0.0',
    });

    expect(state.messages[1]?.status).toBe('streaming');
  });

  test('status.update records the stage so the UI can map its own copy', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'status.update', {
      request_id: 'r_1',
      stage: 'searching',
      display_text: '正在查找展商',
    });

    expect(state.messages[1]?.statusStage).toBe('searching');
    expect(state.messages[1]?.statusText).toBe('正在查找展商');
  });

  test('the first delta collapses the status line (spec §5.2)', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'status.update', {
      request_id: 'r_1',
      stage: 'searching',
      display_text: '正在查找展商',
    });
    state = withEvent(state, 'message.delta', { delta: '华研生物' });

    expect(state.messages[1]?.statusStage).toBeNull();
    expect(state.messages[1]?.statusText).toBeNull();
    expect(state.messages[1]?.text).toBe('华研生物');
  });

  test('suggestion.list keeps at most 4 items (spec §4.4)', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'suggestion.list', {
      items: [
        { id: 's_1', text: '一' },
        { id: 's_2', text: '二' },
        { id: 's_3', text: '三' },
        { id: 's_4', text: '四' },
        { id: 's_5', text: '五' },
      ],
    });

    expect(state.messages[1]?.suggestions).toHaveLength(4);
  });

  test('message.delta appends text incrementally', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'message.delta', { delta: '华研生物' });
    state = withEvent(state, 'message.delta', { delta: '位于5.2馆C18。' });

    expect(state.messages[1]?.text).toBe('华研生物位于5.2馆C18。');
  });

  test('entity.card appends a card', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'entity.card', {
      card: { card_id: 'card_1', type: 'exhibitor' },
    });

    expect(state.messages[1]?.cards).toEqual([{ card_id: 'card_1', type: 'exhibitor' }]);
  });

  test('citation appends a citation', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'citation', {
      citation: { citation_id: 'c_1', source_id: 's_1' },
    });

    expect(state.messages[1]?.citations).toEqual([
      { citation_id: 'c_1', source_id: 's_1' },
    ]);
  });

  test('suggestion.list sets the suggestion items', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'suggestion.list', {
      items: [{ id: 's_1', text: '看看该展商的产品' }],
    });

    expect(state.messages[1]?.suggestions).toEqual([
      { id: 's_1', text: '看看该展商的产品' },
    ]);
  });

  test('message.done finalizes the message and clears isSending', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'message.done', {
      answer_status: 'answered',
      intent: 'exhibitor_search',
    });

    expect(state.messages[1]?.status).toBe('done');
    expect(state.isSending).toBe(false);
    expect(state.pendingClientMessageId).toBeNull();
  });

  test('message.error finalizes the message with an error code and user message', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'message.error', {
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        user_message: '服务暂时不可用，请稍后重试。',
      },
    });

    expect(state.messages[1]).toMatchObject({
      status: 'error',
      errorCode: 'UPSTREAM_UNAVAILABLE',
      errorUserMessage: '服务暂时不可用，请稍后重试。',
    });
    expect(state.isSending).toBe(false);
  });

  test('an unknown event is safely ignored', () => {
    let state = sent(createInitialChatState('conv_1'));
    state = withEvent(state, 'debug.trace', { anything: true });

    expect(state.messages[1]?.status).toBe('pending');
    expect(state.messages[1]?.text).toBe('');
  });
});

describe('chatReducer: STREAM_ERROR / STREAM_CANCELLED / FALLBACK_ANSWER', () => {
  test('STREAM_ERROR sets an error state distinguishable by code', () => {
    const state = chatReducer(sent(createInitialChatState('conv_1')), {
      type: 'STREAM_ERROR',
      assistantMessageId: 'assistant_msg_1',
      code: 'RATE_LIMITED',
      userMessage: '当前咨询较多，请稍后重试',
      retryable: true,
    });

    expect(state.messages[1]).toMatchObject({
      status: 'error',
      errorCode: 'RATE_LIMITED',
    });
    expect(state.isSending).toBe(false);
  });

  test('STREAM_CANCELLED marks the message cancelled and clears isSending', () => {
    const state = chatReducer(sent(createInitialChatState('conv_1')), {
      type: 'STREAM_CANCELLED',
      assistantMessageId: 'assistant_msg_1',
    });

    expect(state.messages[1]?.status).toBe('cancelled');
    expect(state.isSending).toBe(false);
  });

  test('FALLBACK_ANSWER fills in the same assistant message id (no new bubble)', () => {
    const state = chatReducer(sent(createInitialChatState('conv_1')), {
      type: 'FALLBACK_ANSWER',
      assistantMessageId: 'assistant_msg_1',
      answer: '这是非流式降级答案。',
      answerStatus: 'answered',
      cards: [],
      citations: [],
      suggestions: ['看看展位'],
      requestId: 'req_fallback_1',
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({
      status: 'done',
      text: '这是非流式降级答案。',
    });
    expect(state.messages[1]?.suggestions).toEqual([
      { id: 'assistant_msg_1_suggestion_0', text: '看看展位' },
    ]);
  });
});

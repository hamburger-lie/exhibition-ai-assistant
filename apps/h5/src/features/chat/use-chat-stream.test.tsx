// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { useChatStream } from './use-chat-stream.js';

describe('useChatStream: new conversation', () => {
  test('reset switches to a fresh conversation id', () => {
    const { result } = renderHook(() =>
      useChatStream({
        conversationId: 'conv_old',
        expoId: 'expo_1',
        sessionToken: 'token_1',
      }),
    );

    act(() => result.current.reset());

    expect(result.current.state.conversationId).not.toBe('conv_old');
    expect(result.current.state.conversationId).toMatch(/^conv_/);
  });
});

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./ChatProvider.js', async () => {
  const actual = await vi.importActual<typeof import('./ChatProvider.js')>(
    './ChatProvider.js',
  );
  return { ...actual, useChat: vi.fn() };
});

import { ChatPage } from './ChatPage.js';
import { useChat } from './ChatProvider.js';
import { createInitialChatState, type ChatMessage } from './chat-reducer.js';

const config = {
  assistant_name: 'AI 问答助手',
  welcome_text: '可以帮你查找展商、产品、展位和现场活动',
  quick_actions: [
    { id: 'quick_exhibitor', label: '找展商', prompt: '帮我找胶原蛋白展商' },
    { id: 'quick_product', label: '找产品', prompt: '有哪些抗衰产品' },
    { id: 'quick_booth', label: '找展位', prompt: '3B-12 展位在哪里' },
    { id: 'quick_event', label: '查活动', prompt: '今天有哪些活动' },
  ],
  features: { streaming: true, feedback: true, citations: true, map_highlight: true },
  config_version: 'config_2026_spring_1',
};

const session = {
  session_id: 'session_1',
  anonymous_user_id: 'anon_1',
  session_token: 'token_1',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  default_conversation_id: 'conv_1',
};

const sendMessage = vi.fn();
const cancel = vi.fn();
const resetConversation = vi.fn();
const retryBootstrap = vi.fn();
const setDraft = vi.fn();

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: 'assistant_1',
    role: 'assistant',
    text: '华研生物位于5.2馆C18展位。',
    status: 'done',
    statusStage: null,
    statusText: null,
    cards: [],
    citations: [],
    suggestions: [],
    errorCode: null,
    errorUserMessage: null,
    errorRetryable: false,
    sourceQuery: '找展商',
    requestId: 'req_1',
    ...overrides,
  };
}

function mockChat(overrides: Record<string, unknown> = {}) {
  vi.mocked(useChat).mockReturnValue({
    expoId: 'expo_demo_2026_spring',
    phase: 'ready',
    errorMessage: null,
    retryBootstrap,
    config,
    session,
    state: createInitialChatState('conv_1'),
    sendMessage,
    cancel,
    resetConversation,
    draft: '',
    setDraft,
    hasEnteredBefore: () => false,
    markEntered: () => undefined,
    ...overrides,
  } as ReturnType<typeof useChat>);
}

function renderChatPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ChatPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useChat).mockReset();
  sendMessage.mockReset();
  cancel.mockReset();
  resetConversation.mockReset();
  retryBootstrap.mockReset();
  setDraft.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ChatPage bootstrap states', () => {
  test('shows a loading state while the session is being created', () => {
    mockChat({ phase: 'loading', config: null, session: null });
    renderChatPage();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载');
  });

  test('shows an understandable error with a retry path when bootstrap fails', async () => {
    mockChat({
      phase: 'error',
      config: null,
      session: null,
      errorMessage: '网络连接异常，请检查后重试',
    });
    const user = userEvent.setup();
    renderChatPage();

    expect(screen.getByRole('alert')).toHaveTextContent('网络连接异常，请检查后重试');
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(retryBootstrap).toHaveBeenCalledTimes(1);
  });
});

describe('ChatPage empty-conversation first screen (spec §3)', () => {
  test('renders the welcome hero, four quick actions and the composer on one surface', () => {
    mockChat();
    renderChatPage();

    expect(
      screen.getByRole('heading', { name: /你好，我是 AI 问答助手/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(config.welcome_text)).toBeInTheDocument();

    for (const label of ['找展商', '找产品', '找展位', '查活动']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    // 首屏同时具备输入区，不是独立的「首页」页面。
    expect(screen.getByLabelText('输入你的问题')).toBeInTheDocument();
  });

  test('clicking a quick action sends its configured prompt', async () => {
    mockChat();
    const user = userEvent.setup();
    renderChatPage();

    await user.click(screen.getByRole('button', { name: '找展商' }));
    expect(sendMessage).toHaveBeenCalledWith('帮我找胶原蛋白展商');
  });

  test('keeps a disabled 当前为新对话 action on the empty screen', () => {
    mockChat();
    renderChatPage();
    expect(screen.getByRole('button', { name: '当前为新对话' })).toBeDisabled();
  });
});

describe('ChatPage conversation state', () => {
  test('collapses the welcome hero once a message exists', () => {
    mockChat({
      state: {
        ...createInitialChatState('conv_1'),
        messages: [assistantMessage()],
      },
    });
    renderChatPage();

    expect(screen.queryByRole('button', { name: '找展商' })).not.toBeInTheDocument();
    expect(screen.getByText('华研生物位于5.2馆C18展位。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新对话/ })).toBeInTheDocument();
  });

  test('requires confirmation before starting a new conversation', async () => {
    mockChat({
      state: {
        ...createInitialChatState('conv_1'),
        messages: [assistantMessage()],
      },
    });
    const user = userEvent.setup();
    renderChatPage();

    await user.click(screen.getByRole('button', { name: '新对话' }));

    expect(resetConversation).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: '开始新对话？' });
    expect(dialog).toHaveTextContent('当前对话将无法从本页面找回');
    expect(dialog).toHaveClass('confirm-dialog');
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '开始新对话' }));
    expect(resetConversation).toHaveBeenCalledTimes(1);
  });

  test('cancelling the confirmation keeps the current conversation', async () => {
    mockChat({
      state: {
        ...createInitialChatState('conv_1'),
        messages: [assistantMessage()],
      },
    });
    const user = userEvent.setup();
    renderChatPage();

    await user.click(screen.getByRole('button', { name: '新对话' }));
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(resetConversation).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('华研生物位于5.2馆C18展位。')).toBeInTheDocument();
  });

  test('Escape closes the new-conversation confirmation', async () => {
    mockChat({
      state: {
        ...createInitialChatState('conv_1'),
        messages: [assistantMessage()],
      },
    });
    const user = userEvent.setup();
    renderChatPage();

    await user.click(screen.getByRole('button', { name: '新对话' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(resetConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '新对话' })).toHaveFocus();
  });

  test('keeps keyboard focus inside the confirmation dialog', async () => {
    mockChat({
      state: {
        ...createInitialChatState('conv_1'),
        messages: [assistantMessage()],
      },
    });
    const user = userEvent.setup();
    renderChatPage();

    await user.click(screen.getByRole('button', { name: '新对话' }));
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const confirmButton = screen.getByRole('button', { name: '开始新对话' });

    expect(cancelButton).toHaveFocus();
    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(cancelButton).toHaveFocus();
  });

  test('shows the square stop control while generating and cancels on click', async () => {
    mockChat({
      isSending: true,
      state: {
        ...createInitialChatState('conv_1'),
        isSending: true,
        messages: [assistantMessage({ status: 'streaming', text: '正在回答' })],
      },
    });
    const user = userEvent.setup();
    renderChatPage();

    expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '停止生成' }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('offers a retry path on a retryable error (spec §6)', async () => {
    mockChat({
      state: {
        ...createInitialChatState('conv_1'),
        messages: [
          assistantMessage({
            status: 'error',
            text: '',
            errorCode: 'STREAM_INTERRUPTED',
            errorUserMessage: '回答中断，已保留当前内容，可重新获取',
            errorRetryable: true,
          }),
        ],
      },
    });
    const user = userEvent.setup();
    renderChatPage();

    expect(screen.getByRole('alert')).toHaveTextContent('回答中断');
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(sendMessage).toHaveBeenCalledWith('找展商');
  });

  test('keeps generated content and marks 已停止生成 after cancelling', () => {
    mockChat({
      state: {
        ...createInitialChatState('conv_1'),
        messages: [
          assistantMessage({ status: 'cancelled', text: '已经生成的一部分' }),
        ],
      },
    });
    renderChatPage();

    expect(screen.getByText('已经生成的一部分')).toBeInTheDocument();
    expect(screen.getByText('已停止生成')).toBeInTheDocument();
  });
});

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ConfigData } from '../../shared/api/client.js';
import { bootstrap } from '../../shared/session/ensure-session.js';
import type { StoredSession } from '../../shared/session/session-store.js';
import { useChatStream } from './use-chat-stream.js';
import { useEnterAnimationTracker } from './use-enter-animation.js';
import type { ChatState } from './chat-reducer.js';

export const DEFAULT_EXPO_ID = 'expo_demo_2026_spring';

type BootstrapPhase = 'loading' | 'ready' | 'error';

interface ChatContextValue {
  /** 当前届次，详情页等二级页面需要用它调用 E07。 */
  expoId: string;
  phase: BootstrapPhase;
  errorMessage: string | null;
  retryBootstrap: () => void;
  config: ConfigData | null;
  session: StoredSession | null;
  state: ChatState;
  sendMessage: (text: string) => Promise<void>;
  cancel: () => void;
  resetConversation: () => void;
  /** 输入草稿提升到全局，返回 Chat 后可恢复（规格 §7.1）。 */
  draft: string;
  setDraft: (value: string) => void;
  /**
   * 入场动效只放行「本轮新增」的内容。渲染期间只能调用 `hasEnteredBefore`
   * （纯读）；`markEntered` 必须在 commit 之后调用（例如消费方自己的
   * useEffect），不要在渲染函数主体里调用它。见 use-enter-animation.ts。
   */
  hasEnteredBefore: (id: string) => boolean;
  markEntered: (id: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function extractUserMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'userMessage' in error &&
    typeof (error as { userMessage: unknown }).userMessage === 'string'
  ) {
    return (error as { userMessage: string }).userMessage;
  }
  return '网络连接异常，请检查后重试';
}

export interface ChatProviderProps {
  expoId?: string;
  children: ReactNode;
}

/**
 * 会话级全局状态：挂在路由之上，保证从 Chat 进入地图/详情再返回时，消息、
 * 流式结果和输入草稿都不丢失（规格 §7.1）。
 */
export function ChatProvider({
  expoId = DEFAULT_EXPO_ID,
  children,
}: ChatProviderProps) {
  const [phase, setPhase] = useState<BootstrapPhase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');

    bootstrap(expoId)
      .then((result) => {
        if (cancelled) return;
        setSession(result.session);
        setConfig(result.config);
        setPhase('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(extractUserMessage(error));
        setPhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [expoId, attempt]);

  const chat = useChatStream({
    conversationId: session?.default_conversation_id ?? '',
    expoId,
    sessionToken: session?.session_token ?? '',
  });

  const retryBootstrap = useCallback(() => setAttempt((n) => n + 1), []);

  const { hasEnteredBefore, markEntered, resetEnterAnimations } =
    useEnterAnimationTracker();

  // 「新对话」不仅要清空消息，本轮的入场动画记录也要一起清空，否则新对话里
  // 复用到的旧 id（理论上不会，但保险起见）或者仅仅是用户预期「这是全新的
  // 一轮」，都应该能重新播放入场动效。
  const resetConversation = useCallback(() => {
    resetEnterAnimations();
    setDraft('');
    chat.reset();
  }, [chat, resetEnterAnimations]);

  const value = useMemo<ChatContextValue>(
    () => ({
      expoId,
      phase,
      errorMessage,
      retryBootstrap,
      config,
      session,
      state: chat.state,
      sendMessage: chat.sendMessage,
      cancel: chat.cancel,
      resetConversation,
      draft,
      setDraft,
      hasEnteredBefore,
      markEntered,
    }),
    [
      expoId,
      phase,
      errorMessage,
      retryBootstrap,
      config,
      session,
      chat,
      draft,
      resetConversation,
      hasEnteredBefore,
      markEntered,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error('useChat must be used inside <ChatProvider>');
  }
  return value;
}

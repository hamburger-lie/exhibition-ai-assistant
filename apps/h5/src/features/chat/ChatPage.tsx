import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { submitFeedback } from '../../shared/api/client.js';
import { resolveBoothContext } from '../cards/card-types.js';
import { IconArrowDown, IconNewChat } from '../../shared/ui/icons.js';
import { WelcomeScreen } from '../home/WelcomeScreen.js';
import { Composer } from './Composer.js';
import { MessageList } from './MessageList.js';
import { useAutoScroll } from './use-auto-scroll.js';
import { useChat } from './ChatProvider.js';

/**
 * 单一会话面（规格 §3）：空对话状态本身就是首屏，不额外增加「首页 → Chat」
 * 页面层级；发送第一条消息后欢迎区收起，消息列表接管。
 */
export function ChatPage() {
  const navigate = useNavigate();
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newConversationNotice, setNewConversationNotice] = useState(false);
  const newConversationButtonRef = useRef<HTMLButtonElement>(null);
  const cancelNewConversationRef = useRef<HTMLButtonElement>(null);
  const confirmNewConversationRef = useRef<HTMLButtonElement>(null);
  const wasNewConversationOpen = useRef(false);
  const {
    phase,
    errorMessage,
    retryBootstrap,
    config,
    session,
    state,
    sendMessage,
    cancel,
    resetConversation,
    draft,
    setDraft,
    expoId,
  } = useChat();

  const lastMessage = state.messages.at(-1);
  const { scrollRef, showJumpToLatest, scrollToLatest } = useAutoScroll(
    `${state.messages.length}:${lastMessage?.text.length ?? 0}:${lastMessage?.status ?? ''}`,
  );

  useEffect(() => {
    if (!newConversationNotice) return undefined;
    const timeout = window.setTimeout(() => setNewConversationNotice(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [newConversationNotice]);

  useEffect(() => {
    if (wasNewConversationOpen.current && !newConversationOpen) {
      newConversationButtonRef.current?.focus();
    }
    wasNewConversationOpen.current = newConversationOpen;
  }, [newConversationOpen]);

  if (phase === 'loading') {
    return (
      <div className="screen-state" role="status">
        正在加载…
      </div>
    );
  }

  if (phase === 'error' || !config || !session) {
    return (
      <div className="screen-state" role="alert">
        <div>
          <p>{errorMessage ?? '网络连接异常，请检查后重试'}</p>
          <button
            type="button"
            className="screen-state__retry"
            onClick={retryBootstrap}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const hasMessages = state.messages.length > 0;

  const confirmNewConversation = () => {
    resetConversation();
    setNewConversationOpen(false);
    setNewConversationNotice(true);
  };

  return (
    <div className="chat-shell">
      <header className="chat-header">
        {/* 官方 Logo 待提供，先用中性占位块，不猜测品牌图形。 */}
        <span className="chat-header__logo" aria-hidden="true">
          AI
        </span>
        <h1 className="chat-header__title">{config.assistant_name}</h1>
        <button
          ref={newConversationButtonRef}
          type="button"
          className="chat-header__action"
          disabled={!hasMessages}
          aria-haspopup={hasMessages ? 'dialog' : undefined}
          aria-expanded={hasMessages ? newConversationOpen : undefined}
          onClick={() => setNewConversationOpen(true)}
        >
          <IconNewChat />
          {hasMessages ? '新对话' : '当前为新对话'}
        </button>
      </header>

      <div className="chat-body">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-scroll__inner">
            {hasMessages ? (
              <MessageList
                messages={state.messages}
                conversationId={state.conversationId}
                onSuggestionClick={(text) => void sendMessage(text)}
                onRetry={(text) => void sendMessage(text)}
                onFeedbackSubmit={(payload) => {
                  // 规格 §4.4：反馈失败不阻塞继续聊天。
                  void submitFeedback(payload, session.session_token).catch(
                    () => undefined,
                  );
                }}
                cardHandlers={{
                  // 只用卡片自带的结构化 entity_id + 卡片类型进入详情页。
                  onOpenEntity: (entityId, card) => {
                    navigate(
                      `/entity/${card.type}/${encodeURIComponent(entityId)}?expo_id=${encodeURIComponent(expoId)}`,
                    );
                  },
                  onHighlightBooth: (action, card) => {
                    // 展位号与馆号来自卡片结构化 payload，不用内部 booth_id 充数。
                    const booth = resolveBoothContext(action, card);
                    const params = new URLSearchParams({
                      booths: JSON.stringify([
                        {
                          booth_id: booth.booth_id,
                          display_code: booth.display_code,
                          ...(booth.map_shape_id
                            ? { map_shape_id: booth.map_shape_id }
                            : {}),
                        },
                      ]),
                    });
                    if (booth.hall_id) {
                      params.set('hall_id', booth.hall_id);
                    }
                    if (card.title) {
                      params.set('label', card.title);
                    }
                    navigate(`/map?${params.toString()}`);
                  },
                }}
              />
            ) : (
              <WelcomeScreen
                config={config}
                onPickPrompt={(prompt) => void sendMessage(prompt)}
              />
            )}
          </div>
        </div>

        {showJumpToLatest && (
          <button
            type="button"
            className="jump-latest"
            onClick={scrollToLatest}
          >
            <IconArrowDown />
            回到最新
          </button>
        )}
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        isSending={state.isSending}
        onSend={(text) => void sendMessage(text)}
        onCancel={cancel}
      />

      {newConversationNotice && (
        <div className="chat-toast" role="status" aria-live="polite">
          已开始新对话
        </div>
      )}

      {newConversationOpen && (
        <div
          className="confirm-dialog-layer"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setNewConversationOpen(false);
              return;
            }
            if (event.key !== 'Tab') return;
            if (
              event.shiftKey &&
              document.activeElement === cancelNewConversationRef.current
            ) {
              event.preventDefault();
              confirmNewConversationRef.current?.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === confirmNewConversationRef.current
            ) {
              event.preventDefault();
              cancelNewConversationRef.current?.focus();
            }
          }}
        >
          <button
            type="button"
            className="confirm-dialog__scrim"
            aria-label="取消开始新对话"
            onClick={() => setNewConversationOpen(false)}
          />
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="new-conversation-title"
            aria-describedby="new-conversation-description"
          >
            <div className="confirm-dialog__content">
              <h2 id="new-conversation-title" className="confirm-dialog__title">
                开始新对话？
              </h2>
              <p
                id="new-conversation-description"
                className="confirm-dialog__description"
              >
                开始后，当前对话将无法从本页面找回。
              </p>
            </div>
            <div className="confirm-dialog__actions">
              <button
                ref={cancelNewConversationRef}
                type="button"
                className="confirm-dialog__cancel"
                autoFocus
                onClick={() => setNewConversationOpen(false)}
              >
                取消
              </button>
              <button
                ref={confirmNewConversationRef}
                type="button"
                className="confirm-dialog__confirm"
                onClick={confirmNewConversation}
              >
                开始新对话
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

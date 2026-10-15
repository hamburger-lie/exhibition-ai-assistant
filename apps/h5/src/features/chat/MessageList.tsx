import { useEffect, useRef, useState } from 'react';

import { EntityCard } from '../cards/EntityCard.js';
import type { CardActionHandlers, EntityCardData } from '../cards/card-types.js';
import { CitationList } from '../citations/CitationList.js';
import { FeedbackSheet } from '../feedback/FeedbackSheet.js';
import type { FeedbackRequestPayload } from '../../shared/api/client.js';
import { IconAlert } from '../../shared/ui/icons.js';
import { useChat } from './ChatProvider.js';
import type { ChatMessage } from './chat-reducer.js';
import { StatusIndicator } from './StatusIndicator.js';
import { SuggestionList } from './SuggestionList.js';

/** 规格 §6：错误标题 + 恢复路径，不只显示「请求失败」。 */
const ERROR_TITLE: Record<string, string> = {
  SESSION_EXPIRED: '会话已恢复，请重新发送',
  RATE_LIMITED: '当前咨询较多，请稍后重试',
  AI_UPSTREAM_TIMEOUT: '等待时间较长，请重试',
  SEARCH_TIMEOUT: '等待时间较长，请重试',
  RETRIEVE_TIMEOUT: '等待时间较长，请重试',
  UPSTREAM_UNAVAILABLE: '服务暂时不可用，请稍后重试',
  KNOWLEDGE_UNAVAILABLE: '服务暂时不可用，请稍后重试',
  STREAM_INTERRUPTED: '回答中断',
  NETWORK_UNAVAILABLE: '网络连接异常，请检查后重试',
};

/** 单条回答默认展示的卡片数量（规格 §4.2：优先展示 1–3 张）。 */
const CARD_PREVIEW_COUNT = 3;

function CardStack({
  cards,
  handlers,
}: {
  cards: EntityCardData[];
  handlers?: CardActionHandlers | undefined;
}) {
  const { hasEnteredBefore, markEntered } = useChat();
  const [expanded, setExpanded] = useState(false);
  const hidden = cards.length - CARD_PREVIEW_COUNT;
  const visible = expanded ? cards : cards.slice(0, CARD_PREVIEW_COUNT);

  // 渲染期间只读：流式过程中 CardStack 会因为同一条消息的其它字段
  // （citations、suggestions…）反复重渲染；本地缓存记住每个 card_id 第一次
  // 算出的结果，避免同一张卡片在还没让用户看到动画之前，就被下一次重渲染
  // 判定为「已经见过」而丢掉入场效果。真正的「记为已出现」放到下面的 effect
  // 里，在 commit 之后才执行。
  const enterCache = useRef(new Map<string, boolean>());
  for (const card of cards) {
    if (!enterCache.current.has(card.card_id)) {
      enterCache.current.set(
        card.card_id,
        !hasEnteredBefore(`card:${card.card_id}`),
      );
    }
  }

  useEffect(() => {
    for (const card of cards) {
      markEntered(`card:${card.card_id}`);
    }
  });

  return (
    <div className="card-stack">
      {visible.map((card) => (
        <div
          key={card.card_id}
          className={enterCache.current.get(card.card_id) ? 'card-enter' : undefined}
        >
          <EntityCard card={card} handlers={handlers} />
        </div>
      ))}
      {hidden > 0 && !expanded && (
        <button
          type="button"
          className="card-stack__more"
          onClick={() => setExpanded(true)}
        >
          展开其余 {hidden} 个结果
        </button>
      )}
    </div>
  );
}

interface MessageItemProps {
  message: ChatMessage;
  conversationId: string;
  onSuggestionClick?: ((text: string) => void) | undefined;
  onRetry?: ((text: string) => void) | undefined;
  cardHandlers?: CardActionHandlers | undefined;
  onFeedbackSubmit?: ((payload: FeedbackRequestPayload) => void) | undefined;
}

function MessageItem({
  message,
  conversationId,
  onSuggestionClick,
  onRetry,
  cardHandlers,
  onFeedbackSubmit,
}: MessageItemProps) {
  const { hasEnteredBefore, markEntered } = useChat();
  const enterKey = `msg:${message.messageId}`;

  // 渲染期间只读：消息在流式过程中会随着每个 token / 事件反复重渲染；ref 只
  // 在这个消息组件实例第一次渲染时问一次 hasEnteredBefore（纯读，不修改任何
  // 状态），之后的重渲染直接复用同一个结果。从地图/详情页返回时这里会整体
  // 重新挂载，ref 从 null 重新开始，但 ChatProvider 里的记录还在，所以仍然
  // 判定为「已经出现过」。
  const enterRef = useRef<boolean | null>(null);
  if (enterRef.current === null) {
    enterRef.current = !hasEnteredBefore(enterKey);
  }
  const enterClass = enterRef.current ? ' msg--enter' : '';

  // 真正的「记为已出现」放到 commit 之后，不在渲染函数主体里做。
  useEffect(() => {
    markEntered(enterKey);
  }, [enterKey, markEntered]);

  if (message.role === 'user') {
    return (
      <article
        className={`msg msg--user${enterClass}`}
        data-status={message.status}
      >
        <p className="msg__bubble">{message.text}</p>
      </article>
    );
  }

  return (
    <article
      className={`msg msg--assistant${enterClass}`}
      data-status={message.status}
    >
      {/* 规格 §5.3：屏幕阅读器不逐字播报 token，仅播报状态与完成。 */}
      <StatusIndicator stage={message.statusStage} displayText={message.statusText} />

      {message.text && <p className="msg__text">{message.text}</p>}

      {message.status === 'cancelled' && (
        <p className="msg__stopped">已停止生成</p>
      )}

      {message.status === 'error' && message.errorCode && (
        <div className="msg__error" role="alert">
          <IconAlert className="msg__error-icon" />
          <div className="msg__error-body">
            <p className="msg__error-title">
              {ERROR_TITLE[message.errorCode] ?? '出现了一点问题'}
            </p>
            {/* 上游 user_message 与标题一致时不重复显示同一句话。 */}
            {message.errorUserMessage &&
              message.errorUserMessage !== ERROR_TITLE[message.errorCode] && (
                <p>{message.errorUserMessage}</p>
              )}
            {message.errorRetryable && message.sourceQuery && onRetry && (
              <button
                type="button"
                className="msg__error-retry"
                onClick={() => onRetry(message.sourceQuery as string)}
              >
                重试
              </button>
            )}
          </div>
        </div>
      )}

      {message.cards.length > 0 && (
        <div className="msg__section">
          <CardStack cards={message.cards} handlers={cardHandlers} />
        </div>
      )}

      {message.citations.length > 0 && (
        <div className="msg__section">
          <CitationList citations={message.citations} />
        </div>
      )}

      {onSuggestionClick && message.suggestions.length > 0 && (
        <div className="msg__section">
          <SuggestionList
            suggestions={message.suggestions}
            onSelect={onSuggestionClick}
          />
        </div>
      )}

      {/* 规格 §4.4：回答完成后才展示反馈。 */}
      {message.status === 'done' && message.requestId && onFeedbackSubmit && (
        <div className="msg__section">
          <FeedbackSheet
            requestId={message.requestId}
            conversationId={conversationId}
            messageId={message.messageId}
            onSubmit={onFeedbackSubmit}
          />
        </div>
      )}
    </article>
  );
}

export interface MessageListProps {
  messages: ChatMessage[];
  conversationId: string;
  onSuggestionClick?: (text: string) => void;
  onRetry?: (text: string) => void;
  cardHandlers?: CardActionHandlers | undefined;
  onFeedbackSubmit?: (payload: FeedbackRequestPayload) => void;
}

export function MessageList({
  messages,
  conversationId,
  onSuggestionClick,
  onRetry,
  cardHandlers,
  onFeedbackSubmit,
}: MessageListProps) {
  return (
    <div className="message-list">
      {messages.map((message) => (
        <MessageItem
          key={message.messageId}
          message={message}
          conversationId={conversationId}
          onSuggestionClick={onSuggestionClick}
          onRetry={onRetry}
          cardHandlers={cardHandlers}
          onFeedbackSubmit={onFeedbackSubmit}
        />
      ))}
    </div>
  );
}

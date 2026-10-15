import { useState } from 'react';

import type {
  FeedbackReason,
  FeedbackRequestPayload,
} from '../../shared/api/client.js';
import {
  IconClose,
  IconThumbDown,
  IconThumbUp,
} from '../../shared/ui/icons.js';

/** 原因取自 feedback.schema.json 的 FeedbackReason 枚举，不自造取值。 */
const REASON_LABEL: Record<FeedbackReason, string> = {
  irrelevant: '答非所问',
  wrong_information: '信息有误',
  outdated_information: '信息过时',
  not_found: '没有找到',
  not_resolved: '没有解决问题',
  bad_recommendation: '推荐不合适',
  other: '其他',
};

function randomFeedbackId(): string {
  return `feedback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface FeedbackSheetProps {
  requestId: string;
  conversationId: string;
  messageId: string;
  onSubmit: (payload: FeedbackRequestPayload) => void;
}

/**
 * 规格 §4.4：回答完成后展示「有帮助 / 没帮助」；负反馈通过底部选择层收集
 * 接口约定的原因与补充说明。反馈与 request_id/message_id 绑定，提交失败
 * 不阻塞继续聊天（提交是 fire-and-forget，由调用方处理网络错误）。
 */
export function FeedbackSheet({
  requestId,
  conversationId,
  messageId,
  onSubmit,
}: FeedbackSheetProps) {
  const [submitted, setSubmitted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState('');
  // 同一条回答复用同一个幂等键，重复提交不会重复计数。
  const [feedbackId] = useState(randomFeedbackId);

  if (submitted) {
    // role="status" 保证提交成功这件事对屏幕阅读器也是明确的，不只是视觉上的文字替换。
    return (
      <p className="feedback__thanks" role="status">
        感谢反馈
      </p>
    );
  }

  function submitPositive() {
    onSubmit({
      feedback_id: feedbackId,
      request_id: requestId,
      conversation_id: conversationId,
      message_id: messageId,
      rating: 'positive',
    });
    setSubmitted(true);
  }

  function submitNegative() {
    if (!reason) {
      return;
    }
    onSubmit({
      feedback_id: feedbackId,
      request_id: requestId,
      conversation_id: conversationId,
      message_id: messageId,
      rating: 'negative',
      reason,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });
    setSheetOpen(false);
    setSubmitted(true);
  }

  return (
    <>
      <div className="feedback">
        <span className="feedback__label">这条回答</span>
        <button
          type="button"
          className="feedback__btn"
          aria-pressed={false}
          onClick={submitPositive}
        >
          <IconThumbUp />
          有帮助
        </button>
        <button
          type="button"
          className="feedback__btn"
          aria-pressed={sheetOpen}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          <IconThumbDown />
          没帮助
        </button>
      </div>

      {sheetOpen && (
        <div className="sheet">
          <button
            type="button"
            className="sheet__scrim"
            aria-label="关闭反馈"
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="sheet__panel"
            role="dialog"
            aria-modal="true"
            aria-label="反馈原因"
          >
            <div className="sheet__header">
              <h2 className="sheet__title">哪里不合适？</h2>
              <button
                type="button"
                className="sheet__close"
                aria-label="关闭"
                onClick={() => setSheetOpen(false)}
              >
                <IconClose />
              </button>
            </div>

            <div className="sheet__reasons">
              {(Object.keys(REASON_LABEL) as FeedbackReason[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="sheet__reason"
                  aria-pressed={reason === value}
                  onClick={() => setReason(value)}
                >
                  {REASON_LABEL[value]}
                </button>
              ))}
            </div>

            <label className="sr-only" htmlFor={`feedback-comment-${messageId}`}>
              补充说明（可选）
            </label>
            <textarea
              id={`feedback-comment-${messageId}`}
              className="sheet__comment"
              value={comment}
              maxLength={500}
              placeholder="补充说明（可选）"
              onChange={(event) => setComment(event.target.value)}
            />

            <button
              type="button"
              className="sheet__submit"
              disabled={!reason}
              onClick={submitNegative}
            >
              提交
            </button>
          </div>
        </div>
      )}
    </>
  );
}

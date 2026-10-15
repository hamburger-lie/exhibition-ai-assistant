import { useLayoutEffect, useRef, type FormEvent } from 'react';

import { IconSend, IconStop } from '../../shared/ui/icons.js';

const MAX_LENGTH = 1000;
/** 规格 §5.1：超过 800 字显示字数提示。 */
const COUNTER_THRESHOLD = 800;
/** 默认一行、最多扩展到四行后内部滚动（与 CSS max-height 对应）。 */
const MAX_ROWS_PX = 116;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  isSending: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

export function Composer({
  value,
  onChange,
  isSending,
  onSend,
  onCancel,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const canSend = !isSending && trimmed.length > 0 && trimmed.length <= MAX_LENGTH;
  const showCounter = value.length >= COUNTER_THRESHOLD;

  // 输入框高度随内容自增到 4 行上限。
  //
  // textarea 是 border-box，但 scrollHeight 不包含上下边框，直接把
  // scrollHeight 赋给 height 会让元素比内容矮 2px（边框那部分），于是从空
  // 输入开始就会出现原生纵向滚动条。这里把边框高度加回来算出真实自然高度，
  // 只有超过 4 行上限时才允许滚动。
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.overflowY = 'hidden';

    const borderHeight = node.offsetHeight - node.clientHeight;
    const naturalHeight = node.scrollHeight + borderHeight;

    node.style.height = `${Math.min(naturalHeight, MAX_ROWS_PX)}px`;
    node.style.overflowY = naturalHeight > MAX_ROWS_PX ? 'auto' : 'hidden';
  }, [value]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    onChange('');
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__row">
        <label className="sr-only" htmlFor="chat-composer-input">
          输入你的问题
        </label>
        <textarea
          id="chat-composer-input"
          ref={textareaRef}
          className="composer__input"
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          placeholder="想了解哪家展商、产品或活动？"
          /* 规格 §5.1：生成期间允许继续编辑下一条内容，只禁止重复发送。 */
          onChange={(event) => onChange(event.target.value)}
        />

        {isSending ? (
          <button
            type="button"
            className="composer__btn"
            aria-label="停止生成"
            onClick={onCancel}
          >
            <IconStop />
          </button>
        ) : (
          <button
            type="submit"
            className="composer__btn"
            aria-label="发送"
            disabled={!canSend}
          >
            <IconSend />
          </button>
        )}
      </div>

      {showCounter && (
        <p
          className={`composer__counter${
            value.length >= MAX_LENGTH ? ' composer__counter--limit' : ''
          }`}
          aria-live="polite"
        >
          {value.length} / {MAX_LENGTH}
        </p>
      )}
    </form>
  );
}

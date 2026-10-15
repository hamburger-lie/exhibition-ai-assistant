/**
 * 规格 §5.2：把内部 stage 映射为用户可理解的单行状态文案。
 *
 * 以 stage 为准而不是直接透传上游 display_text，避免上游文案变动或夹带内部
 * 措辞时直接暴露给用户；stage 未知时才回退到 display_text。
 */

const STAGE_TEXT: Record<string, string> = {
  understanding: '正在理解你的问题',
  searching: '正在查找相关信息',
  reranking: '正在筛选结果',
  answering: '正在整理回答',
};

/** 非流式降级时统一显示「正在整理回答」（规格 §6）。 */
export const FALLBACK_STATUS_TEXT = STAGE_TEXT.answering as string;

export function resolveStatusText(
  stage: string | null,
  displayText: string | null,
): string | null {
  if (stage && STAGE_TEXT[stage]) {
    return STAGE_TEXT[stage];
  }
  return displayText;
}

export interface StatusIndicatorProps {
  stage: string | null;
  displayText: string | null;
}

export function StatusIndicator({ stage, displayText }: StatusIndicatorProps) {
  const text = resolveStatusText(stage, displayText);
  if (!text) {
    return null;
  }

  return (
    <p className="status-line">
      <span className="status-line__dots" aria-hidden="true">
        <span className="status-line__dot" />
        <span className="status-line__dot" />
        <span className="status-line__dot" />
      </span>
      {text}
    </p>
  );
}

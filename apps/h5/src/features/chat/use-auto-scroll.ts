import { useCallback, useEffect, useRef, useState } from 'react';

/** 距底部多少像素内算「在底部附近」。 */
const BOTTOM_THRESHOLD_PX = 80;

export interface UseAutoScrollResult {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** 用户已离开底部，应显示「回到最新」。 */
  showJumpToLatest: boolean;
  scrollToLatest: () => void;
}

/**
 * 规格 §5.3：用户处于底部附近时自动跟随流式输出；用户主动上滑后停止强制
 * 跟随，并显示「回到最新」。
 *
 * `dependency` 变化即视为有新内容（正文增长、卡片到达等）。
 */
export function useAutoScroll(dependency: unknown): UseAutoScrollResult {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const isNearBottom = useCallback((node: HTMLDivElement) => {
    return (
      node.scrollHeight - node.scrollTop - node.clientHeight <=
      BOTTOM_THRESHOLD_PX
    );
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;

    const onScroll = () => {
      const nearBottom = isNearBottom(node);
      followRef.current = nearBottom;
      setShowJumpToLatest(!nearBottom);
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [isNearBottom]);

  // 有新内容时，只有在用户仍处于底部附近才跟随。
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !followRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [dependency]);

  const scrollToLatest = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    followRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  return { scrollRef, showJumpToLatest, scrollToLatest };
}

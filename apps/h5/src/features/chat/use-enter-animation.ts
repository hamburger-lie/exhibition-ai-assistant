import { useCallback, useRef } from 'react';

/**
 * 追踪「这个 id 对应的内容本轮是不是第一次出现」，用来控制入场动效只播一次：
 * 从地图/详情页返回时历史消息/卡片重新挂载，不应该重播；同一条内容在流式
 * 过程中反复重渲染，也不应该因为「问第二次」就被判定成旧内容。
 *
 * 约束：渲染期间只允许调用 `hasEnteredBefore`（纯读，不修改任何状态）；
 * `markEntered` 只应该在 commit 之后调用（例如 useEffect 里），不要在渲染函数
 * 主体里直接调用它——否则 React StrictMode 的重复渲染会把还没真正提交的
 * 判断提前标记掉，导致本该播放的入场动效在正式提交前就被判「已经见过」。
 */
export interface EnterAnimationTracker {
  hasEnteredBefore: (id: string) => boolean;
  /** 幂等：同一个 id 重复调用（例如 StrictMode 下的双重 effect）没有副作用差异。 */
  markEntered: (id: string) => void;
  /** 开新对话时清空记录，让新一轮内容可以重新播放入场动效。 */
  resetEnterAnimations: () => void;
}

export function useEnterAnimationTracker(): EnterAnimationTracker {
  const seenRef = useRef<Set<string>>(new Set());

  const hasEnteredBefore = useCallback(
    (id: string) => seenRef.current.has(id),
    [],
  );

  const markEntered = useCallback((id: string) => {
    seenRef.current.add(id);
  }, []);

  const resetEnterAnimations = useCallback(() => {
    seenRef.current.clear();
  }, []);

  return { hasEnteredBefore, markEntered, resetEnterAnimations };
}

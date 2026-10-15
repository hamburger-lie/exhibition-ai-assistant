// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useEffect, useRef } from 'react';
import { afterEach, describe, expect, test } from 'vitest';

import {
  useEnterAnimationTracker,
  type EnterAnimationTracker,
} from './use-enter-animation.js';

afterEach(() => {
  cleanup();
});

/**
 * 复刻 MessageItem/CardStack 消费 tracker 的真实模式：渲染期间只用
 * hasEnteredBefore 读一次并缓存进 ref，真正的 markEntered 放到 effect 里、
 * commit 之后才调用。
 */
function Probe({
  tracker,
  id,
  label,
}: {
  tracker: EnterAnimationTracker;
  id: string;
  label: string;
}) {
  const enterRef = useRef<boolean | null>(null);
  if (enterRef.current === null) {
    enterRef.current = !tracker.hasEnteredBefore(id);
  }

  useEffect(() => {
    tracker.markEntered(id);
  });

  return (
    <div data-testid="probe" data-entered={enterRef.current ? 'yes' : 'no'}>
      {label}
    </div>
  );
}

describe('useEnterAnimationTracker (hook contract)', () => {
  function Capture({ onReady }: { onReady: (t: EnterAnimationTracker) => void }) {
    const tracker = useEnterAnimationTracker();
    onReady(tracker);
    return null;
  }

  test('hasEnteredBefore is a pure read: repeated calls without markEntered never change the answer', () => {
    let tracker!: EnterAnimationTracker;
    render(<Capture onReady={(t) => (tracker = t)} />);

    expect(tracker.hasEnteredBefore('a')).toBe(false);
    expect(tracker.hasEnteredBefore('a')).toBe(false);
    expect(tracker.hasEnteredBefore('a')).toBe(false);
  });

  test('markEntered records the id so a later hasEnteredBefore returns true', () => {
    let tracker!: EnterAnimationTracker;
    render(<Capture onReady={(t) => (tracker = t)} />);

    expect(tracker.hasEnteredBefore('a')).toBe(false);
    tracker.markEntered('a');
    expect(tracker.hasEnteredBefore('a')).toBe(true);
  });

  test('resetEnterAnimations forgets everything', () => {
    let tracker!: EnterAnimationTracker;
    render(<Capture onReady={(t) => (tracker = t)} />);

    tracker.markEntered('a');
    expect(tracker.hasEnteredBefore('a')).toBe(true);

    tracker.resetEnterAnimations();
    expect(tracker.hasEnteredBefore('a')).toBe(false);
  });
});

/**
 * Root 模拟 ChatProvider：只挂载一次，tracker 在它整个生命周期内存活。
 * Probe（showProbe 控制是否渲染）模拟 MessageList/MessageItem：会随路由
 * 切换反复卸载、重新挂载。onTracker 让测试拿到当前这个 tracker 实例，用来
 * 模拟「新对话」按钮直接调用 resetEnterAnimations()。
 */
function Root({
  showProbe,
  label = 'x',
  onTracker,
}: {
  showProbe: boolean;
  label?: string;
  onTracker?: (tracker: EnterAnimationTracker) => void;
}) {
  const tracker = useEnterAnimationTracker();
  onTracker?.(tracker);
  return showProbe ? <Probe tracker={tracker} id="msg:1" label={label} /> : null;
}

describe('enter-animation integration (mirrors MessageItem/CardStack usage)', () => {
  test('surviving many re-renders during streaming keeps the entered flag true', () => {
    const { rerender } = render(<Root showProbe label="A" />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'yes');

    // 模拟流式过程中同一条消息反复因为新 token / 新事件重渲染。
    rerender(<Root showProbe label="AB" />);
    rerender(<Root showProbe label="ABC" />);
    rerender(<Root showProbe label="ABCD" />);

    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'yes');
  });

  test('unmounting and remounting with the same tracker does not replay (simulates nav to /map or /entity and back)', () => {
    const { rerender } = render(<Root showProbe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'yes');

    // 导航离开：MessageList 卸载，ChatProvider（这里是 Root）不卸载。
    rerender(<Root showProbe={false} />);
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();

    // 导航返回：MessageList 重新挂载，历史内容不应该重播入场动效。
    rerender(<Root showProbe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'no');
  });

  test('resetEnterAnimations (新对话) lets the same id animate again', () => {
    let tracker!: EnterAnimationTracker;
    const { rerender } = render(
      <Root showProbe onTracker={(t) => (tracker = t)} />,
    );
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'yes');

    rerender(<Root showProbe={false} onTracker={(t) => (tracker = t)} />);
    tracker.resetEnterAnimations();
    rerender(<Root showProbe onTracker={(t) => (tracker = t)} />);

    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'yes');
  });

  test('behaves correctly under React StrictMode (double render / double effect)', () => {
    const { rerender } = render(
      <StrictMode>
        <Root showProbe label="A" />
      </StrictMode>,
    );
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'yes');

    // StrictMode 下同一条消息也会因为流式更新反复重渲染。
    rerender(
      <StrictMode>
        <Root showProbe label="AB" />
      </StrictMode>,
    );
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'yes');

    // 卸载再挂载（模拟导航返回），历史内容不应该重播。
    rerender(
      <StrictMode>
        <Root showProbe={false} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <Root showProbe />
      </StrictMode>,
    );
    expect(screen.getByTestId('probe')).toHaveAttribute('data-entered', 'no');
  });
});

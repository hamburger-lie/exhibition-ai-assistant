// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Composer } from './Composer.js';

afterEach(() => {
  cleanup();
});

function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  const onCancel = vi.fn();
  const onChange = vi.fn();
  render(
    <Composer
      value=""
      onChange={onChange}
      isSending={false}
      onSend={onSend}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSend, onCancel, onChange };
}

describe('Composer (spec §5.1)', () => {
  test('disables the send button when the input is empty', () => {
    setup();
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
  });

  test('enables the send button once there is non-whitespace content', () => {
    setup({ value: '你好' });
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled();
  });

  test('treats whitespace-only input as empty', () => {
    setup({ value: '    ' });
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
  });

  test('sends the trimmed text and clears the draft', async () => {
    const user = userEvent.setup();
    const { onSend, onChange } = setup({ value: '  找展商  ' });

    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSend).toHaveBeenCalledWith('找展商');
    expect(onChange).toHaveBeenCalledWith('');
  });

  test('caps input at 1000 characters', () => {
    setup();
    expect(screen.getByLabelText('输入你的问题')).toHaveAttribute(
      'maxlength',
      '1000',
    );
  });

  test('hides the counter below 800 characters and shows it at/above 800', () => {
    setup({ value: 'a'.repeat(799) });
    expect(screen.queryByText(/\/ 1000/)).not.toBeInTheDocument();
    cleanup();

    setup({ value: 'a'.repeat(800) });
    expect(screen.getByText('800 / 1000')).toBeInTheDocument();
  });

  test('keeps the input editable while generating but swaps send for stop', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup({ isSending: true, value: '下一条问题' });

    // 规格 §5.1：生成期间允许编辑下一条内容。
    expect(screen.getByLabelText('输入你的问题')).toBeEnabled();
    expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '停止生成' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

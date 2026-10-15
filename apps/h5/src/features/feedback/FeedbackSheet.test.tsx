// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { FeedbackSheet } from './FeedbackSheet.js';

afterEach(() => {
  cleanup();
});

function setup() {
  const onSubmit = vi.fn();
  render(
    <FeedbackSheet
      requestId="req_1"
      conversationId="conv_1"
      messageId="msg_1"
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('FeedbackSheet (spec §4.4)', () => {
  test('submits positive feedback bound to request_id/message_id', async () => {
    const { onSubmit, user } = setup();

    await user.click(screen.getByRole('button', { name: /有帮助/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'req_1',
        conversation_id: 'conv_1',
        message_id: 'msg_1',
        rating: 'positive',
      }),
    );
    expect(screen.getByText('感谢反馈')).toBeInTheDocument();
  });

  test('opens a bottom sheet dialog for negative feedback instead of submitting immediately', async () => {
    const { onSubmit, user } = setup();

    await user.click(screen.getByRole('button', { name: /没帮助/ }));

    expect(screen.getByRole('dialog', { name: '反馈原因' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('requires a reason before the negative feedback can be submitted', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /没帮助/ }));

    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '信息过时' }));
    expect(screen.getByRole('button', { name: '提交' })).toBeEnabled();
  });

  test('submits the selected enum reason with an optional comment', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: /没帮助/ }));
    await user.click(screen.getByRole('button', { name: '信息过时' }));
    await user.type(screen.getByPlaceholderText('补充说明（可选）'), '展位已变更');
    await user.click(screen.getByRole('button', { name: '提交' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rating: 'negative',
        reason: 'outdated_information',
        comment: '展位已变更',
      }),
    );
    expect(screen.getByText('感谢反馈')).toBeInTheDocument();
  });

  test('can be dismissed without submitting', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: /没帮助/ }));
    await user.click(screen.getByRole('button', { name: '关闭' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

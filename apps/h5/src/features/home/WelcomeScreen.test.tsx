// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { WelcomeScreen } from './WelcomeScreen.js';

const config = {
  assistant_name: 'AI 问答助手',
  welcome_text: '可以帮你查找展商、产品、展位和现场活动',
  quick_actions: [
    { id: 'quick_exhibitor', label: '找展商', prompt: '帮我找胶原蛋白展商' },
    { id: 'quick_product', label: '找产品', prompt: '有哪些抗衰产品' },
    { id: 'quick_booth', label: '找展位', prompt: '3B-12 展位在哪里' },
    { id: 'quick_event', label: '查活动', prompt: '今天有哪些活动' },
  ],
  features: { streaming: true, feedback: true, citations: true, map_highlight: true },
  config_version: 'config_2026_spring_1',
};

afterEach(() => {
  cleanup();
});

describe('WelcomeScreen (spec §3.1)', () => {
  test('renders the headline and supporting copy from config', () => {
    render(<WelcomeScreen config={config} onPickPrompt={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: '你好，我是 AI 问答助手' }),
    ).toBeInTheDocument();
    expect(screen.getByText(config.welcome_text)).toBeInTheDocument();
  });

  test('renders exactly the four configured quick actions', () => {
    const { container } = render(
      <WelcomeScreen config={config} onPickPrompt={vi.fn()} />,
    );

    const grid = container.querySelector('.welcome__actions');
    expect(grid?.querySelectorAll('.quick-action')).toHaveLength(4);
    for (const label of ['找展商', '找产品', '找展位', '查活动']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  test('renders two question examples as text links', () => {
    const { container } = render(
      <WelcomeScreen config={config} onPickPrompt={vi.fn()} />,
    );

    expect(container.querySelectorAll('.example-link')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: '帮我找胶原蛋白展商' }),
    ).toBeInTheDocument();
  });

  test('sends the configured prompt when a quick action is chosen', async () => {
    const onPickPrompt = vi.fn();
    const user = userEvent.setup();
    render(<WelcomeScreen config={config} onPickPrompt={onPickPrompt} />);

    await user.click(screen.getByRole('button', { name: '查活动' }));
    expect(onPickPrompt).toHaveBeenCalledWith('今天有哪些活动');
  });

  test('uses SVG icons rather than emoji for the quick actions', () => {
    const { container } = render(
      <WelcomeScreen config={config} onPickPrompt={vi.fn()} />,
    );

    expect(container.querySelectorAll('.quick-action svg')).toHaveLength(4);
    // 规格 §8.4：不使用 Emoji 作为结构性图标。
    expect(container.textContent ?? '').not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
    );
  });
});

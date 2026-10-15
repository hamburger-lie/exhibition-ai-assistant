// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../shared/api/client.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../shared/api/client.js')
  >('../../shared/api/client.js');
  return { ...actual, getEntityDetail: vi.fn() };
});
vi.mock('../chat/ChatProvider.js', () => ({ useChat: vi.fn() }));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import { ApiError, getEntityDetail } from '../../shared/api/client.js';
import { useChat } from '../chat/ChatProvider.js';
import { EntityDetailPage } from './EntityDetailPage.js';

const session = {
  session_id: 'session_1',
  anonymous_user_id: 'anon_1',
  session_token: 'token_1',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  default_conversation_id: 'conv_1',
};

const exhibitorDetail = {
  entity_type: 'exhibitor' as const,
  entity: {
    id: 'exhibitor_huayan',
    name: '华研生物科技',
    brands: ['华研'],
    hall: { id: 'hall_demo', name: '5.2馆' },
    booths: [
      { booth_id: 'booth_demo_C18', display_code: 'C18', map_shape_id: 'shape_demo_C18' },
    ],
    categories: ['胶原蛋白原料'],
    description: '胶原蛋白原料与护肤产品展商。',
    status: 'published',
  },
};

beforeEach(() => {
  navigate.mockReset();
  vi.mocked(getEntityDetail).mockReset();
  vi.mocked(useChat).mockReturnValue({
    expoId: 'expo_demo_2026_spring',
    session,
  } as ReturnType<typeof useChat>);
});

afterEach(() => {
  cleanup();
});

function renderDetail(path = '/entity/exhibitor/exhibitor_huayan') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/entity/:entity_type/:entity_id"
          element={<EntityDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EntityDetailPage (spec §7.1)', () => {
  test('requests the entity by its structured type and id', async () => {
    vi.mocked(getEntityDetail).mockResolvedValue(exhibitorDetail);
    renderDetail();

    await screen.findByRole('heading', { name: '华研生物科技' });
    expect(getEntityDetail).toHaveBeenCalledWith(
      'exhibitor',
      'exhibitor_huayan',
      'expo_demo_2026_spring',
      'token_1',
    );
  });

  test('shows only the fields the interface returned', async () => {
    vi.mocked(getEntityDetail).mockResolvedValue(exhibitorDetail);
    renderDetail();

    expect(await screen.findByText('5.2馆')).toBeInTheDocument();
    expect(screen.getByText('胶原蛋白原料')).toBeInTheDocument();
    expect(screen.getByText('胶原蛋白原料与护肤产品展商。')).toBeInTheDocument();
    expect(screen.getByText('展商')).toBeInTheDocument();
  });

  test('hides sections whose fields are absent instead of showing placeholders', async () => {
    vi.mocked(getEntityDetail).mockResolvedValue({
      entity_type: 'exhibitor',
      entity: {
        id: 'exhibitor_minimal',
        name: '最小展商',
        hall: { id: 'hall_demo', name: '5.2馆' },
        booths: [{ booth_id: 'b1', display_code: 'A01' }],
        status: 'published',
      },
    });
    const { container } = renderDetail('/entity/exhibitor/exhibitor_minimal');

    await screen.findByRole('heading', { name: '最小展商' });
    expect(screen.queryByText('简介')).not.toBeInTheDocument();
    expect(screen.queryByText('主营品类')).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/undefined|null|—|--/);
  });

  test('opens the map from a booth using only structured ids', async () => {
    vi.mocked(getEntityDetail).mockResolvedValue(exhibitorDetail);
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: /C18/ }));

    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining('/map?booths='),
    );
    expect(navigate.mock.calls[0]?.[0]).toContain('hall_id=hall_demo');
  });

  test('returns to the conversation without resetting the navigation stack', async () => {
    vi.mocked(getEntityDetail).mockResolvedValue(exhibitorDetail);
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole('heading', { name: '华研生物科技' });
    await user.click(screen.getByRole('button', { name: '返回对话' }));

    // navigate(-1) 而不是跳转到 '/'，Chat 的消息/草稿/滚动位置才不会被重建。
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  test('shows the upstream error copy with a retry path, never a fabricated entity', async () => {
    vi.mocked(getEntityDetail).mockRejectedValue(
      new ApiError(
        503,
        'UPSTREAM_UNAVAILABLE',
        'entity detail source unavailable',
        '服务暂时不可用，请稍后重试。',
        true,
      ),
    );
    renderDetail();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('服务暂时不可用，请稍后重试。');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(alert.textContent ?? '').not.toContain('华研生物');
  });

  test('retries the request when the user asks', async () => {
    vi.mocked(getEntityDetail)
      .mockRejectedValueOnce(
        new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'down', '服务暂时不可用。', true),
      )
      .mockResolvedValueOnce(exhibitorDetail);
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: '重试' }));
    expect(await screen.findByRole('heading', { name: '华研生物科技' })).toBeInTheDocument();
  });

  test('does not offer retry for a non-retryable not-found error', async () => {
    vi.mocked(getEntityDetail).mockRejectedValue(
      new ApiError(
        404,
        'ENTITY_NOT_FOUND',
        'not found',
        '未找到该内容，可能已下架或调整。',
        false,
      ),
    );
    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('未找到该内容');
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
  });

  test('rejects an unsupported entity type without calling the API', async () => {
    renderDetail('/entity/booth/booth_demo_C18');

    expect(await screen.findByRole('alert')).toHaveTextContent('不支持的实体类型');
    expect(getEntityDetail).not.toHaveBeenCalled();
  });
});

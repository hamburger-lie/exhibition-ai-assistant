// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import mapShapes from './map-shapes.json' with { type: 'json' };
import { MapPage, type MapBoothOption } from './MapPage.js';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

// MapCanvas 通过 fetch 内联 SVG；jsdom 下用一个最小可用的假素材。
const DEMO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg">' +
  '<g class="booth-cell" id="shape_demo_C18" data-code="C18"><rect class="booth"/></g>' +
  '<g class="booth-cell" id="shape_demo_C20" data-code="C20"><rect class="booth"/></g>' +
  '</svg>';

beforeEach(() => {
  navigate.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(DEMO_SVG, { status: 200 })),
  );
  if (typeof ResizeObserver === 'undefined') {
    class ResizeObserverPolyfill {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverPolyfill);
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function scenario(id: string): MapBoothOption[] {
  const found = mapShapes.scenarios.find((item) => item.id === id);
  if (!found) {
    throw new Error(`unknown map-shapes scenario: ${id}`);
  }
  return found.booths;
}

function renderMapPage(booths: MapBoothOption[], hallId: string | null = 'hall_demo') {
  return render(
    <MemoryRouter>
      <MapPage booths={booths} hallId={hallId} />
    </MemoryRouter>,
  );
}

describe('MapPage (spec §7.2)', () => {
  test('shows a back control that returns to the conversation', async () => {
    const user = userEvent.setup();
    renderMapPage(scenario('single-booth'));

    await user.click(screen.getByRole('button', { name: '返回对话' }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  test('opens the correct hall map and reports the highlighted booth', () => {
    renderMapPage(scenario('single-booth'));

    expect(
      screen.getByRole('heading', { name: /5\.2馆 · C18/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('map-highlight')).toHaveTextContent(
      '已在图上高亮展位 C18',
    );
  });

  test('shows the exhibitor name on the info card when the map URL carries a label', () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/map?hall_id=hall_b91&label=%E4%B8%BD%E6%9C%AC&booths=' +
            encodeURIComponent(
              JSON.stringify([
                {
                  booth_id: 'booth_b91_H06A',
                  display_code: 'H06A',
                  map_shape_id: 'shape_b91_H06A',
                },
              ]),
            ),
        ]}
      >
        <MapPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('丽本')).toBeInTheDocument();
    expect(screen.getByText('H06A')).toBeInTheDocument();
  });

  test('renders a bottom entity info card with the booth code and hall', () => {
    const { container } = renderMapPage(scenario('single-booth'));

    const info = container.querySelector('.map-info');
    expect(info).toBeTruthy();
    expect(info?.querySelector('.map-info__code')?.textContent).toBe('C18');
    expect(info?.textContent).toContain('5.2馆');
  });

  test('shows a picker when the entity has multiple booths, then highlights the chosen one', async () => {
    const user = userEvent.setup();
    renderMapPage(scenario('multi-booth'));

    expect(screen.getByText('该展商有多个展位，请选择')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'C20' }));

    expect(screen.getByTestId('map-highlight')).toHaveTextContent(
      '已在图上高亮展位 C20',
    );
  });

  // 没有 map_shape_id 时会按命名约定推一个；推出来的展位不在图里，就得照实说无法
  // 高亮，而不是对着不存在的图形声称已高亮。判定要等素材载入，所以这里是异步断言。
  test('falls back to booth number with an explicit no-highlight hint when the derived shape is absent from the map', async () => {
    renderMapPage(scenario('missing-shape'));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '暂无该展位的地图坐标，无法在图上高亮。展位号：D01',
    );
    expect(screen.queryByTestId('map-highlight')).not.toBeInTheDocument();
  });

  // 反过来：同样没有 map_shape_id，但推出来的展位确实在图里，就应该正常高亮——
  // 展商详情页那条路（/entities 不返回 map_shape_id）全靠这个才能用。
  test('highlights a booth whose shape id is derived and present in the map', async () => {
    renderMapPage([{ booth_id: 'booth_demo_C18', display_code: 'C18' }]);

    expect(await screen.findByTestId('map-highlight')).toHaveTextContent(
      '已在图上高亮展位 C18',
    );
  });

  test('falls back to the demo map when no hall_id is known', () => {
    renderMapPage(scenario('single-booth'), null);
    expect(screen.getByRole('heading', { name: /展馆地图/ })).toBeInTheDocument();
  });

  test('opens a hall map for preview when only hall_id is provided', async () => {
    render(
      <MemoryRouter initialEntries={['/map?hall_id=hall_b112']}>
        <MapPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /B区 · 11\.2馆/ }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /11\.2馆平面图/ })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('zoom and reset controls update the viewport without crashing', async () => {
    const user = userEvent.setup();
    renderMapPage(scenario('single-booth'));

    await user.click(screen.getByRole('button', { name: '放大' }));
    await user.click(screen.getByRole('button', { name: '缩小' }));
    await user.click(screen.getByRole('button', { name: '复位' }));

    expect(screen.getByTestId('map-highlight')).toBeInTheDocument();
  });

  test('marks only the shape the interface pointed at', async () => {
    const { container } = renderMapPage(scenario('single-booth'));

    await vi.waitFor(() => {
      expect(container.querySelector('#shape_demo_C18')).toHaveAttribute(
        'data-highlighted',
        'true',
      );
    });
    expect(container.querySelector('#shape_demo_C20')).not.toHaveAttribute(
      'data-highlighted',
    );
  });

  test('keeps the highlight after a re-render (缩放/拖动都不该把它弄丢)', async () => {
    const user = userEvent.setup();
    const { container } = renderMapPage(scenario('single-booth'));

    await vi.waitFor(() => {
      expect(container.querySelector('#shape_demo_C18')).toHaveAttribute(
        'data-highlighted',
        'true',
      );
    });

    // 曾经的缺陷：高亮是渲染后再改 DOM 属性加上去的，React 一旦重写
    // innerHTML 就连节点带属性一起丢掉，而副作用依赖没变不会补回来，
    // 表现为「点一下高亮就没了」。这里用会触发重渲染的操作守住它。
    await user.click(screen.getByRole('button', { name: '放大' }));
    await user.click(screen.getByRole('button', { name: '缩小' }));

    expect(container.querySelector('#shape_demo_C18')).toHaveAttribute(
      'data-highlighted',
      'true',
    );
  });

  test('tapping another booth on the map switches the highlight, even if it is not in the exhibitor booth list', async () => {
    const user = userEvent.setup();
    const { container } = renderMapPage(scenario('single-booth'));

    await vi.waitFor(() => {
      expect(container.querySelector('#shape_demo_C18')).toHaveAttribute(
        'data-highlighted',
        'true',
      );
    });
    expect(
      screen.getByRole('heading', { name: /5\.2馆 · C18/ }),
    ).toBeInTheDocument();

    await user.click(container.querySelector('#shape_demo_C20')!);

    expect(container.querySelector('#shape_demo_C20')).toHaveAttribute(
      'data-highlighted',
      'true',
    );
    expect(container.querySelector('#shape_demo_C18')).not.toHaveAttribute(
      'data-highlighted',
    );
    expect(
      screen.getByRole('heading', { name: /5\.2馆 · C20/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('map-highlight')).toHaveTextContent(
      '已在图上高亮展位 C20',
    );
  });

  test('choosing again from the picker clears a manual map selection', async () => {
    const user = userEvent.setup();
    const { container } = renderMapPage(scenario('multi-booth'));

    expect(screen.getByText('该展商有多个展位，请选择')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'C18' }));
    await vi.waitFor(() => {
      expect(container.querySelector('#shape_demo_C18')).toHaveAttribute(
        'data-highlighted',
        'true',
      );
    });

    await user.click(container.querySelector('#shape_demo_C20')!);
    expect(screen.getByTestId('map-highlight')).toHaveTextContent(
      '已在图上高亮展位 C20',
    );

    await user.click(screen.getByRole('button', { name: '重新选择展位' }));

    expect(screen.getByText('该展商有多个展位，请选择')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MapCanvas } from './MapCanvas.js';
import { useMapViewport } from './use-map-viewport.js';

const DEMO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g class="booth-cell" id="shape_b91_H06A" data-code="H06A"><rect class="booth" x="40" y="40" width="20" height="20"/><text class="booth-code" x="41" y="48" font-size="6">H06A</text></g></svg>';

beforeEach(() => {
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
  if (typeof PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, props: MouseEventInit & { pointerId?: number; pointerType?: string }) {
        super(type, props);
        this.pointerId = props.pointerId ?? 0;
        this.pointerType = props.pointerType ?? 'mouse';
      }
    }
    vi.stubGlobal('PointerEvent', PointerEventPolyfill);
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockCanvasSize(container: HTMLElement, width = 200, height = 200) {
  const canvas = container.querySelector('.map-canvas');
  if (!canvas) return;
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: height });
}

function dispatchPointer(
  target: Element,
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      pointerType: 'touch',
      clientX,
      clientY,
      button: 0,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function Harness({
  highlightShapeId = 'shape_b91_H06A',
  highlightName,
  onSelectShape,
}: {
  highlightShapeId?: string | null;
  highlightName?: string;
  onSelectShape?: (shapeId: string, code: string | null) => void;
}) {
  const { viewport, pan } = useMapViewport();
  return (
    <MapCanvas
      svgUrl="/maps/hall-b91.svg"
      hallName="9.1馆"
      viewport={viewport}
      onPan={pan}
      highlightShapeId={highlightShapeId}
      {...(highlightName ? { highlightName } : {})}
      {...(onSelectShape ? { onSelectShape } : {})}
    />
  );
}

describe('MapCanvas mobile pan', () => {
  test('pointer drag translates the map immediately and disables css transition while dragging', async () => {
    const { container } = render(<Harness />);

    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });

    const canvas = container.querySelector('.map-canvas');
    const viewport = container.querySelector('.map-canvas__viewport');
    expect(canvas).toBeTruthy();
    expect(viewport).toBeTruthy();
    mockCanvasSize(container);

    act(() => {
      dispatchPointer(canvas!, 'pointerdown', 1, 50, 60);
    });
    expect(viewport).toHaveClass('map-canvas__viewport--dragging');

    act(() => {
      dispatchPointer(canvas!, 'pointermove', 1, 90, 100);
    });

    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '-40 -40 200 200',
    );
    const svg = container.querySelector('svg');
    act(() => {
      dispatchPointer(canvas!, 'pointermove', 1, 100, 110);
    });
    expect(container.querySelector('svg')).toBe(svg);
  });

  test('pointer leave does not cancel an in-progress touch drag', async () => {
    const { container } = render(<Harness />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });

    const canvas = container.querySelector('.map-canvas')!;
    mockCanvasSize(container);

    act(() => {
      dispatchPointer(canvas, 'pointerdown', 1, 10, 10);
      dispatchPointer(canvas, 'pointerleave', 1, 10, 10);
      dispatchPointer(canvas, 'pointermove', 1, 40, 15);
    });

    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '-30 -5 200 200',
    );
  });
});

describe('MapCanvas privacy highlight', () => {
  test('draws the exhibitor name only on the highlighted booth', async () => {
    const { container, rerender } = render(
      <Harness highlightName="丽本" highlightShapeId={null} />,
    );
    await waitFor(() => {
      expect(container.querySelector('.booth-code')).toHaveTextContent('H06A');
    });
    expect(container.querySelector('.booth-highlight-name')).toBeNull();

    rerender(<Harness highlightName="丽本" highlightShapeId="shape_b91_H06A" />);
    await waitFor(() => {
      expect(container.querySelector('.booth-highlight-name')).toHaveTextContent(
        '丽本',
      );
    });
  });
});

describe('MapCanvas tap-to-select', () => {
  test('tapping a booth reports its shape id and code', async () => {
    const onSelectShape = vi.fn();
    const { container } = render(<Harness onSelectShape={onSelectShape} />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });
    mockCanvasSize(container);
    const shape = container.querySelector('.booth')!;

    act(() => {
      dispatchPointer(shape, 'pointerdown', 1, 50, 50);
      dispatchPointer(shape, 'pointerup', 1, 50, 50);
    });

    expect(onSelectShape).toHaveBeenCalledWith('shape_b91_H06A', 'H06A');
  });

  test('still resolves the tapped shape when setPointerCapture retargets pointerup to the container (real-browser behaviour jsdom does not emulate)', async () => {
    // 真机上 setPointerCapture 会把之后所有指针事件的 event.target 都改写
    // 成 .map-canvas 自己（Pointer Events 规范的 target retargeting）。jsdom
    // 不实现 setPointerCapture，之前这条用例一直是绿的，但线上点了跟没点
    // 一样——命中检测必须在 pointerdown 那一刻就做完，不能等 pointerup 再
    // 找 event.target。这个用例直接模拟 pointerup 落在容器上的情况。
    const onSelectShape = vi.fn();
    const { container } = render(<Harness onSelectShape={onSelectShape} />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });
    mockCanvasSize(container);
    const canvas = container.querySelector('.map-canvas')!;
    const shape = container.querySelector('.booth')!;

    act(() => {
      dispatchPointer(shape, 'pointerdown', 1, 50, 50);
      dispatchPointer(canvas, 'pointerup', 1, 50, 50);
    });

    expect(onSelectShape).toHaveBeenCalledWith('shape_b91_H06A', 'H06A');
  });

  test('a drag past the tap threshold does not select a booth', async () => {
    const onSelectShape = vi.fn();
    const { container } = render(<Harness onSelectShape={onSelectShape} />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });
    mockCanvasSize(container);
    const canvas = container.querySelector('.map-canvas')!;
    const shape = container.querySelector('.booth')!;

    act(() => {
      dispatchPointer(shape, 'pointerdown', 1, 50, 50);
      dispatchPointer(canvas, 'pointermove', 1, 90, 90);
      dispatchPointer(shape, 'pointerup', 1, 90, 90);
    });

    expect(onSelectShape).not.toHaveBeenCalled();
  });

  test('a two-finger pinch does not select a booth', async () => {
    const onSelectShape = vi.fn();
    const { container } = render(<Harness onSelectShape={onSelectShape} />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });
    mockCanvasSize(container);
    const canvas = container.querySelector('.map-canvas')!;
    const shape = container.querySelector('.booth')!;

    act(() => {
      dispatchPointer(shape, 'pointerdown', 1, 50, 50);
      dispatchPointer(canvas, 'pointerdown', 2, 60, 60);
      dispatchPointer(canvas, 'pointerup', 2, 60, 60);
      dispatchPointer(shape, 'pointerup', 1, 50, 50);
    });

    expect(onSelectShape).not.toHaveBeenCalled();
  });

  test('tapping empty map background does not select a booth', async () => {
    const onSelectShape = vi.fn();
    const { container } = render(<Harness onSelectShape={onSelectShape} />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });
    mockCanvasSize(container);
    const canvas = container.querySelector('.map-canvas')!;

    act(() => {
      dispatchPointer(canvas, 'pointerdown', 1, 5, 5);
      dispatchPointer(canvas, 'pointerup', 1, 5, 5);
    });

    expect(onSelectShape).not.toHaveBeenCalled();
  });
});

describe('MapCanvas zoom', () => {
  test('auto-align zooms the target booth larger than the old 3.2 cap', async () => {
    const onAlign = vi.fn();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function mockRect(this: Element) {
        if (this.classList.contains('map-canvas')) {
          return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            width: 390,
            height: 520,
            right: 390,
            bottom: 520,
            toJSON() {},
          };
        }
        if (this.id === 'shape_b91_H06A') {
          return {
            x: 100,
            y: 80,
            left: 100,
            top: 80,
            width: 24,
            height: 24,
            right: 124,
            bottom: 104,
            toJSON() {},
          };
        }
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          right: 0,
          bottom: 0,
          toJSON() {},
        };
      },
    );

    function AlignHarness() {
      const { viewport, pan } = useMapViewport();
      return (
        <MapCanvas
          svgUrl="/maps/hall-b91.svg"
          hallName="9.1馆"
          viewport={viewport}
          onPan={pan}
          onAlign={onAlign}
          highlightShapeId="shape_b91_H06A"
        />
      );
    }

    render(<AlignHarness />);
    await waitFor(() => {
      expect(onAlign).toHaveBeenCalled();
    });
    const [, , scale] = onAlign.mock.calls[0] as [unknown, unknown, number];
    expect(scale).toBeGreaterThan(3.2);
    expect(scale).toBeLessThanOrEqual(5.2);
  });

  test('auto-align retries once layout settles, even if the container first measures 0×0', async () => {
    // 首次进页时外链样式表可能还没生效，此时 .map-canvas 量出来是 0×0；
    // 只测一次会永久错过对齐，画面停在整馆缩略图。这个用例复现那个时序，
    // 确认 ResizeObserver 补量之后仍然能对齐。
    const onAlign = vi.fn();
    let layoutReady = false;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function mockRect(this: Element) {
        if (!layoutReady) {
          return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, toJSON() {} };
        }
        if (this.classList.contains('map-canvas')) {
          return { x: 0, y: 0, left: 0, top: 0, width: 390, height: 520, right: 390, bottom: 520, toJSON() {} };
        }
        if (this.id === 'shape_b91_H06A') {
          return { x: 100, y: 80, left: 100, top: 80, width: 24, height: 24, right: 124, bottom: 104, toJSON() {} };
        }
        return { x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, toJSON() {} };
      },
    );

    let fireResize: (() => void) | undefined;
    class CapturingResizeObserver {
      constructor(callback: () => void) {
        fireResize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);

    function AlignHarness() {
      const { viewport, pan } = useMapViewport();
      return (
        <MapCanvas
          svgUrl="/maps/hall-b91.svg"
          hallName="9.1馆"
          viewport={viewport}
          onPan={pan}
          onAlign={onAlign}
          highlightShapeId="shape_b91_H06A"
        />
      );
    }

    render(<AlignHarness />);
    await waitFor(() => {
      expect(fireResize).toBeDefined();
    });
    expect(onAlign).not.toHaveBeenCalled();

    layoutReady = true;
    act(() => {
      fireResize?.();
    });
    await waitFor(() => {
      expect(onAlign).toHaveBeenCalled();
    });
  });

  test('plus control can zoom beyond 5x up to 8x', async () => {
    function ZoomHarness() {
      const { viewport, pan, zoomIn } = useMapViewport();
      return (
        <>
          <button type="button" onClick={zoomIn}>
            放大
          </button>
          <MapCanvas
            svgUrl="/maps/hall-b91.svg"
            hallName="9.1馆"
            viewport={viewport}
            onPan={pan}
            highlightShapeId="shape_b91_H06A"
          />
        </>
      );
    }

    const { container } = render(<ZoomHarness />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });
    mockCanvasSize(container);
    const zoom = container.querySelector('button')!;
    for (let i = 0; i < 20; i += 1) {
      act(() => {
        zoom.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '87.5 87.5 25 25',
    );
  });

  test('zooming out after an auto-align keeps the same point centered instead of flinging the view', async () => {
    // viewport.x/y 是按当前 scale 换算好的像素平移量；只改 scale 不跟着等比例
    // 缩放 x/y 的话，同一个像素偏移在新 scale 下换算回 SVG 坐标会变大或变小，
    // 画面就会跟着「飞」——越是先对焦过某个偏离中心的展位（x/y 越大）越明显，
    // 真机上表现为点一下缩小按钮，画面突然甩到别处。
    function AlignThenZoomHarness() {
      const { viewport, pan, align, zoomOut } = useMapViewport();
      return (
        <>
          <button type="button" onClick={() => align(30, -20, 2)}>
            对焦
          </button>
          <button type="button" onClick={zoomOut}>
            缩小
          </button>
          <MapCanvas
            svgUrl="/maps/hall-b91.svg"
            hallName="9.1馆"
            viewport={viewport}
            onPan={pan}
            highlightShapeId="shape_b91_H06A"
          />
        </>
      );
    }

    const { container } = render(<AlignThenZoomHarness />);
    await waitFor(() => {
      expect(container.querySelector('#shape_b91_H06A')).toBeTruthy();
    });
    mockCanvasSize(container);
    const [alignButton, zoomOutButton] = container.querySelectorAll('button');

    act(() => {
      alignButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '35 60 100 100',
    );

    act(() => {
      zoomOutButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // 视野中心 (85, 110) 在缩小前后必须不变；旧算法算出来的是
    // "13.3333 46.6667 133.3333 133.3333"，中心飘到了 (80, 113.3333)。
    expect(container.querySelector('svg')).toHaveAttribute(
      'viewBox',
      '18.3333 43.3333 133.3333 133.3333',
    );
  });
});

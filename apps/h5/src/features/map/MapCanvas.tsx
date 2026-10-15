import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';

import type { Viewport } from './use-map-viewport.js';

export interface MapCanvasProps {
  svgUrl: string;
  hallName: string;
  viewport: Viewport;
  onPan: (dx: number, dy: number) => void;
  onZoomBy?: (factor: number) => void;
  /** 把目标展位移到画面中央并放大到可读。 */
  onAlign?: (dx: number, dy: number, scale: number) => void;
  /** 目标 shape 的 id；为空表示无法高亮（缺少 map_shape_id）。 */
  highlightShapeId: string | null;
  /**
   * 素材加载完后回报该 shape 是否真的存在于图中。
   *
   * 调用方可能是**推导**出的 id（详情页没有 map_shape_id，按命名约定推），推错时不能
   * 让界面继续声称"已高亮"。以实际载入的 SVG 为准，避免另维护一份图形清单跑偏。
   */
  onHighlightResolved?: (found: boolean) => void;
  /** 仅画在当前高亮展位上的店名。 */
  highlightName?: string;
  /** 用户在图上点了某个展位（区别于拖拽/缩放手势）；不含店名，只有 shape id 和展位号。 */
  onSelectShape?: (shapeId: string, code: string | null) => void;
}

/** 拖拽/点击各手势允许的最大位移；超过就不算「点」，避免误触发选中。 */
const TAP_MOVE_THRESHOLD = 6;

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * 规格 §7.2：可缩放地图，目标展位使用品牌色描边并轻微呼吸（减少动效时静态
 * 显示，由 base.css 的 prefers-reduced-motion 统一接管）。
 *
 * 地图以内联 SVG 注入，才能按 map_shape_id 精确定位到具体图形并加描边——
 * 用 <img> 无法触达 SVG 内部节点。素材加载失败时保留馆号/展位号并提供重新
 * 加载入口。
 */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function numberAttr(tag: string, name: string): number | undefined {
  const match = tag.match(new RegExp(`\\b${name}="([^"]+)"`));
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function withHighlightedName(markup: string, shapeId: string, name: string): string {
  const groupPattern = new RegExp(
    `<g([^>]*\\bid="${shapeId}"[^>]*)>([\\s\\S]*?)</g>`,
  );
  if (!groupPattern.test(markup)) {
    return markup.replace(
      `id="${shapeId}"`,
      `id="${shapeId}" data-highlighted="true"`,
    );
  }
  return markup.replace(groupPattern, (_full, attrs: string, inner: string) => {
    const markedAttrs = attrs.includes('data-highlighted')
      ? attrs
      : `${attrs} data-highlighted="true"`;
    const booth = inner.match(/<rect class="booth"[^>]*>/);
    const x = booth ? numberAttr(booth[0], 'x') : undefined;
    const y = booth ? numberAttr(booth[0], 'y') : undefined;
    const width = booth ? numberAttr(booth[0], 'width') : undefined;
    const height = booth ? numberAttr(booth[0], 'height') : undefined;
    if (
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined
    ) {
      return `<g${markedAttrs}>${inner}</g>`;
    }
    const size = Math.min(width * 0.24, height * 0.22, 4.4);
    const label =
      size < 1.1
        ? ''
        : `<text class="booth-highlight-name" x="${x + width / 2}" y="${y + height * 0.72}" text-anchor="middle" font-size="${size.toFixed(2)}">${escapeXml(name)}</text>`;
    return `<g${markedAttrs}>${inner}${label}</g>`;
  });
}

function pinchDistance(points: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...points.values()];
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const MapSvg = memo(function MapSvg({
  markup,
  hallName,
}: {
  markup: string;
  hallName: string;
}) {
  return (
    <div
      className="map-canvas__svg"
      role="img"
      aria-label={`${hallName}平面图`}
      // 素材来自本应用自身 public/maps 下的静态资源，非用户输入。
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});

type ViewBox = { x: number; y: number; w: number; h: number };

function parseViewBox(markup: string): ViewBox | null {
  const match = markup.match(
    /viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/,
  );
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const w = Number(match[3]);
  const h = Number(match[4]);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function formatBox(value: number): string {
  return `${Math.round(value * 10000) / 10000}`;
}

function paintViewBox(
  canvas: HTMLDivElement | null,
  base: ViewBox | null,
  next: Viewport,
) {
  const svg = canvas?.querySelector('svg');
  if (!canvas || !svg || !base) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 2 || height < 2) return;
  const fit = Math.min(width / base.w, height / base.h);
  if (fit <= 0) return;
  const scale = next.scale;
  const visibleW = base.w / scale;
  const visibleH = base.h / scale;
  const x = base.x + (base.w - visibleW) / 2 - next.x / (scale * fit);
  const y = base.y + (base.h - visibleH) / 2 - next.y / (scale * fit);
  svg.setAttribute(
    'viewBox',
    `${formatBox(x)} ${formatBox(y)} ${formatBox(visibleW)} ${formatBox(visibleH)}`,
  );
}

function clampLiveScale(scale: number): number {
  return Math.min(8, Math.max(0.6, scale));
}

export function MapCanvas({
  svgUrl,
  hallName,
  viewport,
  onPan,
  onZoomBy,
  onAlign,
  highlightShapeId,
  highlightName,
  onHighlightResolved,
  onSelectShape,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const live = useRef<Viewport>(viewport);
  const baseViewBox = useRef<ViewBox | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const didAlign = useRef(false);
  const tap = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
    multi: boolean;
    shapeId: string | null;
    code: string | null;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [markup, setMarkup] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');

    fetch(svgUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`map asset ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        baseViewBox.current = parseViewBox(text);
        setMarkup(text);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setMarkup(null);
        setLoadState('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [svgUrl, attempt]);

  /**
   * 只给接口给定的 shape 打高亮标记，不做任何文本猜测。
   *
   * 高亮必须写进 SVG 源串、成为渲染结果的一部分，不能在渲染后再去改 DOM
   * 属性：React 任何一次重写 innerHTML 都会把后加的属性连同节点一起丢掉，
   * 而副作用的依赖（shape id、加载状态、markup）此时都没变，于是不会重新
   * 补上，表现就是「高亮点一下就没了」。
   */
  const highlighted = useMemo(() => {
    if (!markup || !highlightShapeId) return markup;
    // map_shape_id 来自接口，拼进标记前先限定字符集，避免引号截断 SVG 属性。
    if (!/^[A-Za-z0-9_-]+$/.test(highlightShapeId)) return markup;
    if (highlightName) {
      return withHighlightedName(markup, highlightShapeId, highlightName);
    }
    return markup.replace(
      `id="${highlightShapeId}"`,
      `id="${highlightShapeId}" data-highlighted="true"`,
    );
  }, [markup, highlightShapeId, highlightName]);

  useEffect(() => {
    didAlign.current = false;
  }, [svgUrl, highlightShapeId]);

  // 回调放进 ref：调用方常传内联箭头函数，直接进依赖数组会每次渲染都重跑。
  const resolvedRef = useRef(onHighlightResolved);
  resolvedRef.current = onHighlightResolved;

  useEffect(() => {
    if (loadState !== 'ready' || !markup || !highlightShapeId) return;
    resolvedRef.current?.(markup.includes(`id="${highlightShapeId}"`));
  }, [loadState, markup, highlightShapeId]);

  useLayoutEffect(() => {
    if (pointers.current.size > 0) return;
    live.current = viewport;
    paintViewBox(canvasRef.current, baseViewBox.current, viewport);
  }, [viewport, highlighted, loadState]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const blockPageZoom = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        event.preventDefault();
      }
    };
    node.addEventListener('touchmove', blockPageZoom, { passive: false });
    node.addEventListener('touchstart', blockPageZoom, { passive: false });
    return () => {
      node.removeEventListener('touchmove', blockPageZoom);
      node.removeEventListener('touchstart', blockPageZoom);
    };
  }, []);

  useEffect(() => {
    if (loadState !== 'ready' || !highlightShapeId || !onAlign || didAlign.current) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 首次进页时外链样式表可能还没加载完，此时容器量出来是 0×0；只测一次会
    // 永久错过对齐时机（高亮色仍然画上了，但画面停在整馆缩略图，找不到展位）。
    // 用 ResizeObserver 等布局真正稳定后再量一次，而不是量一次就放弃。
    const tryAlign = () => {
      if (didAlign.current) return;
      const shape = canvas.querySelector(`#${CSS.escape(highlightShapeId)}`);
      if (!shape) return;
      const booth = shape.getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      if (booth.width < 2 || box.width < 2) return;
      const dx = box.left + box.width / 2 - (booth.left + booth.width / 2);
      const dy = box.top + box.height / 2 - (booth.top + booth.height / 2);
      // 目标展位大约占画面 1/3；translate 要乘上 scale，因为 CSS 是先 scale 再平移。
      const readable = Math.min(box.width / (booth.width * 3), box.height / (booth.height * 3));
      const scale = Math.min(5.2, Math.max(2.4, readable));
      if (![dx, dy, scale].every(Number.isFinite)) return;
      didAlign.current = true;
      onAlign(dx * scale, dy * scale, scale);
    };

    tryAlign();
    if (didAlign.current) return;

    const observer = new ResizeObserver(tryAlign);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [loadState, highlightShapeId, highlighted, onAlign]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    // setPointerCapture 会把之后所有指针事件的 event.target 都改写成这个
    // div 自己（Pointer Events 规范的 target retargeting），所以点到了哪个
    // 展位必须现在就查一次记下来，等 pointerup 再查会永远查到 .map-canvas。
    const shape =
      event.target instanceof Element ? event.target.closest('.booth-cell') : null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) {
      dragOrigin.current = point;
      setDragging(true);
      tap.current = {
        pointerId: event.pointerId,
        x: point.x,
        y: point.y,
        moved: false,
        multi: false,
        shapeId: shape?.id ?? null,
        code: shape?.getAttribute('data-code') ?? null,
      };
    } else {
      dragOrigin.current = null;
      lastPinchDist.current = pinchDistance(pointers.current);
      if (tap.current) tap.current.multi = true;
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    pointers.current.set(event.pointerId, point);

    if (
      tap.current &&
      tap.current.pointerId === event.pointerId &&
      Math.hypot(point.x - tap.current.x, point.y - tap.current.y) > TAP_MOVE_THRESHOLD
    ) {
      tap.current.moved = true;
    }

    if (pointers.current.size >= 2) {
      const dist = pinchDistance(pointers.current);
      if (lastPinchDist.current && lastPinchDist.current > 0 && onZoomBy) {
        const factor = dist / lastPinchDist.current;
        const scale = clampLiveScale(live.current.scale * factor);
        // scale 变了但 x/y 不跟着等比例换算的话，画面会跟着「飞」（原理见
        // use-map-viewport.ts 里同名的注释）；这里是捏合手势的本地即时反馈，
        // 要跟提交给父组件状态的那份算法保持一致。
        const ratio = scale / live.current.scale;
        const next = {
          scale,
          x: live.current.x * ratio,
          y: live.current.y * ratio,
        };
        live.current = next;
        paintViewBox(canvasRef.current, baseViewBox.current, next);
        onZoomBy(factor);
      }
      lastPinchDist.current = dist;
      return;
    }

    if (!dragOrigin.current) return;
    const dx = point.x - dragOrigin.current.x;
    const dy = point.y - dragOrigin.current.y;
    dragOrigin.current = point;
    const next = { ...live.current, x: live.current.x + dx, y: live.current.y + dy };
    live.current = next;
    paintViewBox(canvasRef.current, baseViewBox.current, next);
    onPan(dx, dy);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);

    const candidate = tap.current;
    if (
      event.type === 'pointerup' &&
      onSelectShape &&
      candidate &&
      candidate.pointerId === event.pointerId &&
      !candidate.moved &&
      !candidate.multi &&
      candidate.shapeId
    ) {
      onSelectShape(candidate.shapeId, candidate.code);
    }
    if (candidate?.pointerId === event.pointerId) tap.current = null;

    if (pointers.current.size === 0) {
      dragOrigin.current = null;
      lastPinchDist.current = null;
      setDragging(false);
      return;
    }
    const remaining = [...pointers.current.values()][0];
    dragOrigin.current = remaining ?? null;
    lastPinchDist.current = null;
  }

  return (
    <div
      ref={canvasRef}
      className={dragging ? 'map-canvas map-canvas--dragging' : 'map-canvas'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {loadState === 'failed' ? (
        <div className="map-canvas__fallback" role="status">
          <div>
            <p>地图素材加载失败</p>
            <button
              type="button"
              className="screen-state__retry"
              onClick={() => setAttempt((n) => n + 1)}
            >
              重新加载
            </button>
          </div>
        </div>
      ) : (
        <div
          className={
            dragging
              ? 'map-canvas__viewport map-canvas__viewport--dragging'
              : 'map-canvas__viewport'
          }
        >
          {highlighted ? <MapSvg markup={highlighted} hallName={hallName} /> : null}
        </div>
      )}
    </div>
  );
}

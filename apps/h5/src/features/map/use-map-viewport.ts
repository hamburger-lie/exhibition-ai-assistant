import { useCallback, useState } from 'react';

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 8;
const SCALE_STEP = 0.5;
const DEFAULT_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 };

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export interface UseMapViewportResult {
  viewport: Viewport;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomBy: (factor: number) => void;
  pan: (dx: number, dy: number) => void;
  align: (dx: number, dy: number, scale: number) => void;
  reset: () => void;
}

export function useMapViewport(): UseMapViewportResult {
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);

  // x/y 是「按当前 scale 换算好的」像素平移量（paintViewBox 里会除以
  // scale*fit 转回 SVG 单位）。只改 scale、不跟着等比例缩放 x/y 的话，同一个
  // x/y 在新 scale 下换算出来的 SVG 位移会变大或变小，画面就会跟着「飞」出去
  // ——离中心越远（比如自动对焦过某个展位之后）越明显。捏合缩放会在一次手势
  // 里连续调用 zoomBy，必须基于 setState 的 current 算，不能读闭包里的
  // viewport（那是上一次渲染的值，连续调用会拿到过期的 scale）。
  function zoomTo(current: Viewport, nextScale: number): Viewport {
    const scale = clampScale(nextScale);
    const ratio = scale / current.scale;
    return { scale, x: current.x * ratio, y: current.y * ratio };
  }

  const zoomIn = useCallback(() => {
    setViewport((current) => zoomTo(current, current.scale + SCALE_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((current) => zoomTo(current, current.scale - SCALE_STEP));
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setViewport((current) => zoomTo(current, current.scale * factor));
  }, []);

  const pan = useCallback((dx: number, dy: number) => {
    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }, []);

  const align = useCallback((dx: number, dy: number, scale: number) => {
    setViewport({ x: dx, y: dy, scale: clampScale(scale) });
  }, []);

  const reset = useCallback(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, []);

  return { viewport, zoomIn, zoomOut, zoomBy, pan, align, reset };
}

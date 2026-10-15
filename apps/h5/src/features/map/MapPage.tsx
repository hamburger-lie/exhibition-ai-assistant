import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  IconAlert,
  IconBack,
  IconMinus,
  IconPlus,
  IconReset,
} from '../../shared/ui/icons.js';
import { MapCanvas } from './MapCanvas.js';
import { deriveMapShapeId, resolveHallMap } from './map-registry.js';
import { useMapViewport } from './use-map-viewport.js';

export interface MapBoothOption {
  booth_id: string;
  display_code: string;
  map_shape_id?: string;
}

function parseBooths(raw: string | null): MapBoothOption[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MapBoothOption[]) : [];
  } catch {
    return [];
  }
}

export interface MapPageProps {
  /** 便于测试注入；默认从 ?booths= / ?hall_id= 读取。 */
  booths?: MapBoothOption[];
  hallId?: string | null;
}

/**
 * 展位地图（规格 §7.2）：全屏二级页面 = 返回按钮 + 展馆/展位号 + 可缩放地图
 * + 底部实体信息卡。只消费 highlight_booth 动作携带的 booth_id/map_shape_id。
 */
export function MapPage({ booths: boothsProp, hallId: hallIdProp }: MapPageProps = {}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hallId = hallIdProp ?? searchParams.get('hall_id');
  const booths = useMemo(
    () => boothsProp ?? parseBooths(searchParams.get('booths')),
    [boothsProp, searchParams],
  );

  const [selectedBoothId, setSelectedBoothId] = useState<string | null>(
    booths.length === 1 ? (booths[0]?.booth_id ?? null) : null,
  );
  // 用户在地图上直接点了另一个展位；跟接口传进来的 selectedBooth 是两回事——
  // 手动点选的展位没有展商名，也不在 booths 列表里，不能塞进 selectedBoothId。
  const [tapSelection, setTapSelection] = useState<{
    display_code: string;
    map_shape_id: string;
  } | null>(null);
  // null = 素材还没载入，尚不知道图里有没有这个展位。
  const [shapeFound, setShapeFound] = useState<boolean | null>(null);
  const exhibitorName = searchParams.get('label');
  const { viewport, zoomIn, zoomOut, zoomBy, pan, align, reset } = useMapViewport();

  const hallMap = resolveHallMap(hallId);
  const selectedBooth =
    booths.find((booth) => booth.booth_id === selectedBoothId) ?? null;
  // 手动点选优先于路由带进来的展位：用户在地图上点了别的格子，就应该看那一格。
  const activeBooth = tapSelection
    ? {
        booth_id: tapSelection.map_shape_id,
        display_code: tapSelection.display_code,
        map_shape_id: tapSelection.map_shape_id,
      }
    : selectedBooth;

  function resetSelection() {
    setSelectedBoothId(null);
    setTapSelection(null);
  }

  // 换了展位或换了馆就得重新判定，否则会沿用上一个展位的结论。
  useEffect(() => {
    setShapeFound(null);
  }, [hallMap.svgUrl, activeBooth?.display_code, activeBooth?.map_shape_id]);

  const header = (
    <header className="map-page__header">
      <button
        type="button"
        className="map-page__back"
        aria-label="返回对话"
        onClick={() => navigate(-1)}
      >
        <IconBack />
      </button>
      <h1 className="map-page__heading">
        {/* 官方导览图分 A / B 两区，馆号在两区之间不重复但仍标出区别，避免现场找错区。 */}
        {hallMap.region ? `${hallMap.region}区 · ` : ''}
        {hallMap.name}
        {activeBooth ? ` · ${activeBooth.display_code}` : ''}
      </h1>
    </header>
  );

  if (booths.length === 0 && !hallMap.addressable) {
    return (
      <div className="map-page">
        {header}
        <div className="screen-state" role="status">
          未提供展位信息。
        </div>
      </div>
    );
  }

  // 多展位时先让用户选择，不替用户擅自决定（规格 §7.2）。
  if (booths.length > 1 && !selectedBoothId) {
    return (
      <div className="map-page">
        {header}
        <div className="map-picker">
          <h2 className="map-picker__title">该展商有多个展位，请选择</h2>
          <ul className="map-picker__options">
            {booths.map((booth) => (
              <li key={booth.booth_id}>
                <button
                  type="button"
                  className="map-picker__option"
                  onClick={() => setSelectedBoothId(booth.booth_id)}
                >
                  {booth.display_code}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // 接口给了 map_shape_id 就用接口的；展商详情页那条路没有这个字段，按命名约定推。
  const highlightShapeId = activeBooth
    ? (activeBooth.map_shape_id ??
      deriveMapShapeId(hallMap, activeBooth.display_code))
    : null;
  // 推导可能落空（该展位在图上没有对应图形）。素材载入前先当作能高亮，避免闪一下
  // 降级提示；载入后以图为准，图里没有就照实说无法高亮，不能对着空气说已高亮。
  const canHighlight = Boolean(highlightShapeId) && shapeFound !== false;
  // 手动点选的展位没有展商名可显示，只在「接口带进来的原始展位」上叠店名。
  const highlightName = !tapSelection && exhibitorName ? exhibitorName : undefined;

  return (
    <div className="map-page">
      {header}

      <div className="chat-body">
        <MapCanvas
          svgUrl={hallMap.svgUrl}
          hallName={hallMap.name}
          viewport={viewport}
          onPan={pan}
          onZoomBy={zoomBy}
          onAlign={align}
          highlightShapeId={highlightShapeId}
          onHighlightResolved={setShapeFound}
          onSelectShape={(shapeId, code) => {
            // 自动对焦的位移量是按「当前屏幕位置」量出来的；如果不先把视口归零，
            // 第二次点选会在已经缩放/平移过的画面上再叠一次变换，展位算到屏幕外面去。
            reset();
            setTapSelection({ display_code: code ?? shapeId, map_shape_id: shapeId });
          }}
          {...(highlightName ? { highlightName } : {})}
        />
        <div className="map-page__controls">
          <button
            type="button"
            className="map-page__control"
            aria-label="放大"
            onClick={zoomIn}
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className="map-page__control"
            aria-label="缩小"
            onClick={zoomOut}
          >
            <IconMinus />
          </button>
          <button
            type="button"
            className="map-page__control"
            aria-label="复位"
            onClick={reset}
          >
            <IconReset />
          </button>
        </div>
      </div>

      <section className="map-info">
        {highlightName ? <p className="map-info__name">{highlightName}</p> : null}
        {activeBooth ? (
          <p className="map-info__code">{activeBooth.display_code}</p>
        ) : null}
        <p className="map-info__meta">{hallMap.name}</p>

        {canHighlight ? (
          <p className="map-info__meta" data-testid="map-highlight">
            已在图上高亮展位 {activeBooth?.display_code}
          </p>
        ) : activeBooth ? (
          /* 规格 §7.2：缺少 map_shape_id 时展示文字位置与无法高亮的明确提示。 */
          <p className="map-info__degraded" role="status">
            <IconAlert className="map-info__degraded-icon" />
            <span>
              暂无该展位的地图坐标，无法在图上高亮。展位号：
              {activeBooth.display_code}
            </span>
          </p>
        ) : (
          <p className="map-info__meta">整馆预览，点地图上的展位查看展位号</p>
        )}

        {booths.length > 1 && (
          <button type="button" className="map-picker__option" onClick={resetSelection}>
            重新选择展位
          </button>
        )}
      </section>
    </div>
  );
}

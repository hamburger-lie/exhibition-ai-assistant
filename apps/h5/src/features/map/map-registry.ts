/**
 * 展馆平面图注册表。
 *
 * 素材来自主办方官方参观指南图（A 区 9 个馆 / B 区 10 个馆），由
 * `scripts/extract-hall-maps.py` 从官方 PDF 的矢量图形提取：保留展位轮廓、展位号、
 * 馆号与展区名称、通道/出入口标注；不渲染展商名（手机宽度下看不清且会盖住图形）。
 *
 * 展位编号有两个来源，SVG 里用 `data-source="ocr"` 区分：
 * - **B 区**：源 PDF 的编号是活文字，直接提取，100% 准确。
 * - **A 区**：源 PDF 的编号被转成了矢量轮廓，改用逐展位裁剪 OCR 补出
 *   （`scripts/ocr-hall-codes.py`），实测约 1.5% 可能识别错。
 *
 * 两者都产出 `shape_<slug>_<展位号>` 形式的 id，供 map_shape_id 精确高亮。
 * 详见 docs/acceptance/hall-maps.md。
 */

export type HallRegion = 'A' | 'B';

export interface HallMapDefinition {
  hallId: string;
  name: string;
  /** 官方分区；占位演示图没有分区。 */
  region: HallRegion | null;
  svgUrl: string;
  /** 该馆是否含可高亮的展位图形。 */
  addressable: boolean;
}

const HALL_MAPS: Record<string, HallMapDefinition> = {
  hall_a11: {
    hallId: 'hall_a11',
    name: '1.1馆',
    region: 'A',
    svgUrl: '/maps/hall-a11.svg',
    addressable: true,
  },
  hall_a21: {
    hallId: 'hall_a21',
    name: '2.1馆',
    region: 'A',
    svgUrl: '/maps/hall-a21.svg',
    addressable: true,
  },
  hall_a22: {
    hallId: 'hall_a22',
    name: '2.2馆',
    region: 'A',
    svgUrl: '/maps/hall-a22.svg',
    addressable: true,
  },
  hall_a31: {
    hallId: 'hall_a31',
    name: '3.1馆',
    region: 'A',
    svgUrl: '/maps/hall-a31.svg',
    addressable: true,
  },
  hall_a32: {
    hallId: 'hall_a32',
    name: '3.2馆',
    region: 'A',
    svgUrl: '/maps/hall-a32.svg',
    addressable: true,
  },
  hall_a41: {
    hallId: 'hall_a41',
    name: '4.1馆',
    region: 'A',
    svgUrl: '/maps/hall-a41.svg',
    addressable: true,
  },
  hall_a42: {
    hallId: 'hall_a42',
    name: '4.2馆',
    region: 'A',
    svgUrl: '/maps/hall-a42.svg',
    addressable: true,
  },
  hall_a51: {
    hallId: 'hall_a51',
    name: '5.1馆',
    region: 'A',
    svgUrl: '/maps/hall-a51.svg',
    addressable: true,
  },
  hall_a52: {
    hallId: 'hall_a52',
    name: '5.2馆',
    region: 'A',
    svgUrl: '/maps/hall-a52.svg',
    addressable: true,
  },
  hall_b91: {
    hallId: 'hall_b91',
    name: '9.1馆',
    region: 'B',
    svgUrl: '/maps/hall-b91.svg',
    addressable: true,
  },
  hall_b92: {
    hallId: 'hall_b92',
    name: '9.2馆',
    region: 'B',
    svgUrl: '/maps/hall-b92.svg',
    addressable: true,
  },
  hall_b101: {
    hallId: 'hall_b101',
    name: '10.1馆',
    region: 'B',
    svgUrl: '/maps/hall-b101.svg',
    addressable: true,
  },
  hall_b102: {
    hallId: 'hall_b102',
    name: '10.2馆',
    region: 'B',
    svgUrl: '/maps/hall-b102.svg',
    addressable: true,
  },
  hall_b103: {
    hallId: 'hall_b103',
    name: '10.3馆',
    region: 'B',
    svgUrl: '/maps/hall-b103.svg',
    addressable: true,
  },
  hall_b111: {
    hallId: 'hall_b111',
    name: '11.1馆',
    region: 'B',
    svgUrl: '/maps/hall-b111.svg',
    addressable: true,
  },
  hall_b112: {
    hallId: 'hall_b112',
    name: '11.2馆',
    region: 'B',
    svgUrl: '/maps/hall-b112.svg',
    addressable: true,
  },
  hall_b113: {
    hallId: 'hall_b113',
    name: '11.3馆',
    region: 'B',
    svgUrl: '/maps/hall-b113.svg',
    addressable: true,
  },
  hall_b122: {
    hallId: 'hall_b122',
    name: '12.2馆',
    region: 'B',
    svgUrl: '/maps/hall-b122.svg',
    addressable: true,
  },
  hall_b132: {
    hallId: 'hall_b132',
    name: '13.2馆',
    region: 'B',
    svgUrl: '/maps/hall-b132.svg',
    addressable: true,
  },
  // 契约锚点 fixture（chat-stream-exhibitor.sse 等）使用的演示馆，保留占位图。
  // 命名空间用 demo 而非馆号：真实数据里的 hall_52 是 A 区 5.2 馆，两者不能共用一个 id。
  hall_demo: {
    hallId: 'hall_demo',
    name: '5.2馆',
    region: null,
    svgUrl: '/maps/demo-hall.svg',
    addressable: true,
  },
};

/**
 * 知识库服务返回的来源馆号 → 本注册表的地图馆号。
 *
 * 来源数据不带区位字母（`hall_91`），而官方导览图分 A / B 两区、注册表按区命名
 * （`hall_b91`）；两边直接对不上，不转换就会静默回落到占位图。映射规则见
 * `docs/superpowers/specs/2026-08-31-map-hall-id-normalization-design.md`。
 *
 * 这里是**兼容层**：服务端按该设计规范化之后会直接下发 `hall_b91`，那条路径不经过本表。
 * 本表只为尚未规范化的来源（展商详情页的 `entity.hall.id`）兜底，两种形态都能解析。
 */
const SOURCE_HALL_IDS: Record<string, string> = {
  hall_11: 'hall_a11',
  hall_21: 'hall_a21',
  hall_22: 'hall_a22',
  hall_31: 'hall_a31',
  hall_32: 'hall_a32',
  hall_41: 'hall_a41',
  hall_42: 'hall_a42',
  hall_51: 'hall_a51',
  hall_52: 'hall_a52',
  hall_91: 'hall_b91',
  hall_92: 'hall_b92',
  hall_101: 'hall_b101',
  hall_102: 'hall_b102',
  hall_103: 'hall_b103',
  hall_111: 'hall_b111',
  hall_112: 'hall_b112',
  hall_113: 'hall_b113',
  hall_122: 'hall_b122',
  hall_132: 'hall_b132',
};

/** 缺失或未知 hall_id 不阻塞地图页：回落到演示图，由调用方处理降级提示。 */
export function resolveHallMap(hallId: string | null): HallMapDefinition {
  if (hallId && HALL_MAPS[hallId]) {
    return HALL_MAPS[hallId];
  }
  const mapped = hallId ? SOURCE_HALL_IDS[hallId] : undefined;
  if (mapped && HALL_MAPS[mapped]) {
    return HALL_MAPS[mapped];
  }
  return {
    hallId: hallId ?? 'unknown',
    name: '展馆地图',
    region: null,
    svgUrl: '/maps/demo-hall.svg',
    addressable: false,
  };
}

export const ALL_HALL_MAPS: HallMapDefinition[] = Object.values(HALL_MAPS);

/**
 * 按 `shape_<slug>_<展位号>` 约定推出图形 id，供**没有下发 map_shape_id 的来源**兜底。
 *
 * 展商详情页的 `/entities/...` 只返回 booth_id 与 display_code，没有 map_shape_id
 * （服务器 booth 表就没有这一列），不推导就完全无法高亮。卡片的 highlight_booth 动作
 * 会显式带 map_shape_id，那条路径不该走这里——调用方应优先用接口给的值。
 *
 * 推不准是安全的：MapCanvas 按 id 查不到图形时什么都不高亮，与推导前的表现一致。
 */
export function deriveMapShapeId(
  hallMap: HallMapDefinition,
  displayCode: string,
): string | null {
  if (!hallMap.addressable || !displayCode) {
    return null;
  }
  return `shape_${hallMap.hallId.replace(/^hall_/, '')}_${displayCode}`;
}

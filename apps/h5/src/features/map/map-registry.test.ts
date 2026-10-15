import { describe, expect, test } from 'vitest';

import {
  ALL_HALL_MAPS,
  deriveMapShapeId,
  resolveHallMap,
} from './map-registry.js';

describe('map-registry 馆号解析', () => {
  test('已规范化的地图馆号直接命中', () => {
    expect(resolveHallMap('hall_b91').svgUrl).toBe('/maps/hall-b91.svg');
    expect(resolveHallMap('hall_a11').svgUrl).toBe('/maps/hall-a11.svg');
  });

  // 知识库服务的来源数据不带区位字母；不转换就会静默回落到占位图，
  // 现场表现是「点了展位却进了示例地图」。
  test('来源馆号转成对应的地图馆号', () => {
    expect(resolveHallMap('hall_91').hallId).toBe('hall_b91');
    expect(resolveHallMap('hall_11').hallId).toBe('hall_a11');
    expect(resolveHallMap('hall_132').hallId).toBe('hall_b132');
  });

  // hall_52 曾被演示 fixture 占用，真实 5.2 馆反而落到占位图；fixture 已改名为
  // hall_demo，这里锁住它别再被占回去。
  test('hall_52 解析到真实的 A 区 5.2 馆，不是占位图', () => {
    const hall = resolveHallMap('hall_52');
    expect(hall.hallId).toBe('hall_a52');
    expect(hall.svgUrl).toBe('/maps/hall-a52.svg');
    expect(hall.region).toBe('A');
  });

  test('演示 fixture 仍解析到占位图', () => {
    expect(resolveHallMap('hall_demo').svgUrl).toBe('/maps/demo-hall.svg');
  });

  test('19 个馆的来源馆号全都有对应地图', () => {
    const sourceIds = [
      'hall_11', 'hall_21', 'hall_22', 'hall_31', 'hall_32',
      'hall_41', 'hall_42', 'hall_51', 'hall_52',
      'hall_91', 'hall_92', 'hall_101', 'hall_102', 'hall_103',
      'hall_111', 'hall_112', 'hall_113', 'hall_122', 'hall_132',
    ];
    for (const id of sourceIds) {
      const hall = resolveHallMap(id);
      expect(hall.svgUrl, `${id} 落到了占位图`).not.toBe('/maps/demo-hall.svg');
      expect(hall.addressable, `${id} 不可定位`).toBe(true);
    }
  });

  test('未知馆号与空值仍回落到占位图且标记为不可定位', () => {
    expect(resolveHallMap('hall_999').addressable).toBe(false);
    expect(resolveHallMap(null).svgUrl).toBe('/maps/demo-hall.svg');
  });

  test('注册表本身没有重复的 svg 素材', () => {
    const real = ALL_HALL_MAPS.filter((h) => h.svgUrl !== '/maps/demo-hall.svg');
    expect(new Set(real.map((h) => h.svgUrl)).size).toBe(real.length);
  });
});

describe('deriveMapShapeId', () => {
  // 服务器的 booth 表没有 map_shape_id 列，详情页只能按命名约定推。
  test('按 shape_<slug>_<展位号> 推导', () => {
    expect(deriveMapShapeId(resolveHallMap('hall_91'), 'H12B')).toBe(
      'shape_b91_H12B',
    );
    expect(deriveMapShapeId(resolveHallMap('hall_11'), 'G01B')).toBe(
      'shape_a11_G01B',
    );
  });

  test('不可定位的馆或空展位号不推导', () => {
    expect(deriveMapShapeId(resolveHallMap('hall_999'), 'H12B')).toBeNull();
    expect(deriveMapShapeId(resolveHallMap('hall_91'), '')).toBeNull();
  });
});

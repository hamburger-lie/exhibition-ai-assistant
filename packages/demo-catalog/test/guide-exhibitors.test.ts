import { describe, expect, test } from 'vitest';

import { buildGuideExhibitors } from '../src/guide-exhibitors.js';
import { VENUE_HALLS } from '../src/venue.js';

function boothKeys(exhibitors: ReturnType<typeof buildGuideExhibitors>): Set<string> {
  const keys = new Set<string>();
  for (const item of exhibitors) {
    const hall = item.entity.hall as { id: string };
    const booths = item.entity.booths as Array<{ display_code: string }>;
    for (const booth of booths) {
      keys.add(`${hall.id}:${booth.display_code}`);
    }
  }
  return keys;
}

describe('buildGuideExhibitors', () => {
  test('puts every locatable venue booth number into the catalog exactly once', () => {
    const exhibitors = buildGuideExhibitors();
    const keys = boothKeys(exhibitors);
    const expected: string[] = [];
    for (const hall of VENUE_HALLS) {
      for (const code of hall.boothCodes) {
        expected.push(`${hall.hallId}:${code}`);
      }
    }

    expect(keys.size).toBe(expected.length);
    expect([...keys].sort()).toEqual([...expected].sort());
  });

  test('attaches the guide-map short name and keeps a locatable shape id', () => {
    const match = buildGuideExhibitors().find(
      (item) => item.entity.name === '丽本',
    );
    expect(match).toBeDefined();
    const entity = match!.entity as {
      id: string;
      hall: { id: string; name: string };
      booths: Array<{ booth_id: string; display_code: string; map_shape_id?: string }>;
    };
    expect(entity.hall).toEqual({ id: 'hall_b91', name: '9.1馆' });
    expect(entity.booths).toEqual(
      expect.arrayContaining([
        {
          booth_id: 'booth_b91_H06A',
          display_code: 'H06A',
          map_shape_id: 'shape_b91_H06A',
        },
      ]),
    );
    expect(entity.id).toBe('exhibitor_guide_b91_H06A');
  });

  test('groups the same short name in one hall into a multi-booth exhibitor', () => {
    const match = buildGuideExhibitors().find(
      (item) => item.entity.name === '泓湘',
    );
    expect(match).toBeDefined();
    const booths = (match!.entity.booths as Array<{ display_code: string }>).map(
      (booth) => booth.display_code,
    );
    expect(booths.sort()).toEqual(['F11A', 'F11D']);
  });

  test('uses unique stable ids', () => {
    const ids = buildGuideExhibitors().map((item) => item.entity.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('exhibitor_guide_'))).toBe(true);
  });
});

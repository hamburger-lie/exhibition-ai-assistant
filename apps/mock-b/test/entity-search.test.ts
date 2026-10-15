import { describe, expect, test } from 'vitest';

import { findExhibitorByName } from '../src/entity-search.js';

describe('findExhibitorByName with guide-map exhibitors', () => {
  test('matches a short name printed on the official hall map', () => {
    const match = findExhibitorByName('丽本在哪个展位');
    expect(match?.entity.name).toBe('丽本');
    const booths = match?.entity.booths as Array<{ display_code: string }>;
    expect(booths.map((booth) => booth.display_code)).toContain('H06A');
  });

  test('matches a booth number together with its hall', () => {
    const match = findExhibitorByName('9.1馆 H06A 在哪里');
    expect(match?.entity.hall).toEqual({ id: 'hall_b91', name: '9.1馆' });
    const booths = match?.entity.booths as Array<{ display_code: string }>;
    expect(booths.some((booth) => booth.display_code === 'H06A')).toBe(true);
  });

  test('does not treat a generic 展位 question as a booth-code hit', () => {
    expect(findExhibitorByName('这个展位在哪里')).toBeUndefined();
  });
});

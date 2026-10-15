/**
 * 把官方参观指南图上的全部可定位展位号做成展商实体。
 *
 * 展位清单以 venue.ts 为准；图上短称来自 guide-names.json（B 区活文字为主，
 * A 区大多转曲读不到）。同一馆里相同短称合并为多展位展商。
 */

import guideNames from './guide-names.json' with { type: 'json' };
import { VENUE_HALLS, type VenueHall } from './venue.js';

export interface GuideExhibitor {
  entity_type: 'exhibitor';
  entity: Record<string, unknown>;
}

type GuideNames = Record<string, Record<string, string>>;

const NAMES = guideNames as GuideNames;

function booth(hall: VenueHall, code: string) {
  return {
    booth_id: `booth_${hall.shapeSlug}_${code}`,
    display_code: code,
    map_shape_id: `shape_${hall.shapeSlug}_${code}`,
  };
}

function exhibitorId(hall: VenueHall, codes: string[]): string {
  const sorted = [...codes].sort();
  return `exhibitor_guide_${hall.shapeSlug}_${sorted[0]}`;
}

export function buildGuideExhibitors(): GuideExhibitor[] {
  const exhibitors: GuideExhibitor[] = [];

  for (const hall of VENUE_HALLS) {
    const names = NAMES[hall.hallId] ?? {};
    const grouped = new Map<string, string[]>();
    const unnamed: string[] = [];

    for (const code of hall.boothCodes) {
      const name = names[code];
      if (name) {
        const codes = grouped.get(name) ?? [];
        codes.push(code);
        grouped.set(name, codes);
      } else {
        unnamed.push(code);
      }
    }

    for (const [name, codes] of grouped) {
      exhibitors.push({
        entity_type: 'exhibitor',
        entity: {
          id: exhibitorId(hall, codes),
          name,
          aliases: codes,
          hall: { id: hall.hallId, name: hall.name },
          booths: codes.map((code) => booth(hall, code)),
          status: 'published',
        },
      });
    }

    for (const code of unnamed) {
      exhibitors.push({
        entity_type: 'exhibitor',
        entity: {
          id: exhibitorId(hall, [code]),
          name: code,
          aliases: [code],
          hall: { id: hall.hallId, name: hall.name },
          booths: [booth(hall, code)],
          status: 'published',
        },
      });
    }
  }

  return exhibitors;
}

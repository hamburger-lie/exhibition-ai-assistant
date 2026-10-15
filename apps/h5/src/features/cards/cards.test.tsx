// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { CitationList } from '../citations/CitationList.js';
import { EntityCard } from './EntityCard.js';
import { resolveBoothContext } from './card-types.js';
import type {
  CitationData,
  EventCardData,
  ExhibitorCardData,
  ProductCardData,
} from './card-types.js';

const exhibitorCard: ExhibitorCardData = {
  card_id: 'card_exhibitor_huayan',
  type: 'exhibitor',
  entity_id: 'exhibitor_huayan',
  title: '华研生物科技',
  actions: [
    { type: 'open_entity', label: '查看展商', entity_id: 'exhibitor_huayan' },
    {
      type: 'highlight_booth',
      label: '展位定位',
      booth_id: 'booth_demo_C18',
      map_shape_id: 'shape_demo_C18',
    },
  ],
  payload: {
    name: '华研生物科技',
    hall_id: 'hall_demo',
    hall_name: '5.2馆',
    booths: [{ booth_id: 'booth_demo_C18', display_code: 'C18' }],
    categories: ['胶原蛋白原料'],
  },
};

const productCard: ProductCardData = {
  card_id: 'card_product_1',
  type: 'product',
  entity_id: 'product_1',
  title: '重组胶原蛋白原液',
  actions: [{ type: 'open_entity', label: '查看产品', entity_id: 'product_1' }],
  payload: {
    product_id: 'product_1',
    name: '重组胶原蛋白原液',
    category: '原料',
    exhibitor_id: 'exhibitor_huayan',
    hall_id: 'hall_demo',
    booth_ids: ['booth_demo_C18'],
  },
};

const eventCard: EventCardData = {
  card_id: 'card_event_1',
  type: 'event',
  entity_id: 'event_1',
  title: 'AI 论坛',
  actions: [],
  payload: {
    event_id: 'event_1',
    title: 'AI 论坛',
    start_at: '2026-09-04T10:00:00+08:00',
    end_at: '2026-09-04T11:00:00+08:00',
    venue: '5.2馆',
    status: 'scheduled',
  },
};

afterEach(() => {
  cleanup();
});

describe('EntityCard', () => {
  test('renders an exhibitor card and only reads structured entity_id/booth_id from actions', async () => {
    const onOpenEntity = vi.fn();
    const onHighlightBooth = vi.fn();
    const user = userEvent.setup();

    render(
      <EntityCard
        card={exhibitorCard}
        handlers={{ onOpenEntity, onHighlightBooth }}
      />,
    );

    expect(screen.getByText('华研生物科技')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看展商' }));
    // 处理器同时拿到卡片，调用方据 card.type 决定详情页路由。
    expect(onOpenEntity).toHaveBeenCalledWith('exhibitor_huayan', exhibitorCard);
    expect(onOpenEntity).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '展位定位' }));
    expect(onHighlightBooth).toHaveBeenCalledWith(
      {
        type: 'highlight_booth',
        label: '展位定位',
        booth_id: 'booth_demo_C18',
        map_shape_id: 'shape_demo_C18',
      },
      exhibitorCard,
    );
  });

  test('resolves the user-facing booth number and hall from the card payload', () => {
    const action = exhibitorCard.actions.find(
      (a): a is Extract<typeof a, { type: 'highlight_booth' }> =>
        a.type === 'highlight_booth',
    )!;

    // 展位号必须来自 payload.booths 的 display_code，而不是内部 booth_id。
    expect(resolveBoothContext(action, exhibitorCard)).toEqual({
      booth_id: 'booth_demo_C18',
      display_code: 'C18',
      map_shape_id: 'shape_demo_C18',
      hall_id: 'hall_demo',
    });
  });

  test('falls back to booth_id when the payload has no matching booth', () => {
    const action = {
      type: 'highlight_booth' as const,
      label: '展位定位',
      booth_id: 'booth_not_in_payload',
      map_shape_id: 'shape_x',
    };

    expect(resolveBoothContext(action, exhibitorCard)).toMatchObject({
      display_code: 'booth_not_in_payload',
      hall_id: 'hall_demo',
    });
  });

  test('hides an action that has no handler rather than rendering a dead button', () => {
    render(<EntityCard card={exhibitorCard} handlers={{}} />);

    expect(screen.queryByRole('button', { name: '查看展商' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '展位定位' })).not.toBeInTheDocument();
  });

  test('renders a product card via type dispatch', () => {
    render(<EntityCard card={productCard} />);
    expect(screen.getByText('重组胶原蛋白原液')).toBeInTheDocument();
    expect(screen.getByText('原料')).toBeInTheDocument();
  });

  test('renders an event card via type dispatch', () => {
    render(<EntityCard card={eventCard} />);
    expect(screen.getByText('AI 论坛')).toBeInTheDocument();
    expect(screen.getByText('未开始')).toBeInTheDocument();
  });
});

describe('CitationList', () => {
  test('shows only the source_id-backed fields B actually returned', () => {
    const citations: CitationData[] = [
      {
        citation_id: 'citation_huayan',
        source_id: 'source_exhibitors_2026',
        title: '2026春季展商名录',
        page_or_row: 'row 118',
        snippet: '华研生物科技，5.2馆C18',
        source_type: 'structured_data',
      },
    ];

    render(<CitationList citations={citations} />);

    expect(screen.getByText('2026春季展商名录')).toBeInTheDocument();
    expect(screen.getByText(/row 118/)).toBeInTheDocument();
    expect(screen.getByText('华研生物科技，5.2馆C18')).toBeInTheDocument();
  });

  test('renders nothing when there are no citations', () => {
    const { container } = render(<CitationList citations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('is collapsed by default and summarised as 参考依据 N (spec §4.3)', () => {
    const citations: CitationData[] = [
      {
        citation_id: 'c_1',
        source_id: 'source_exhibitors_2026',
        title: '2026春季展商名录',
        page_or_row: 'row 118',
        source_type: 'structured_data',
      },
      {
        citation_id: 'c_2',
        source_id: 'source_notice_2026',
        title: '现场须知',
        page_or_row: 'p. 3',
        source_type: 'document',
      },
    ];

    const { container } = render(<CitationList citations={citations} />);

    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');
    expect(container.querySelector('summary')?.textContent).toContain(
      '参考依据 2',
    );
  });

  test('never invents a page_or_row that the interface did not return', () => {
    const citations: CitationData[] = [
      {
        citation_id: 'c_1',
        source_id: 'source_faq_2026',
        title: '常见问题',
        source_type: 'faq',
      },
    ];

    const { container } = render(<CitationList citations={citations} />);
    const meta = container.querySelector('.citation__meta')?.textContent ?? '';

    expect(meta).toContain('source_faq_2026');
    // 没有 page_or_row 时不补占位符，也不出现空的分隔符尾巴。
    expect(meta.trim().endsWith('·')).toBe(false);
    expect(meta).not.toMatch(/undefined|null|--/);
  });
});

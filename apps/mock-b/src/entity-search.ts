import {
  buildEvents,
  buildExhibitors,
  buildGuideExhibitors,
  buildProducts,
  VENUE_HALLS,
  type EntityDetailData,
  type VenueHall,
} from '@ai-assistant/demo-catalog';

/**
 * 让「找展商/找产品/找活动」这三类聊天场景能从大批量样例数据（见
 * `@ai-assistant/demo-catalog`）里按名称精确匹配出不同的卡片，而不是永远回落到
 * 契约测试锁死的那唯一一条静态 fixture。
 *
 * 边界：这仍然是 Task 4 明确要求的「关键词路由到固定内容」，不是真实检索——
 * 匹配规则只是「query 里包含某个样例的名字」这种确定性子串匹配，不做分词、
 * 排序、模糊匹配或语义理解。锚点实体（exhibitor_huayan 等 3 条，index 0）
 * 排除在匹配池之外：它们已经有专属的静态 SSE fixture 被契约测试锁死，继续
 * 走原来的关键词兜底路径，避免出现「同一个名字两种不同卡片内容」的歧义。
 */

const exhibitors = [...buildExhibitors().slice(1), ...buildGuideExhibitors()];
const products = buildProducts(buildExhibitors()).slice(1);
const events = buildEvents().slice(1);

const BOOTH_CODE_RE = /^[A-Z]\d{2,3}[A-Z]?(-\d)?$/;
const BOOTH_CODE_IN_TEXT = /[A-Z]\d{2,3}[A-Z]?(?:-\d)?/g;

function isBoothCodeName(name: string): boolean {
  return BOOTH_CODE_RE.test(name);
}

function matchHall(query: string): VenueHall | undefined {
  const halls = [...VENUE_HALLS].sort((a, b) => b.name.length - a.name.length);
  for (const hall of halls) {
    if (query.includes(hall.name)) return hall;
  }
  for (const hall of halls) {
    const num = hall.name.replace(/馆$/u, '');
    const escaped = num.replace('.', '\\.');
    if (new RegExp(`(?<![\\d.])${escaped}(?![\\d])`).test(query)) return hall;
  }
  return undefined;
}

function extractBoothCodes(query: string): string[] {
  return query.toUpperCase().match(BOOTH_CODE_IN_TEXT) ?? [];
}

function boothsOf(item: EntityDetailData): Array<{ display_code: string }> {
  return (item.entity.booths as Array<{ display_code: string }> | undefined) ?? [];
}

function findByName<T extends EntityDetailData>(
  pool: T[],
  nameOf: (item: T) => string,
  query: string,
): T | undefined {
  // 多个名字互为子串时（理论上不会发生，样例名字都不同），取最长匹配，
  // 结果更贴合用户实际打出来的那个词。
  let best: T | undefined;
  let bestLength = 0;
  for (const item of pool) {
    const name = nameOf(item);
    if (name.length > 0 && query.includes(name) && name.length > bestLength) {
      best = item;
      bestLength = name.length;
    }
  }
  return best;
}

export function findExhibitorByName(query: string): EntityDetailData | undefined {
  const named = exhibitors.filter(
    (item) => !isBoothCodeName(String(item.entity.name ?? '')),
  );
  const byName = findByName(named, (item) => String(item.entity.name ?? ''), query);
  if (byName) return byName;

  const codes = extractBoothCodes(query);
  if (codes.length === 0) return undefined;

  const hall = matchHall(query);
  const pool = hall
    ? exhibitors.filter((item) => (item.entity.hall as { id: string }).id === hall.hallId)
    : exhibitors;
  const longestFirst = [...codes].sort((a, b) => b.length - a.length);
  for (const code of longestFirst) {
    const match = pool.find((item) =>
      boothsOf(item).some((booth) => booth.display_code.toUpperCase() === code),
    );
    if (match) return match;
  }
  return undefined;
}

export function findProductByName(query: string): EntityDetailData | undefined {
  return findByName(products, (item) => String(item.entity.name ?? ''), query);
}

export function findEventByTitle(query: string): EntityDetailData | undefined {
  return findByName(events, (item) => String(item.entity.title ?? ''), query);
}

interface SseFrame {
  event: string;
  data: Record<string, unknown>;
}

interface Booth {
  booth_id: string;
  display_code: string;
  map_shape_id?: string;
}

function boothActions(booths: Booth[]): Array<Record<string, unknown>> {
  const primary = booths[0];
  const actions: Array<Record<string, unknown>> = [];
  if (primary) {
    // highlight_booth 的 map_shape_id 是必填字段（card.schema.json），
    // 没有真实 shape 时只能不带这个 action，不能编造一个假的 map_shape_id。
    if (primary.map_shape_id) {
      actions.push({
        type: 'highlight_booth',
        label: '展位定位',
        booth_id: primary.booth_id,
        map_shape_id: primary.map_shape_id,
      });
    }
  }
  return actions;
}

let traceCounter = 0;
function nextId(prefix: string): string {
  traceCounter += 1;
  return `${prefix}_${traceCounter}`;
}

export function buildExhibitorFrames(data: EntityDetailData): SseFrame[] {
  const entity = data.entity as {
    id: string;
    name: string;
    brands?: string[];
    hall: { id: string; name: string };
    booths: Booth[];
    categories?: string[];
    tags?: string[];
  };
  const requestId = nextId('req_mock');
  const messageId = nextId('msg_mock');
  const primary = entity.booths[0];

  return [
    {
      event: 'message.start',
      data: {
        request_id: requestId,
        conversation_id: 'conv_demo',
        message_id: messageId,
        protocol_version: '1.0.0',
      },
    },
    {
      event: 'status.update',
      data: { request_id: requestId, stage: 'searching', display_text: '正在查找展商' },
    },
    {
      event: 'message.delta',
      data: {
        request_id: requestId,
        message_id: messageId,
        delta: primary
          ? `${entity.name}位于${entity.hall.name}${primary.display_code}展位。`
          : `为你找到${entity.name}。`,
      },
    },
    {
      event: 'entity.card',
      data: {
        request_id: requestId,
        message_id: messageId,
        card: {
          card_id: `card_${entity.id}`,
          type: 'exhibitor',
          entity_id: entity.id,
          title: entity.name,
          actions: [
            { type: 'open_entity', label: '查看展商', entity_id: entity.id },
            ...boothActions(entity.booths),
          ],
          payload: {
            name: entity.name,
            ...(entity.brands ? { brands: entity.brands } : {}),
            hall_id: entity.hall.id,
            hall_name: entity.hall.name,
            booths: entity.booths,
            ...(entity.categories ? { categories: entity.categories } : {}),
            ...(entity.tags ? { tags: entity.tags } : {}),
            logo_url: null,
            recommendation_reason: null,
          },
        },
      },
    },
    {
      event: 'citation',
      data: {
        request_id: requestId,
        message_id: messageId,
        citation: {
          citation_id: `citation_${entity.id}`,
          source_id: 'source_exhibitors_2026',
          title: '2026春季展商名录',
          page_or_row: `row ${(traceCounter % 400) + 1}`,
          snippet: primary
            ? `${entity.name}，${entity.hall.name}${primary.display_code}`
            : entity.name,
          source_type: 'structured_data',
        },
      },
    },
    {
      event: 'suggestion.list',
      data: {
        request_id: requestId,
        message_id: messageId,
        items: [
          { id: 'suggest_products', text: '看看该展商的产品' },
          { id: 'suggest_nearby', text: '推荐附近展商' },
        ],
      },
    },
    {
      event: 'message.done',
      data: {
        request_id: requestId,
        conversation_id: 'conv_demo',
        message_id: messageId,
        answer_status: 'answered',
        intent: 'exhibitor_search',
        search_route: 'exact',
        confidence: 'high',
        latency_ms: 120,
        versions: { kb: 'kb_2026_spring_1', search: 'search_1.4.0' },
      },
    },
  ];
}

export function buildProductFrames(data: EntityDetailData): SseFrame[] {
  const entity = data.entity as {
    id: string;
    name: string;
    category: string;
    functions?: string[];
    brand?: string;
    exhibitor_id: string;
    hall: { id: string; name: string };
    booths: Booth[];
    tags?: string[];
  };
  const requestId = nextId('req_mock');
  const messageId = nextId('msg_mock');

  return [
    {
      event: 'message.start',
      data: {
        request_id: requestId,
        conversation_id: 'conv_demo',
        message_id: messageId,
        protocol_version: '1.0.0',
      },
    },
    {
      event: 'message.delta',
      data: { request_id: requestId, message_id: messageId, delta: `为你找到${entity.name}。` },
    },
    {
      event: 'entity.card',
      data: {
        request_id: requestId,
        message_id: messageId,
        card: {
          card_id: `card_${entity.id}`,
          type: 'product',
          entity_id: entity.id,
          title: entity.name,
          actions: [
            { type: 'open_entity', label: '查看产品', entity_id: entity.id },
            ...boothActions(entity.booths),
          ],
          payload: {
            product_id: entity.id,
            name: entity.name,
            category: entity.category,
            ...(entity.functions ? { functions: entity.functions } : {}),
            ...(entity.brand ? { brand: entity.brand } : {}),
            exhibitor_id: entity.exhibitor_id,
            hall_id: entity.hall.id,
            booth_ids: entity.booths.map((b) => b.booth_id),
            ...(entity.tags ? { tags: entity.tags } : {}),
          },
        },
      },
    },
    {
      event: 'message.done',
      data: {
        request_id: requestId,
        conversation_id: 'conv_demo',
        message_id: messageId,
        answer_status: 'answered',
        intent: 'product_search',
        search_route: 'hybrid',
        confidence: 'high',
        latency_ms: 140,
        versions: { kb: 'kb_2026_spring_1', search: 'search_1.4.0' },
      },
    },
  ];
}

export function buildEventFrames(data: EntityDetailData): SseFrame[] {
  const entity = data.entity as {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    venue: string;
    hall?: { id: string; name: string };
    status: 'scheduled' | 'ongoing' | 'ended' | 'cancelled';
    speakers?: string[];
    tags?: string[];
  };
  const requestId = nextId('req_mock');
  const messageId = nextId('msg_mock');

  return [
    {
      event: 'message.start',
      data: {
        request_id: requestId,
        conversation_id: 'conv_demo',
        message_id: messageId,
        protocol_version: '1.0.0',
      },
    },
    {
      event: 'message.delta',
      data: {
        request_id: requestId,
        message_id: messageId,
        delta: `${entity.title}将于${entity.start_at.slice(5, 10).replace('-', '月')}日举行。`,
      },
    },
    {
      event: 'entity.card',
      data: {
        request_id: requestId,
        message_id: messageId,
        card: {
          card_id: `card_${entity.id}`,
          type: 'event',
          entity_id: entity.id,
          title: entity.title,
          actions: [{ type: 'open_entity', label: '查看活动', entity_id: entity.id }],
          payload: {
            event_id: entity.id,
            title: entity.title,
            start_at: entity.start_at,
            end_at: entity.end_at,
            venue: entity.venue,
            ...(entity.hall ? { hall_id: entity.hall.id } : {}),
            status: entity.status,
            ...(entity.speakers ? { speakers: entity.speakers } : {}),
            ...(entity.tags ? { tags: entity.tags } : {}),
          },
        },
      },
    },
    {
      event: 'message.done',
      data: {
        request_id: requestId,
        conversation_id: 'conv_demo',
        message_id: messageId,
        answer_status: 'answered',
        intent: 'event_search',
        search_route: 'exact',
        confidence: 'high',
        latency_ms: 95,
        versions: { kb: 'kb_2026_spring_1', search: 'search_1.4.0' },
      },
    },
  ];
}

export interface Booth {
  booth_id: string;
  display_code: string;
  map_shape_id?: string;
}

export interface OpenEntityAction {
  type: 'open_entity';
  label: string;
  entity_id: string;
}

export interface HighlightBoothAction {
  type: 'highlight_booth';
  label: string;
  booth_id: string;
  map_shape_id: string;
}

export type CardAction = OpenEntityAction | HighlightBoothAction;

export interface ExhibitorPayload {
  name: string;
  brands?: string[];
  hall_id: string;
  hall_name: string;
  booths: Booth[];
  categories?: string[];
  tags?: string[];
  logo_url?: string | null;
  recommendation_reason?: string | null;
}

export interface ProductPayload {
  product_id: string;
  name: string;
  category: string;
  functions?: string[];
  brand?: string;
  exhibitor_id: string;
  hall_id: string;
  booth_ids: string[];
  tags?: string[];
}

export interface EventPayload {
  event_id: string;
  title: string;
  start_at: string;
  end_at: string;
  venue: string;
  hall_id?: string;
  status: 'scheduled' | 'ongoing' | 'ended' | 'cancelled';
  speakers?: string[];
  tags?: string[];
}

interface CardBase {
  card_id: string;
  entity_id: string;
  title: string;
  subtitle?: string;
  badges?: string[];
  actions: CardAction[];
}

export interface ExhibitorCardData extends CardBase {
  type: 'exhibitor';
  payload: ExhibitorPayload;
}

export interface ProductCardData extends CardBase {
  type: 'product';
  payload: ProductPayload;
}

export interface EventCardData extends CardBase {
  type: 'event';
  payload: EventPayload;
}

export interface BoothCardData extends CardBase {
  type: 'booth';
  payload: Booth;
}

export type EntityCardData =
  | ExhibitorCardData
  | ProductCardData
  | EventCardData
  | BoothCardData;

export interface CitationData {
  citation_id: string;
  source_id: string;
  title: string;
  page_or_row?: string | null;
  snippet?: string;
  source_type: 'structured_data' | 'faq' | 'document' | 'webpage_internal';
}

export interface CardActionHandlers {
  /** 同时传入所属卡片，调用方据 card.type 决定详情页路由，不猜测类型。 */
  onOpenEntity?: (entityId: string, card: EntityCardData) => void;
  /**
   * 除了动作本身，还传入所属卡片，便于从卡片的结构化 payload 里取出展位号
   * 和馆号（HighlightBoothAction 只带 booth_id/map_shape_id，不含展示用的
   * display_code / hall）。依旧全部来自接口结构化数据，不解析 AI 文本。
   */
  onHighlightBooth?: (action: HighlightBoothAction, card: EntityCardData) => void;
}

export interface BoothContext {
  booth_id: string;
  display_code: string;
  map_shape_id?: string;
  hall_id?: string;
}

/** 从卡片结构化 payload 中解析出展位展示信息；解析不到就退回 booth_id。 */
export function resolveBoothContext(
  action: HighlightBoothAction,
  card: EntityCardData,
): BoothContext {
  const base: BoothContext = {
    booth_id: action.booth_id,
    display_code: action.booth_id,
    map_shape_id: action.map_shape_id,
  };

  if (card.type === 'exhibitor') {
    const booth = card.payload.booths.find((b) => b.booth_id === action.booth_id);
    return {
      ...base,
      ...(booth ? { display_code: booth.display_code } : {}),
      hall_id: card.payload.hall_id,
    };
  }

  if (card.type === 'booth' && card.payload.booth_id === action.booth_id) {
    return { ...base, display_code: card.payload.display_code };
  }

  if (card.type === 'product') {
    return { ...base, hall_id: card.payload.hall_id };
  }

  if (card.type === 'event' && card.payload.hall_id) {
    return { ...base, hall_id: card.payload.hall_id };
  }

  return base;
}

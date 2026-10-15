import type {
  EntityCard,
  EntityDetailsResponse,
  EventsBatchRequest,
  FeedbackRequest,
  ProductPayload,
  QualitySignalsRequest,
  QualitySignalsResponse,
  SearchRequest,
  SearchResult,
  SearchResponse,
} from '../../../packages/generated-types/src/index.js';

const searchWithOneEntityType: SearchRequest = {
  request_id: 'r_1',
  expo_id: 'expo_1',
  query: 'OEM',
  entity_types: ['exhibitor'],
  search_mode: 'auto',
};
const searchWithNoEntityTypes: SearchRequest = {
  request_id: 'r_1',
  expo_id: 'expo_1',
  query: 'OEM',
  // @ts-expect-error entity_types 必须是非空数组。
  entity_types: [],
  search_mode: 'auto',
};

const eventsWithOneEvent: EventsBatchRequest = {
  events: [
    {
      event_id: 'event_1',
      event_type: 'page_view',
      occurred_at: '2026-08-24T12:00:00+08:00',
      request_id: 'r_1',
    },
  ],
};
// @ts-expect-error events 必须是非空数组。
const eventsWithNoEvents: EventsBatchRequest = { events: [] };

const signalsWithOneSignal: QualitySignalsRequest = {
  signals: [
    {
      signal_id: 'signal_1',
      signal_type: 'zero_result',
      occurred_at: '2026-08-24T12:00:00+08:00',
      request_id: 'r_1',
      expo_id: 'expo_1',
      payload: {},
    },
  ],
};
// @ts-expect-error signals 必须是非空数组。
const signalsWithNoSignals: QualitySignalsRequest = { signals: [] };

const productWithOneBooth: ProductPayload = {
  product_id: 'product_1',
  name: '精华液',
  category: '护肤',
  exhibitor_id: 'exhibitor_1',
  hall_id: 'hall_1',
  booth_ids: ['booth_1'],
};
const productWithNoBooths: ProductPayload = {
  product_id: 'product_1',
  name: '精华液',
  category: '护肤',
  exhibitor_id: 'exhibitor_1',
  hall_id: 'hall_1',
  // @ts-expect-error booth_ids 必须是非空数组。
  booth_ids: [],
};

const positive: FeedbackRequest = {
  feedback_id: 'fb_1',
  request_id: 'r_1',
  conversation_id: 'c_1',
  message_id: 'm_1',
  rating: 'positive',
  target: null,
};

const negative: FeedbackRequest = {
  feedback_id: 'fb_2',
  request_id: 'r_1',
  conversation_id: 'c_1',
  message_id: 'm_1',
  rating: 'negative',
  reason: 'wrong_information',
};

// @ts-expect-error 负反馈必须提供 reason。
const invalidNegative: FeedbackRequest = {
  feedback_id: 'fb_3',
  request_id: 'r_1',
  conversation_id: 'c_1',
  message_id: 'm_1',
  rating: 'negative',
};

const qualityResponse: QualitySignalsResponse = { accepted: 1 };

const exhibitorCard: EntityCard = {
  card_id: 'card_1',
  type: 'exhibitor',
  entity_id: 'ex_1',
  title: '示例生物科技',
  actions: [],
  payload: {
    name: '示例生物科技',
    hall_id: 'hall_demo',
    hall_name: '5.2馆',
    booths: [{ booth_id: 'booth_C18', display_code: 'C18' }],
  },
};

const acceptCard = (card: EntityCard) => card;
const mismatchedCard = {
  card_id: 'card_2',
  type: 'exhibitor',
  entity_id: 'ex_1',
  title: '错配',
  actions: [],
  payload: {
    event_id: 'event_1',
    title: '论坛',
    start_at: '2026-09-04T10:00:00+08:00',
    end_at: '2026-09-04T11:00:00+08:00',
    venue: '5.2馆',
    status: 'scheduled',
  },
} as const;
// @ts-expect-error exhibitor 卡片不能使用 event payload。
acceptCard(mismatchedCard);

const entityDetails: EntityDetailsResponse = {
  request_id: 'r_1',
  success: true,
  data: {
    entity_type: 'exhibitor',
    entity: {
      id: 'ex_1',
      name: '示例生物科技',
      hall: { id: 'hall_demo', name: '5.2馆' },
      booths: [{ booth_id: 'booth_C18', display_code: 'C18' }],
      status: 'published',
    },
  },
  error: null,
};

const acceptSearchResponse = (response: SearchResponse) => response;
const invalidSearchResponse = {
  request_id: 'r_1',
  route: 'hybrid',
  normalized_query: 'OEM',
  detected_entities: [],
  results: [{}],
  trace: null,
  versions: {},
} as const;
// @ts-expect-error I03 result 不能是空对象，versions 也必须完整。
acceptSearchResponse(invalidSearchResponse);

const acceptSearchResult = (result: SearchResult) => result;
const mismatchedSearchResult = {
  rank: 1,
  entity_type: 'exhibitor' as const,
  entity_id: 'ex_1',
  final_score: 0.9,
  relevance_grade: 'high' as const,
  matched_fields: ['title'],
  highlights: ['论坛'],
  entity: { title: 'AI 论坛' },
};
// @ts-expect-error exhibitor 结果不能绑定 event 摘要。
acceptSearchResult(mismatchedSearchResult);

void positive;
void searchWithOneEntityType;
void searchWithNoEntityTypes;
void eventsWithOneEvent;
void eventsWithNoEvents;
void signalsWithOneSignal;
void signalsWithNoSignals;
void productWithOneBooth;
void productWithNoBooths;
void negative;
void invalidNegative;
void qualityResponse;
void exhibitorCard;
void entityDetails;

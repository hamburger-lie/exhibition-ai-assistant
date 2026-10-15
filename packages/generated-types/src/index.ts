/* 此文件由 packages/contracts/scripts/generate-types.ts 自动生成，请勿手工修改。 */

export type OpaqueId = string;
export type DateTime = string;
export type AnswerStatus =
  'answered' | 'clarify' | 'abstain' | 'conflict' | 'partial';
export type EntityCard = ExhibitorCard | ProductCard | EventCard | BoothCard;
export type CardAction = OpenEntityAction | HighlightBoothAction;
export type BoothPayload = Booth;
export type InternalVersions = PromptVersions | IndexedVersions;
export type Intent =
  | 'faq_query'
  | 'exhibitor_search'
  | 'product_search'
  | 'booth_lookup'
  | 'event_search'
  | 'map_lookup'
  | 'recommendation'
  | 'multi_intent'
  | 'unknown';
export type EntityType = 'exhibitor' | 'product' | 'event' | 'booth';
export type SearchResult =
  | ExhibitorSearchResult
  | ProductSearchResult
  | EventSearchResult
  | BoothSearchResult;
export type FeedbackRequest = PositiveFeedbackRequest | NegativeFeedbackRequest;
export type FeedbackTarget = {
  entity_type: EntityType;
  entity_id: OpaqueId;
} | null;
export type FeedbackReason =
  | 'irrelevant'
  | 'wrong_information'
  | 'outdated_information'
  | 'not_found'
  | 'not_resolved'
  | 'bad_recommendation'
  | 'other';
export type QualitySignalType =
  | 'negative_feedback'
  | 'zero_result'
  | 'low_confidence'
  | 'user_rephrase'
  | 'entity_no_click'
  | 'conflict_detected'
  | 'outdated_detected';
export type BehaviorEventType =
  | 'page_view'
  | 'message_send'
  | 'suggestion_click'
  | 'entity_impression'
  | 'entity_click'
  | 'citation_open'
  | 'map_open'
  | 'booth_highlight'
  | 'stream_cancel'
  | 'error_view'
  | 'feedback_submit';
export type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'SESSION_EXPIRED'
  | 'EXPO_NOT_FOUND'
  | 'ENTITY_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SEARCH_TIMEOUT'
  | 'RETRIEVE_TIMEOUT'
  | 'AI_UPSTREAM_TIMEOUT'
  | 'KNOWLEDGE_UNAVAILABLE'
  | 'UPSTREAM_UNAVAILABLE'
  | 'STREAM_INTERRUPTED'
  | 'INTERNAL_ERROR';
export type SseEvent =
  | MessageStartEvent
  | StatusUpdateEvent
  | MessageDeltaEvent
  | EntityCardEvent
  | CitationEvent
  | SuggestionListEvent
  | MessageDoneEvent
  | MessageErrorEvent;

export interface ApiContract {
  session_request: SessionRequest;
  session_response: SessionResponse;
  config_response: ConfigResponse;
  public_chat_request: PublicChatRequest;
  public_chat_response: PublicChatResponse;
  entity_details_response: EntityDetailsResponse;
  agent_request: AgentRequest;
  internal_agent_response: InternalAgentResponse;
  search_request: SearchRequest;
  search_response: SearchResponse;
  retrieve_request: RetrieveRequest;
  retrieve_response: RetrieveResponse;
  resolve_request: ResolveRequest;
  resolve_response: ResolveResponse;
  health_response: HealthResponse;
  version_response: VersionResponse;
  entity_card: EntityCard;
  citation: Citation;
  feedback_request: FeedbackRequest;
  feedback_response: FeedbackResponse;
  quality_signals_request: QualitySignalsRequest;
  quality_signals_response: QualitySignalsResponse;
  events_batch_request: EventsBatchRequest;
  events_batch_response: EventsBatchResponse;
  sse_event: SseEvent;
  public_error: PublicError;
  public_error_envelope: PublicErrorEnvelope;
  internal_error_envelope: InternalErrorEnvelope;
}
export interface SessionRequest {
  expo_id: OpaqueId;
  source: 'wechat_miniprogram_webview' | 'direct_h5' | 'qr_code' | 'other';
  entry?: {
    campaign?: string | null;
    referrer?: string | null;
  };
}
export interface SessionResponse {
  request_id: OpaqueId;
  success: true;
  data: {
    session_id: OpaqueId;
    anonymous_user_id: OpaqueId;
    session_token: string;
    expires_at: DateTime;
    default_conversation_id: OpaqueId;
  };
  error: null;
  meta?: ApiMeta;
}
export interface ApiMeta {
  api_version: 'v1';
  server_time: DateTime;
}
export interface ConfigResponse {
  request_id: OpaqueId;
  success: true;
  data: {
    assistant_name: string;
    welcome_text: string;
    quick_actions: QuickAction[];
    features: {
      streaming: boolean;
      feedback: boolean;
      citations: boolean;
      map_highlight: boolean;
    };
    config_version: string;
  };
  error: null;
  meta?: ApiMeta;
}
export interface QuickAction {
  id: OpaqueId;
  label: string;
  prompt: string;
}
export interface PublicChatRequest {
  conversation_id: OpaqueId;
  message: string;
  context: {
    expo_id: OpaqueId;
    locale?: string;
    current_hall_id?: string | null;
    selected_entity_ids?: OpaqueId[];
  };
  client?: {
    message_id?: OpaqueId;
    supports?: ('sse_v1' | 'entity_card_v1' | 'citation_v1')[];
  };
}
export interface PublicChatResponse {
  request_id: OpaqueId;
  success: true;
  data: PublicChatData;
  error: null;
  meta?: ApiMeta;
}
export interface PublicChatData {
  conversation_id: OpaqueId;
  message_id: OpaqueId;
  answer: string;
  answer_status: AnswerStatus;
  cards: EntityCard[];
  citations: Citation[];
  /**
   * @maxItems 4
   */
  suggestions:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string];
  versions?: PublicVersions;
}
export interface ExhibitorCard {
  card_id: OpaqueId;
  type: 'exhibitor';
  entity_id: OpaqueId;
  title: string;
  subtitle?: string;
  badges?: string[];
  actions: CardAction[];
  payload: ExhibitorPayload;
}
export interface OpenEntityAction {
  type: 'open_entity';
  label: string;
  entity_id: OpaqueId;
}
export interface HighlightBoothAction {
  type: 'highlight_booth';
  label: string;
  booth_id: OpaqueId;
  map_shape_id: OpaqueId;
}
export interface ExhibitorPayload {
  name: string;
  brands?: string[];
  hall_id: OpaqueId;
  hall_name: string;
  /**
   * @minItems 1
   */
  booths: [Booth, ...Booth[]];
  categories?: string[];
  tags?: string[];
  logo_url?: string | null;
  recommendation_reason?: string | null;
}
export interface Booth {
  booth_id: OpaqueId;
  display_code: string;
  map_shape_id?: OpaqueId;
}
export interface ProductCard {
  card_id: OpaqueId;
  type: 'product';
  entity_id: OpaqueId;
  title: string;
  subtitle?: string;
  badges?: string[];
  actions: CardAction[];
  payload: ProductPayload;
}
export interface ProductPayload {
  product_id: OpaqueId;
  name: string;
  category: string;
  functions?: string[];
  brand?: string;
  exhibitor_id: OpaqueId;
  hall_id: OpaqueId;
  /**
   * @minItems 1
   */
  booth_ids: [OpaqueId, ...OpaqueId[]];
  tags?: string[];
}
export interface EventCard {
  card_id: OpaqueId;
  type: 'event';
  entity_id: OpaqueId;
  title: string;
  subtitle?: string;
  badges?: string[];
  actions: CardAction[];
  payload: EventPayload;
}
export interface EventPayload {
  event_id: OpaqueId;
  title: string;
  start_at: DateTime;
  end_at: DateTime;
  venue: string;
  hall_id?: OpaqueId;
  status: 'scheduled' | 'ongoing' | 'ended' | 'cancelled';
  speakers?: string[];
  tags?: string[];
}
export interface BoothCard {
  card_id: OpaqueId;
  type: 'booth';
  entity_id: OpaqueId;
  title: string;
  subtitle?: string;
  badges?: string[];
  actions: CardAction[];
  payload: BoothPayload;
}
export interface Citation {
  citation_id: OpaqueId;
  source_id: OpaqueId;
  title: string;
  page_or_row?: string | null;
  snippet?: string;
  source_type: 'structured_data' | 'faq' | 'document' | 'webpage_internal';
}
export interface PublicVersions {
  kb: string;
  search: string;
}
export interface EntityDetailsResponse {
  request_id: OpaqueId;
  success: true;
  data: ExhibitorEntityDetails | ProductEntityDetails | EventEntityDetails;
  error: null;
  meta?: ApiMeta;
}
export interface ExhibitorEntityDetails {
  entity_type: 'exhibitor';
  entity: ExhibitorEntity;
}
export interface ExhibitorEntity {
  id: OpaqueId;
  name: string;
  aliases?: string[];
  brands?: string[];
  hall: Hall;
  /**
   * @minItems 1
   */
  booths: [Booth, ...Booth[]];
  categories?: string[];
  tags?: string[];
  description?: string;
  status: 'published';
}
export interface Hall {
  id: OpaqueId;
  name: string;
}
export interface ProductEntityDetails {
  entity_type: 'product';
  entity: ProductEntity;
}
export interface ProductEntity {
  id: OpaqueId;
  name: string;
  category: string;
  functions?: string[];
  brand?: string;
  exhibitor_id: OpaqueId;
  hall: Hall;
  /**
   * @minItems 1
   */
  booths: [Booth, ...Booth[]];
  tags?: string[];
  description?: string;
  status: 'published';
}
export interface EventEntityDetails {
  entity_type: 'event';
  entity: EventEntity;
}
export interface EventEntity {
  id: OpaqueId;
  title: string;
  start_at: DateTime;
  end_at: DateTime;
  venue: string;
  hall?: Hall;
  status: 'scheduled' | 'ongoing' | 'ended' | 'cancelled';
  speakers?: string[];
  tags?: string[];
  description?: string;
}
export interface AgentRequest {
  request_id: OpaqueId;
  conversation_id: OpaqueId;
  query: string;
  expo_id: OpaqueId;
  locale: string;
  context?: {
    current_hall_id?: string | null;
    selected_entity_ids?: OpaqueId[];
  };
  options?: {
    include_citations?: boolean;
    include_suggestions?: boolean;
    include_internal_trace?: boolean;
  };
}
export interface InternalAgentResponse {
  conversation_id: OpaqueId;
  message_id: OpaqueId;
  answer: string;
  answer_status: AnswerStatus;
  cards: EntityCard[];
  citations: Citation[];
  /**
   * @maxItems 4
   */
  suggestions:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string];
  versions?: InternalVersions;
  internal_trace?: InternalAgentTrace | null;
}
export interface PromptVersions {
  kb?: string;
  search?: string;
  prompt: string;
  model?: string;
  index?: string;
}
export interface IndexedVersions {
  kb?: string;
  search?: string;
  prompt?: string;
  model?: string;
  index: string;
}
export interface InternalAgentTrace {
  route:
    'exact' | 'lexical' | 'fuzzy' | 'semantic' | 'hybrid' | 'retrieve' | 'none';
  normalized_query?: string;
  intent?: Intent;
  tool_calls?: ('search' | 'retrieve' | 'resolve')[];
}
export interface SearchRequest {
  request_id: OpaqueId;
  expo_id: OpaqueId;
  query: string;
  /**
   * @minItems 1
   */
  entity_types: [EntityType, ...EntityType[]];
  search_mode: 'auto' | 'exact' | 'lexical' | 'fuzzy' | 'semantic' | 'hybrid';
  filters?: SearchFilters;
  limit?: number;
  include_trace?: boolean;
}
export interface SearchFilters {
  hall_ids?: OpaqueId[];
  categories?: string[];
  tags?: string[];
  status?: 'published'[];
  time_range?: {
    start_at: DateTime;
    end_at: DateTime;
  } | null;
}
export interface SearchResponse {
  request_id: OpaqueId;
  route: 'exact' | 'lexical' | 'fuzzy' | 'semantic' | 'hybrid';
  normalized_query: string;
  detected_entities: DetectedEntity[];
  results: SearchResult[];
  trace: SearchTrace | null;
  versions: SearchVersions;
}
export interface DetectedEntity {
  type: 'category' | 'capability' | 'brand' | 'hall' | 'booth' | 'time';
  value: string;
  confidence: number;
}
export interface ExhibitorSearchResult {
  rank: number;
  entity_type: 'exhibitor';
  entity_id: OpaqueId;
  final_score: number;
  relevance_grade: 'high' | 'medium' | 'low';
  matched_fields: string[];
  highlights: string[];
  entity: ExhibitorSearchEntity;
}
export interface ExhibitorSearchEntity {
  name: string;
  hall_id: OpaqueId;
  booth_ids: OpaqueId[];
}
export interface ProductSearchResult {
  rank: number;
  entity_type: 'product';
  entity_id: OpaqueId;
  final_score: number;
  relevance_grade: 'high' | 'medium' | 'low';
  matched_fields: string[];
  highlights: string[];
  entity: ProductSearchEntity;
}
export interface ProductSearchEntity {
  name: string;
  category?: string;
  exhibitor_id: OpaqueId;
  hall_id: OpaqueId;
  booth_ids: OpaqueId[];
}
export interface EventSearchResult {
  rank: number;
  entity_type: 'event';
  entity_id: OpaqueId;
  final_score: number;
  relevance_grade: 'high' | 'medium' | 'low';
  matched_fields: string[];
  highlights: string[];
  entity: EventSearchEntity;
}
export interface EventSearchEntity {
  title: string;
  start_at: DateTime;
  end_at: DateTime;
  venue: string;
  hall_id?: OpaqueId;
}
export interface BoothSearchResult {
  rank: number;
  entity_type: 'booth';
  entity_id: OpaqueId;
  final_score: number;
  relevance_grade: 'high' | 'medium' | 'low';
  matched_fields: string[];
  highlights: string[];
  entity: BoothSearchEntity;
}
export interface BoothSearchEntity {
  display_code: string;
  hall_id: OpaqueId;
  map_shape_id: OpaqueId;
}
export interface SearchTrace {
  normalization: SearchNormalizationTrace;
  exact?: SearchBranchTrace;
  lexical?: SearchBranchTrace;
  semantic?: SearchBranchTrace;
  fusion?: {
    method: string;
    candidate_count: number;
  };
  rerank?: {
    input_count: number;
    output_count: number;
    model: string;
  };
  elapsed_ms: {
    total: number;
    exact?: number;
    lexical?: number;
    semantic?: number;
    rerank?: number;
  };
}
export interface SearchNormalizationTrace {
  raw: string;
  normalized: string;
  corrections: {
    from: string;
    to: string;
    source: 'dictionary' | 'synonym' | 'rule';
  }[];
}
export interface SearchBranchTrace {
  count: number;
  top_ids: OpaqueId[];
}
export interface SearchVersions {
  search: string;
  index: string;
}
export interface RetrieveRequest {
  request_id: OpaqueId;
  expo_id: OpaqueId;
  query: string;
  /**
   * @minItems 1
   */
  scope: ['faq' | 'document', ...('faq' | 'document')[]];
  filters?: RetrieveFilters;
  mode: 'lexical' | 'semantic' | 'hybrid';
  limit?: number;
  include_trace?: boolean;
}
export interface RetrieveFilters {
  status?: 'published'[];
  effective_at?: DateTime;
}
export interface RetrieveResponse {
  request_id: OpaqueId;
  chunks: {
    chunk_id: OpaqueId;
    source_id: OpaqueId;
    source_title: string;
    section: string;
    page_or_row: string;
    text: string;
    final_score: number;
    relevance_grade: 'high' | 'medium' | 'low';
    metadata: ChunkMetadata;
  }[];
  versions: InternalVersions;
  trace?: RetrieveTrace | null;
}
export interface ChunkMetadata {
  effective_from: string;
  effective_to: string | null;
}
export interface RetrieveTrace {
  route: 'lexical' | 'semantic' | 'hybrid';
  elapsed_ms: number;
}
export interface ResolveRequest {
  request_id: OpaqueId;
  expo_id: OpaqueId;
  mention: string;
  /**
   * @minItems 1
   */
  entity_types: [EntityType, ...EntityType[]];
  strict: boolean;
}
export interface ResolveResponse {
  resolution: 'unique' | 'ambiguous' | 'not_found';
  normalized_mention: string;
  candidates: {
    entity_type: EntityType;
    entity_id: OpaqueId;
    confidence: number;
  }[];
}
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  dependencies: {
    database: 'ok' | 'degraded' | 'down';
    search: 'ok' | 'degraded' | 'down';
    vector_store: 'ok' | 'degraded' | 'down';
    llm: 'ok' | 'degraded' | 'down';
  };
}
export interface VersionResponse {
  service: string;
  service_version: string;
  search_version: string;
  kb_version: string;
  prompt_version: string;
  model_version?: string;
  index_versions: {
    entities: string;
    documents: string;
  };
}
export interface PositiveFeedbackRequest {
  feedback_id: OpaqueId;
  request_id: OpaqueId;
  conversation_id: OpaqueId;
  message_id: OpaqueId;
  rating: 'positive';
  target?: FeedbackTarget;
  comment?: string;
}
export interface NegativeFeedbackRequest {
  feedback_id: OpaqueId;
  request_id: OpaqueId;
  conversation_id: OpaqueId;
  message_id: OpaqueId;
  rating: 'negative';
  reason: FeedbackReason;
  target?: FeedbackTarget;
  comment?: string;
}
export interface FeedbackResponse {
  request_id: OpaqueId;
  success: true;
  data: {
    feedback_id: OpaqueId;
    accepted: true;
  };
  error: null;
}
export interface QualitySignalsRequest {
  /**
   * @minItems 1
   */
  signals: [QualitySignal, ...QualitySignal[]];
}
export interface QualitySignal {
  signal_id: OpaqueId;
  signal_type: QualitySignalType;
  occurred_at: DateTime;
  request_id: OpaqueId;
  message_id?: OpaqueId;
  expo_id: OpaqueId;
  payload: QualitySignalPayload;
}
export interface QualitySignalPayload {
  reason?: FeedbackReason;
  target?: FeedbackTarget;
  raw_query?: string;
  normalized_query?: string;
  result_count?: number;
  confidence?: number;
  issue_class?:
    | 'NO_KNOWLEDGE'
    | 'LOW_RETRIEVAL'
    | 'AMBIGUOUS_ENTITY'
    | 'CONFLICT'
    | 'OUTDATED'
    | 'BAD_ANSWER'
    | 'USER_UNRESOLVED';
}
export interface QualitySignalsResponse {
  accepted: number;
}
export interface EventsBatchRequest {
  /**
   * @minItems 1
   */
  events: [BehaviorEvent, ...BehaviorEvent[]];
}
export interface BehaviorEvent {
  event_id: OpaqueId;
  event_type: BehaviorEventType;
  occurred_at: DateTime;
  request_id: OpaqueId;
  message_id?: OpaqueId;
  entity?: {
    type: EntityType;
    id: OpaqueId;
  };
  props?: BehaviorEventProps;
}
export interface BehaviorEventProps {
  position?: number;
  surface?: string;
  booth_id?: OpaqueId;
  map_shape_id?: OpaqueId;
  citation_id?: OpaqueId;
  error_code?: ErrorCode;
  cancel_reason?: string;
}
export interface EventsBatchResponse {
  request_id: OpaqueId;
  success: true;
  data: {
    accepted: number;
  };
  error: null;
}
export interface MessageStartEvent {
  event: 'message.start';
  data: {
    request_id: OpaqueId;
    conversation_id: OpaqueId;
    message_id: OpaqueId;
    protocol_version: '1.0.0';
  };
}
export interface StatusUpdateEvent {
  event: 'status.update';
  data: {
    request_id: OpaqueId;
    stage: 'understanding' | 'searching' | 'reranking' | 'answering';
    display_text: string;
  };
}
export interface MessageDeltaEvent {
  event: 'message.delta';
  data: {
    request_id: OpaqueId;
    message_id: OpaqueId;
    delta: string;
  };
}
export interface EntityCardEvent {
  event: 'entity.card';
  data: {
    request_id: OpaqueId;
    message_id: OpaqueId;
    card: EntityCard;
  };
}
export interface CitationEvent {
  event: 'citation';
  data: {
    request_id: OpaqueId;
    message_id: OpaqueId;
    citation: Citation;
  };
}
export interface SuggestionListEvent {
  event: 'suggestion.list';
  data: {
    request_id: OpaqueId;
    message_id: OpaqueId;
    /**
     * @maxItems 4
     */
    items:
      | []
      | [
          {
            id: OpaqueId;
            text: string;
          },
        ]
      | [
          {
            id: OpaqueId;
            text: string;
          },
          {
            id: OpaqueId;
            text: string;
          },
        ]
      | [
          {
            id: OpaqueId;
            text: string;
          },
          {
            id: OpaqueId;
            text: string;
          },
          {
            id: OpaqueId;
            text: string;
          },
        ]
      | [
          {
            id: OpaqueId;
            text: string;
          },
          {
            id: OpaqueId;
            text: string;
          },
          {
            id: OpaqueId;
            text: string;
          },
          {
            id: OpaqueId;
            text: string;
          },
        ];
  };
}
export interface MessageDoneEvent {
  event: 'message.done';
  data: {
    request_id: OpaqueId;
    conversation_id: OpaqueId;
    message_id: OpaqueId;
    answer_status: AnswerStatus;
    intent: Intent;
    search_route:
      | 'exact'
      | 'lexical'
      | 'fuzzy'
      | 'semantic'
      | 'hybrid'
      | 'retrieve'
      | 'none';
    confidence: 'high' | 'medium' | 'low';
    latency_ms: number;
    versions: PublicVersions;
  };
}
export interface MessageErrorEvent {
  event: 'message.error';
  data: {
    request_id: OpaqueId;
    message_id: OpaqueId;
    error: PublicError;
  };
}
export interface PublicError {
  code: ErrorCode;
  message: string;
  user_message: string;
  retryable: boolean;
  details?: null;
}
export interface PublicErrorEnvelope {
  request_id: OpaqueId;
  success: false;
  data: null;
  error: PublicError;
  meta?: ApiMeta;
}
export interface InternalErrorEnvelope {
  request_id: OpaqueId;
  success: false;
  data: null;
  error: InternalError;
  meta?: ApiMeta;
}
export interface InternalError {
  code: ErrorCode;
  message: string;
  user_message: string;
  retryable: boolean;
  details?: null;
  trace_id: string;
}

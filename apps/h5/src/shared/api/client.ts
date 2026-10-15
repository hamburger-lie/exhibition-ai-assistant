import type { CitationData, EntityCardData } from '../../features/cards/card-types.js';

const BASE_URL =
  (import.meta.env.VITE_BFF_BASE_URL as string | undefined) ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    userMessage: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = retryable;
  }
}

interface Envelope<T> {
  request_id: string;
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    user_message: string;
    retryable: boolean;
  } | null;
}

async function requestEnvelope<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<{ data: T; requestId: string }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body = (await response.json()) as Envelope<T>;

  if (!response.ok || !body.success || body.data === null) {
    const error = body.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'request failed',
      error?.user_message ?? '出现了一点问题，请稍后重试。',
      error?.retryable ?? true,
    );
  }

  return { data: body.data, requestId: body.request_id };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const { data } = await requestEnvelope<T>(path, init, token);
  return data;
}

export interface SessionData {
  session_id: string;
  anonymous_user_id: string;
  session_token: string;
  expires_at: string;
  default_conversation_id: string;
}

export function createSession(payload: {
  expo_id: string;
  source: 'wechat_miniprogram_webview' | 'direct_h5' | 'qr_code' | 'other';
}): Promise<SessionData> {
  return request<SessionData>('/session', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
}

export interface ConfigData {
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
}

export function getConfig(
  expoId: string,
  token: string,
): Promise<ConfigData> {
  return request<ConfigData>(
    `/config?expo_id=${encodeURIComponent(expoId)}`,
    { method: 'GET' },
    token,
  );
}

export interface PublicChatRequestPayload {
  conversation_id: string;
  message: string;
  context: {
    expo_id: string;
    locale?: string;
    current_hall_id?: string | null;
    selected_entity_ids?: string[];
  };
  client?: {
    message_id?: string;
    supports?: string[];
  };
}

export interface PublicChatData {
  conversation_id: string;
  message_id: string;
  answer: string;
  answer_status: string;
  cards: EntityCardData[];
  citations: CitationData[];
  suggestions: string[];
}

export interface StreamChatResult {
  status: number;
  body: ReadableStream<Uint8Array> | null;
  errorEnvelope?: {
    error: {
      code: string;
      message: string;
      user_message: string;
      retryable: boolean;
    };
  };
}

/** E03: POST /chat/stream, consumed via fetch + ReadableStream (not EventSource). */
export async function streamChat(
  payload: PublicChatRequestPayload,
  token: string,
  signal: AbortSignal,
): Promise<StreamChatResult> {
  const response = await fetch(`${BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (response.status !== 200) {
    const errorEnvelope = (await response.json().catch(() => undefined)) as
      | StreamChatResult['errorEnvelope']
      | undefined;
    return {
      status: response.status,
      body: null,
      ...(errorEnvelope ? { errorEnvelope } : {}),
    };
  }

  return { status: response.status, body: response.body };
}

/** E04: non-stream fallback used when streaming is unavailable. */
export function chatFallback(
  payload: PublicChatRequestPayload,
  token: string,
): Promise<{ data: PublicChatData; requestId: string }> {
  return requestEnvelope<PublicChatData>(
    '/chat',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export type EntityDetailType = 'exhibitor' | 'product' | 'event';

export interface EntityHall {
  id: string;
  name: string;
}

export interface EntityBooth {
  booth_id: string;
  display_code: string;
  map_shape_id?: string;
}

/** 与 chat.schema.json 的 ExhibitorEntity / ProductEntity / EventEntity 对应。 */
export interface EntityDetailData {
  entity_type: EntityDetailType;
  entity: {
    id: string;
    name?: string;
    title?: string;
    aliases?: string[];
    brands?: string[];
    brand?: string;
    category?: string;
    functions?: string[];
    exhibitor_id?: string;
    hall?: EntityHall;
    booths?: EntityBooth[];
    categories?: string[];
    tags?: string[];
    description?: string;
    status?: string;
    start_at?: string;
    end_at?: string;
    venue?: string;
    speakers?: string[];
  };
}

/** E07：按结构化 ID 获取权威实体详情。 */
export function getEntityDetail(
  entityType: EntityDetailType,
  entityId: string,
  expoId: string,
  token: string,
): Promise<EntityDetailData> {
  return request<EntityDetailData>(
    `/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?expo_id=${encodeURIComponent(expoId)}`,
    { method: 'GET' },
    token,
  );
}

export type FeedbackReason =
  | 'irrelevant'
  | 'wrong_information'
  | 'outdated_information'
  | 'not_found'
  | 'not_resolved'
  | 'bad_recommendation'
  | 'other';

export interface FeedbackRequestPayload {
  feedback_id: string;
  request_id: string;
  conversation_id: string;
  message_id: string;
  rating: 'positive' | 'negative';
  reason?: FeedbackReason;
  comment?: string;
}

export interface FeedbackResponseData {
  feedback_id: string;
  accepted: true;
}

/** E05: submits a thumbs up/down; feedback_id is the client idempotency key. */
export function submitFeedback(
  payload: FeedbackRequestPayload,
  token: string,
): Promise<FeedbackResponseData> {
  return request<FeedbackResponseData>(
    '/feedback',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

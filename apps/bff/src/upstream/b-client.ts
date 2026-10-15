import type { BClientConfig } from '../config/runtime-config.js';

export interface AgentRequestPayload {
  request_id: string;
  conversation_id: string;
  query: string;
  expo_id: string;
  locale: string;
  context?: {
    current_hall_id?: string | null;
    selected_entity_ids?: string[];
  };
  options?: {
    include_citations?: boolean;
    include_suggestions?: boolean;
    include_internal_trace?: boolean;
  };
}

export interface UpstreamJsonError {
  request_id?: string;
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    user_message: string;
    retryable: boolean;
    trace_id?: string;
  };
}

export interface StreamAgentResult {
  status: number;
  headers: Headers;
  /** Present only when status === 200. */
  body: ReadableStream<Uint8Array> | null;
  /** Present only when status !== 200 (pre-stream failure). */
  errorBody?: Record<string, unknown>;
}

export interface CallAgentResult {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

function buildHeaders(
  config: BClientConfig,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(config.serviceToken
      ? { authorization: `Bearer ${config.serviceToken}` }
      : {}),
    ...extra,
  };
}

/** Calls I01 (internal streaming Agent) and returns the raw fetch response parts. */
export async function streamAgent(
  config: BClientConfig,
  payload: AgentRequestPayload,
  signal: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<StreamAgentResult> {
  const response = await fetch(`${config.baseUrl}/internal/v1/agent/stream`, {
    method: 'POST',
    headers: buildHeaders(config, extraHeaders),
    body: JSON.stringify(payload),
    signal,
  });

  if (response.status !== 200) {
    const errorBody = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return {
      status: response.status,
      headers: response.headers,
      body: null,
      errorBody,
    };
  }

  return { status: response.status, headers: response.headers, body: response.body };
}

/** Calls I02 (internal non-stream Agent). */
export async function callAgent(
  config: BClientConfig,
  payload: AgentRequestPayload,
  signal: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<CallAgentResult> {
  const response = await fetch(`${config.baseUrl}/internal/v1/agent`, {
    method: 'POST',
    headers: buildHeaders(config, extraHeaders),
    body: JSON.stringify(payload),
    signal,
  });

  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { status: response.status, body, headers: response.headers };
}

export interface QualitySignal {
  signal_id: string;
  signal_type: string;
  occurred_at: string;
  request_id: string;
  message_id?: string;
  expo_id: string;
  payload?: Record<string, unknown>;
}

/**
 * Calls I06 (async quality signals). Callers must treat a rejected/failed
 * call as best-effort: feedback (E05) always succeeds toward the browser
 * regardless of this outcome, falling back to an outbox for retry.
 */
export async function submitQualitySignals(
  config: BClientConfig,
  signals: QualitySignal[],
  signal: AbortSignal,
): Promise<{ status: number }> {
  const response = await fetch(`${config.baseUrl}/internal/v1/quality/signals`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ signals }),
    signal,
  });
  return { status: response.status };
}

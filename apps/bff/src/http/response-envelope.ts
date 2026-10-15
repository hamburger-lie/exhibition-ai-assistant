import type { FastifyReply } from 'fastify';

export interface ApiMeta {
  api_version: 'v1';
  server_time: string;
}

export interface PublicError {
  code: string;
  message: string;
  user_message: string;
  retryable: boolean;
  details: null;
}

function buildMeta(): ApiMeta {
  return { api_version: 'v1', server_time: new Date().toISOString() };
}

export function publicError(
  code: string,
  message: string,
  userMessage: string,
  retryable = false,
): PublicError {
  return {
    code,
    message,
    user_message: userMessage,
    retryable,
    details: null,
  };
}

const ERROR_CODE_STATUS: Record<string, number> = {
  INVALID_ARGUMENT: 400,
  SESSION_EXPIRED: 401,
  EXPO_NOT_FOUND: 404,
  ENTITY_NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SEARCH_TIMEOUT: 504,
  RETRIEVE_TIMEOUT: 504,
  AI_UPSTREAM_TIMEOUT: 504,
  KNOWLEDGE_UNAVAILABLE: 503,
  UPSTREAM_UNAVAILABLE: 503,
  STREAM_INTERRUPTED: 502,
  INTERNAL_ERROR: 500,
};

/** Maps a public ErrorCode to the HTTP status declared for it in openapi-public-v1.yaml. */
export function mapErrorCodeToStatus(code: string): number {
  return ERROR_CODE_STATUS[code] ?? 500;
}

/** Unified success envelope: request_id/success/data/error/meta. */
export function sendSuccess<T>(
  reply: FastifyReply,
  statusCode: number,
  requestId: string,
  data: T,
): FastifyReply {
  return reply.code(statusCode).send({
    request_id: requestId,
    success: true,
    data,
    error: null,
    meta: buildMeta(),
  });
}

/** Unified error envelope; never carries internal trace/prompt/model fields. */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  requestId: string,
  error: PublicError,
): FastifyReply {
  reply.log.warn(
    { error_code: error.code, status_code: statusCode },
    error.message,
  );
  return reply.code(statusCode).send({
    request_id: requestId,
    success: false,
    data: null,
    error,
    meta: buildMeta(),
  });
}

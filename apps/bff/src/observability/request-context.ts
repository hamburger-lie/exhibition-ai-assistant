import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import { generateTraceId } from './logger.js';

const REQUEST_ID_HEADER = 'x-request-id';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    /** Internal-only correlation id; never echoed to the client. */
    traceId: string;
  }
}

export function generateRequestId(): string {
  return `req_${randomUUID()}`;
}

/**
 * Reuses an incoming X-Request-Id when the caller supplies one so client and
 * server logs correlate across retries; otherwise mints a fresh id. Always
 * echoes the resolved id back on the response. Also mints an internal-only
 * trace_id and binds both onto a child logger so every log line for this
 * request carries request_id/trace_id without each call site repeating it.
 */
export function registerRequestContext(app: FastifyInstance): void {
  app.decorateRequest('requestId', '');
  app.decorateRequest('traceId', '');

  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && incoming.trim().length > 0
        ? incoming.trim()
        : generateRequestId();
    const traceId = generateTraceId();

    request.requestId = requestId;
    request.traceId = traceId;
    request.log = request.log.child({ request_id: requestId, trace_id: traceId });
    reply.header('X-Request-Id', requestId);
  });
}

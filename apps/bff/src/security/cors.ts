import type { FastifyInstance } from 'fastify';

const ALLOWED_METHODS = 'GET,POST,OPTIONS';
const ALLOWED_HEADERS =
  'Content-Type, Authorization, X-Request-Id, X-Protocol-Version';

/** Origin allowlist only; no wildcard, no reflection of unknown origins. */
export function registerCors(
  app: FastifyInstance,
  allowedOrigins: string[],
): void {
  const allowSet = new Set(allowedOrigins);

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && allowSet.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
    }

    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Methods', ALLOWED_METHODS);
      reply.header('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      await reply.code(204).send();
    }
  });
}

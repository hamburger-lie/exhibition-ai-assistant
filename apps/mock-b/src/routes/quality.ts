import type { FastifyInstance } from 'fastify';

// No fixture covers I06; the mock only needs to accept a well-formed
// QualitySignalsRequest and echo back a fixed representative
// QualitySignalsResponse (202), matching feedback.schema.json.

type QualitySignalsRequestBody = {
  signals?: unknown[];
};

export function registerQualityRoutes(app: FastifyInstance): void {
  app.post('/internal/v1/quality/signals', async (request, reply) => {
    const body = request.body as QualitySignalsRequestBody | undefined;
    const accepted = Array.isArray(body?.signals) ? body.signals.length : 0;

    return reply.code(202).send({ accepted });
  });
}

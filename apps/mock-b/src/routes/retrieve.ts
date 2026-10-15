import type { FastifyInstance } from 'fastify';

import { getScenario, loadFixtureJson } from '../fixtures.js';
import { overrideScenarioId } from '../scenario-select.js';

type RetrieveRequestBody = {
  request_id?: string;
};

// Only one retrieve fixture exists (retrieve-no-knowledge.json); the override
// header/query is still honored so future fixtures or BFF tests can target a
// specific scenario id explicitly.
const DEFAULT_SCENARIO_ID = 'retrieve-no-knowledge';

export function registerRetrieveRoutes(app: FastifyInstance): void {
  app.post('/internal/v1/retrieve', async (request, reply) => {
    const body = request.body as RetrieveRequestBody | undefined;
    const override = overrideScenarioId(
      request.headers as Record<string, unknown>,
      request.query as Record<string, unknown> | undefined,
    );
    const scenario = await getScenario(override ?? DEFAULT_SCENARIO_ID);
    const responseBody = await loadFixtureJson(scenario.file);

    reply.code(scenario.transport.http_status);
    for (const [name, value] of Object.entries(
      scenario.transport.response_headers ?? {},
    )) {
      reply.header(name, value);
    }
    return reply.send({
      ...responseBody,
      request_id: body?.request_id ?? responseBody.request_id,
    });
  });
}

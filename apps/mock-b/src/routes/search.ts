import type { FastifyInstance } from 'fastify';

import { getScenario, loadFixtureJson } from '../fixtures.js';
import {
  overrideScenarioId,
  pickSearchScenarioId,
} from '../scenario-select.js';

type SearchRequestBody = {
  request_id?: string;
  query?: string;
};

export function registerSearchRoutes(app: FastifyInstance): void {
  app.post('/internal/v1/search', async (request, reply) => {
    const body = request.body as SearchRequestBody | undefined;
    const query = typeof body?.query === 'string' ? body.query : '';
    const override = overrideScenarioId(
      request.headers as Record<string, unknown>,
      request.query as Record<string, unknown> | undefined,
    );
    const scenarioId = pickSearchScenarioId(query, override);
    const scenario = await getScenario(scenarioId);
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

import type { FastifyInstance } from 'fastify';

// No fixtures cover I07/I08; these are fixed representative responses
// validated against HealthResponse / VersionResponse in chat.schema.json.

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/internal/v1/health', async (_request, reply) => {
    return reply.code(200).send({
      status: 'ok',
      dependencies: {
        database: 'ok',
        search: 'ok',
        vector_store: 'ok',
        llm: 'ok',
      },
    });
  });

  app.get('/internal/v1/version', async (_request, reply) => {
    return reply.code(200).send({
      service: 'mock-b',
      service_version: '0.0.0-mock',
      search_version: 'search_mock_1',
      kb_version: 'kb_mock_1',
      prompt_version: 'prompt_mock_1',
      model_version: 'model_mock_1',
      index_versions: {
        entities: 'entities_mock_1',
        documents: 'documents_mock_1',
      },
    });
  });
}

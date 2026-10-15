import type { FastifyInstance } from 'fastify';

// No fixture covers I05 (packages/test-fixtures/manifest.json has none for
// entities/resolve). This synthesizes a minimal, fixed representative
// response for each resolution outcome instead of real entity resolution
// logic, validated against ResolveResponse in chat.schema.json.

type ResolveRequestBody = {
  mention?: string;
  entity_types?: string[];
};

export function registerResolveRoutes(app: FastifyInstance): void {
  app.post('/internal/v1/entities/resolve', async (request, reply) => {
    const body = request.body as ResolveRequestBody | undefined;
    const mention = typeof body?.mention === 'string' ? body.mention : '';
    const entityType = body?.entity_types?.[0] ?? 'exhibitor';

    if (/(多个|哪个|歧义)/.test(mention)) {
      return reply.code(200).send({
        resolution: 'ambiguous',
        normalized_mention: mention,
        candidates: [
          { entity_type: entityType, entity_id: 'exhibitor_huayan', confidence: 0.62 },
          { entity_type: entityType, entity_id: 'exhibitor_mock_other', confidence: 0.58 },
        ],
      });
    }

    if (/(找不到|未找到|不存在)/.test(mention)) {
      return reply.code(200).send({
        resolution: 'not_found',
        normalized_mention: mention,
        candidates: [],
      });
    }

    return reply.code(200).send({
      resolution: 'unique',
      normalized_mention: mention || 'exhibitor_huayan',
      candidates: [
        { entity_type: entityType, entity_id: 'exhibitor_huayan', confidence: 0.95 },
      ],
    });
  });
}

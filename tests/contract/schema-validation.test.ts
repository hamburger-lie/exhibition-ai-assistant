import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const contractsDirectory = path.join(root, 'packages', 'contracts');
const schemaDirectory = path.join(contractsDirectory, 'schemas');

function runRedocly(arguments_: string[]): string {
  return execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules', '@redocly', 'cli', 'bin', 'cli.js'),
      ...arguments_,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, REDOCLY_TELEMETRY: 'off' },
    },
  );
}

const { schemas: schemaFiles } = JSON.parse(
  await readFile(
    path.join(contractsDirectory, 'schemas.manifest.json'),
    'utf8',
  ),
) as { schemas: string[] };

async function loadJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(path.join(schemaDirectory, file), 'utf8'),
  ) as Record<string, unknown>;
}

async function createAjv(): Promise<Ajv2020> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const file of schemaFiles) {
    ajv.addSchema(await loadJson(file));
  }

  return ajv;
}

describe('JSON Schema contract', () => {
  test('Ajv 2020 loads every schema and resolves cross-file references', async () => {
    const ajv = await createAjv();

    for (const file of schemaFiles) {
      const schema = await loadJson(file);
      expect(ajv.getSchema(String(schema.$id))).toBeTypeOf('function');
    }

    expect(
      ajv.getSchema(
        'https://assistant.example/schemas/chat.schema.json#/$defs/PublicChatRequest',
      ),
    ).toBeTypeOf('function');
    expect(
      ajv.getSchema(
        'https://assistant.example/schemas/events.schema.json#/$defs/MessageDeltaEvent',
      ),
    ).toBeTypeOf('function');
  });

  test('rejects an SSE event without request_id', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/events.schema.json#/$defs/MessageStartEvent',
    );

    expect(
      validate?.({
        event: 'message.start',
        data: {
          conversation_id: 'c_1',
          message_id: 'm_1',
          protocol_version: '1.0.0',
        },
      }),
    ).toBe(false);
  });

  test('rejects an unsupported search_mode enum value', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/SearchRequest',
    );

    expect(
      validate?.({
        request_id: 'r_1',
        expo_id: 'expo_1',
        query: '抗衰 OEM',
        entity_types: ['exhibitor'],
        search_mode: 'vector_only',
      }),
    ).toBe(false);
  });

  test('message.delta accepts data.delta and rejects data.text', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/events.schema.json#/$defs/MessageDeltaEvent',
    );

    expect(
      validate?.({
        event: 'message.delta',
        data: { request_id: 'r_1', message_id: 'm_1', delta: '你好' },
      }),
    ).toBe(true);
    expect(
      validate?.({
        event: 'message.delta',
        data: { request_id: 'r_1', message_id: 'm_1', text: '你好' },
      }),
    ).toBe(false);
  });

  test('accepts internal Agent trace without allowing it in the public chat response', async () => {
    const ajv = await createAjv();
    const publicData = {
      conversation_id: 'c_1',
      message_id: 'm_1',
      answer: '已找到相关展商。',
      answer_status: 'answered',
      cards: [],
      citations: [],
      suggestions: [],
    };
    const internalValidate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/InternalAgentResponse',
    );
    const publicValidate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/PublicChatResponse',
    );

    expect(
      internalValidate?.({
        ...publicData,
        internal_trace: { route: 'hybrid' },
      }),
    ).toBe(true);
    expect(
      publicValidate?.({
        request_id: 'r_1',
        success: true,
        data: { ...publicData, internal_trace: { route: 'hybrid' } },
        error: null,
      }),
    ).toBe(false);
  });

  test('rejects sensitive internal keys in public error details', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/error.schema.json#/$defs/PublicError',
    );

    for (const key of [
      'internal_trace',
      'prompt',
      'model',
      'api_key',
      'stack',
    ]) {
      expect(
        validate?.({
          code: 'INTERNAL_ERROR',
          message: 'request failed',
          user_message: '服务暂时不可用。',
          retryable: false,
          details: { [key]: 'secret' },
        }),
      ).toBe(false);
    }
  });

  test('E07 uses a closed discriminated entity union', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/EntityDetailsResponse',
    );

    expect(
      validate?.({
        request_id: 'r_1',
        success: true,
        data: { entity_type: 'exhibitor', entity: {} },
        error: null,
      }),
    ).toBe(false);
    expect(
      validate?.({
        request_id: 'r_1',
        success: true,
        data: {
          entity_type: 'exhibitor',
          entity: {
            id: 'ex_1',
            name: '示例生物科技',
            hall: { id: 'hall_demo', name: '5.2馆' },
            booths: [
              {
                booth_id: 'booth_C18',
                display_code: 'C18',
                map_shape_id: 'shape_C18',
              },
            ],
            status: 'published',
          },
        },
        error: null,
      }),
    ).toBe(true);
  });

  test('I03 rejects empty result and versions objects', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/SearchResponse',
    );
    const base = {
      request_id: 'r_1',
      route: 'hybrid',
      normalized_query: '胶原蛋白 OEM 厂家',
      detected_entities: [],
      trace: null,
    };

    expect(
      validate?.({
        ...base,
        results: [{}],
        versions: { search: 's_1', index: 'i_1' },
      }),
    ).toBe(false);
    expect(validate?.({ ...base, results: [], versions: {} })).toBe(false);
  });

  test('I03 validates closed filters and a complete trace', async () => {
    const ajv = await createAjv();
    const requestValidate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/SearchRequest',
    );
    const responseValidate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/SearchResponse',
    );

    expect(
      requestValidate?.({
        request_id: 'r_1',
        expo_id: 'expo_1',
        query: '胶原蛋白 OEM 厂家',
        entity_types: ['exhibitor'],
        search_mode: 'hybrid',
        filters: {
          hall_ids: [],
          categories: [],
          tags: [],
          status: ['published'],
          extra: true,
        },
      }),
    ).toBe(false);
    expect(
      responseValidate?.({
        request_id: 'r_1',
        route: 'hybrid',
        normalized_query: '胶原蛋白 OEM 厂家',
        detected_entities: [
          { type: 'category', value: '胶原蛋白', confidence: 0.98 },
        ],
        results: [
          {
            rank: 1,
            entity_type: 'exhibitor',
            entity_id: 'ex_1',
            final_score: 0.93,
            relevance_grade: 'high',
            matched_fields: ['categories'],
            highlights: ['胶原蛋白'],
            entity: {
              name: '示例生物科技',
              hall_id: 'hall_demo',
              booth_ids: ['booth_C18'],
            },
          },
        ],
        trace: {
          normalization: {
            raw: '胶元蛋白 OEM 厂家',
            normalized: '胶原蛋白 OEM 厂家',
            corrections: [
              { from: '胶元蛋白', to: '胶原蛋白', source: 'dictionary' },
            ],
          },
          exact: { count: 0, top_ids: [] },
          lexical: { count: 20, top_ids: ['ex_1'] },
          semantic: { count: 20, top_ids: ['ex_1'] },
          fusion: { method: 'rrf', candidate_count: 31 },
          rerank: { input_count: 31, output_count: 10, model: '<internal>' },
          elapsed_ms: {
            total: 184,
            exact: 8,
            lexical: 42,
            semantic: 55,
            rerank: 71,
          },
        },
        versions: { search: 'search_1.4.0', index: 'idx_1' },
      }),
    ).toBe(true);
  });

  test('I03 binds entity_type to its matching result entity summary', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/SearchResult',
    );

    expect(
      validate?.({
        rank: 1,
        entity_type: 'exhibitor',
        entity_id: 'ex_1',
        final_score: 0.9,
        relevance_grade: 'high',
        matched_fields: ['title'],
        highlights: ['论坛'],
        entity: { title: 'AI 论坛' },
      }),
    ).toBe(false);
  });

  test('I03 trace records only executed branches and permits an unspecified fusion method', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/chat.schema.json#/$defs/SearchTrace',
    );
    const normalization = {
      raw: '胶元蛋白 OEM',
      normalized: '胶原蛋白 OEM',
      corrections: [{ from: '胶元蛋白', to: '胶原蛋白', source: 'dictionary' }],
    };

    expect(
      validate?.({
        normalization,
        lexical: { count: 20, top_ids: ['ex_1'] },
        semantic: { count: 20, top_ids: ['ex_2'] },
        fusion: { method: 'rank_fusion_v2', candidate_count: 31 },
        elapsed_ms: { total: 120, lexical: 40, semantic: 50 },
      }),
    ).toBe(true);
    expect(
      validate?.({
        normalization,
        exact: { count: 1, top_ids: ['ex_1'] },
        elapsed_ms: { total: 8, exact: 8 },
      }),
    ).toBe(true);
    expect(
      validate?.({
        normalization,
        exact: {},
        elapsed_ms: { total: 8, exact: 8 },
      }),
    ).toBe(false);
  });

  test('binds each card type to its matching payload schema', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/card.schema.json#/$defs/EntityCard',
    );

    expect(
      validate?.({
        card_id: 'card_1',
        type: 'exhibitor',
        entity_id: 'ex_1',
        title: '错误错配',
        actions: [],
        payload: {
          event_id: 'event_1',
          title: 'AI 论坛',
          start_at: '2026-09-04T10:00:00+08:00',
          end_at: '2026-09-04T11:00:00+08:00',
          venue: '5.2馆',
          status: 'scheduled',
        },
      }),
    ).toBe(false);
  });

  test('root common and error schemas accept unambiguous public values', async () => {
    const ajv = await createAjv();
    const commonValidate = ajv.getSchema(
      'https://assistant.example/schemas/common.schema.json',
    );
    const errorValidate = ajv.getSchema(
      'https://assistant.example/schemas/error.schema.json',
    );

    expect(commonValidate?.({ kb: 'kb_1', search: 'search_1' })).toBe(true);
    expect(
      errorValidate?.({
        code: 'INVALID_ARGUMENT',
        message: 'invalid',
        user_message: '参数错误。',
        retryable: false,
      }),
    ).toBe(true);
  });

  test('type generation preserves external $ref source identity', async () => {
    const { validateSchemaReferences } =
      await import('../../packages/contracts/scripts/schema-references.js');
    const schemas = new Map<string, unknown>([
      [
        'uses.schema.json',
        {
          $defs: {
            UsesOpaqueId: {
              $ref: 'wrong.schema.json#/$defs/OpaqueId',
            },
          },
        },
      ],
      [
        'common.schema.json',
        {
          $defs: {
            OpaqueId: { type: 'string' },
          },
        },
      ],
    ]);

    expect(() => validateSchemaReferences(schemas)).toThrow(
      /wrong\.schema\.json/,
    );

    schemas.set('uses.schema.json', {
      $defs: {
        UsesOpaqueId: {
          $ref: 'common.schema.json#/$defs/MissingOpaqueId',
        },
      },
    });
    expect(() => validateSchemaReferences(schemas)).toThrow(/目标不存在/);
  });
});

describe('OpenAPI contract', () => {
  test('publishes E01-E07 on the public surface and I01-I08 internally', async () => {
    const publicDocument = yaml.load(
      await readFile(
        path.join(contractsDirectory, 'openapi-public-v1.yaml'),
        'utf8',
      ),
    ) as { paths: Record<string, unknown> };
    const internalDocument = yaml.load(
      await readFile(
        path.join(contractsDirectory, 'openapi-internal-v1.yaml'),
        'utf8',
      ),
    ) as { paths: Record<string, unknown> };

    expect(Object.keys(publicDocument.paths).sort()).toEqual(
      [
        '/api/v1/chat',
        '/api/v1/chat/stream',
        '/api/v1/config',
        '/api/v1/entities/{entity_type}/{entity_id}',
        '/api/v1/events/batch',
        '/api/v1/feedback',
        '/api/v1/session',
      ].sort(),
    );
    expect(Object.keys(internalDocument.paths).sort()).toEqual(
      [
        '/internal/v1/agent',
        '/internal/v1/agent/stream',
        '/internal/v1/entities/resolve',
        '/internal/v1/health',
        '/internal/v1/quality/signals',
        '/internal/v1/retrieve',
        '/internal/v1/search',
        '/internal/v1/version',
      ].sort(),
    );
  });

  test('public OpenAPI describes POST SSE and does not expose internal trace fields', async () => {
    const source = await readFile(
      path.join(contractsDirectory, 'openapi-public-v1.yaml'),
      'utf8',
    );
    const document = yaml.load(source) as {
      paths: Record<
        string,
        {
          post?: {
            responses?: Record<string, { content?: Record<string, unknown> }>;
          };
        }
      >;
    };

    expect(document.paths['/api/v1/chat/stream']?.post).toBeDefined();
    expect(
      document.paths['/api/v1/chat/stream']?.post?.responses?.['200']
        ?.content?.['text/event-stream'],
    ).toBeDefined();
    expect(source).not.toMatch(
      /internal_trace|trace_id|prompt_version|model_version/,
    );
  });

  test('operations declare applicable concrete error responses instead of default only', async () => {
    const publicDocument = yaml.load(
      await readFile(
        path.join(contractsDirectory, 'openapi-public-v1.yaml'),
        'utf8',
      ),
    ) as {
      paths: Record<
        string,
        Record<string, { responses: Record<string, unknown> }>
      >;
    };
    const internalDocument = yaml.load(
      await readFile(
        path.join(contractsDirectory, 'openapi-internal-v1.yaml'),
        'utf8',
      ),
    ) as {
      paths: Record<
        string,
        Record<string, { responses: Record<string, unknown> }>
      >;
    };

    const publicChatResponses =
      publicDocument.paths['/api/v1/chat/stream']?.post?.responses;
    expect(Object.keys(publicChatResponses ?? {})).toEqual(
      expect.arrayContaining([
        '400',
        '401',
        '403',
        '404',
        '409',
        '422',
        '429',
        '500',
        '502',
        '503',
        '504',
      ]),
    );
    expect(publicChatResponses).not.toHaveProperty('default');

    const internalSearchResponses =
      internalDocument.paths['/internal/v1/search']?.post?.responses;
    expect(Object.keys(internalSearchResponses ?? {})).toEqual(
      expect.arrayContaining([
        '400',
        '401',
        '403',
        '404',
        '422',
        '500',
        '503',
        '504',
      ]),
    );
    expect(internalSearchResponses).not.toHaveProperty('default');

    for (const document of [publicDocument, internalDocument]) {
      for (const pathItem of Object.values(document.paths)) {
        for (const operation of Object.values(pathItem)) {
          expect(operation.responses).not.toHaveProperty('default');
        }
      }
    }
  });

  test('fully validates and dereferences both OpenAPI 3.1 documents', async () => {
    const publicPath = path.join(contractsDirectory, 'openapi-public-v1.yaml');
    const internalPath = path.join(
      contractsDirectory,
      'openapi-internal-v1.yaml',
    );
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'assistant-openapi-'),
    );

    try {
      expect(() =>
        runRedocly([
          'lint',
          publicPath,
          internalPath,
          '--config',
          path.join(contractsDirectory, 'redocly.yaml'),
        ]),
      ).not.toThrow();

      for (const [source, output] of [
        [publicPath, path.join(temporaryDirectory, 'public.json')],
        [internalPath, path.join(temporaryDirectory, 'internal.json')],
      ]) {
        expect(() =>
          runRedocly([
            'bundle',
            source,
            '--dereferenced',
            '--output',
            output,
            '--config',
            path.join(contractsDirectory, 'redocly.yaml'),
          ]),
        ).not.toThrow();
        expect((await readFile(output, 'utf8')).length).toBeGreaterThan(0);
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test('OpenAPI validation rejects invalid operations and unresolved references', async () => {
    const invalidOperation = {
      openapi: '3.1.0',
      info: { title: 'invalid', version: '1.0.0' },
      paths: { '/invalid': { get: { operationId: 'invalid' } } },
    };
    const invalidReference = {
      openapi: '3.1.0',
      info: { title: 'invalid ref', version: '1.0.0' },
      paths: {
        '/invalid': {
          get: {
            operationId: 'invalidRef',
            responses: {
              '200': { $ref: '#/components/responses/Missing' },
            },
          },
        },
      },
    };
    const invalidResponse = {
      openapi: '3.1.0',
      info: { title: 'invalid response', version: '1.0.0' },
      paths: {
        '/invalid': {
          get: {
            operationId: 'invalidResponse',
            summary: 'Invalid response',
            responses: { '200': { content: {} } },
          },
        },
      },
    };

    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'assistant-invalid-openapi-'),
    );

    try {
      const operationPath = path.join(
        temporaryDirectory,
        'invalid-operation.json',
      );
      const referencePath = path.join(
        temporaryDirectory,
        'invalid-reference.json',
      );
      const responsePath = path.join(
        temporaryDirectory,
        'invalid-response.json',
      );
      await writeFile(operationPath, JSON.stringify(invalidOperation), 'utf8');
      await writeFile(referencePath, JSON.stringify(invalidReference), 'utf8');
      await writeFile(responsePath, JSON.stringify(invalidResponse), 'utf8');

      for (const invalidPath of [operationPath, responsePath, referencePath]) {
        expect(() =>
          runRedocly([
            'lint',
            invalidPath,
            '--config',
            path.join(contractsDirectory, 'redocly.yaml'),
          ]),
        ).toThrow();
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test('internal production transport is HTTPS and documented before local development HTTP', async () => {
    const document = yaml.load(
      await readFile(
        path.join(contractsDirectory, 'openapi-internal-v1.yaml'),
        'utf8',
      ),
    ) as {
      info: { description?: string };
      servers: Array<{ url: string; description?: string }>;
      components: {
        securitySchemes: { serviceBearer: { description?: string } };
      };
    };

    expect(document.servers[0]?.url).toMatch(/^https:\/\//);
    expect(document.servers[1]?.url).toBe('http://localhost:8000');
    expect(
      `${document.info.description ?? ''} ${document.components.securitySchemes.serviceBearer.description ?? ''}`,
    ).toMatch(/TLS|mTLS/);
    expect(
      `${document.info.description ?? ''} ${document.components.securitySchemes.serviceBearer.description ?? ''}`,
    ).toMatch(/明文/);
  });
});

describe('generated TypeScript contract', () => {
  test('contains generated types without explicit any', async () => {
    const generated = await readFile(
      path.join(root, 'packages', 'generated-types', 'src', 'index.ts'),
      'utf8',
    );

    expect(generated).toContain('export interface PublicChatRequest');
    for (const typeName of [
      'QualitySignalsRequest',
      'QualitySignalsResponse',
      'FeedbackRequest',
      'EntityCard',
      'SearchRequest',
      'SearchResponse',
    ]) {
      expect(generated).toMatch(
        new RegExp(`export (?:interface|type) ${typeName}\\b`),
      );
    }
    const feedbackStart = generated.indexOf('export type FeedbackRequest');
    const feedbackEnd = generated.indexOf('export type FeedbackReason');
    expect(generated.slice(feedbackStart, feedbackEnd)).not.toMatch(
      /\[k: string\]: unknown/,
    );
    const cardStart = generated.indexOf('export type EntityCard');
    const cardEnd = generated.indexOf('export type EntityType');
    expect(generated.slice(cardStart, cardEnd)).not.toMatch(
      /\[k: string\]: unknown/,
    );
    const searchStart = generated.indexOf('export interface SearchRequest');
    const searchEnd = generated.indexOf('export interface RetrieveRequest');
    expect(generated.slice(searchStart, searchEnd)).not.toMatch(
      /\[k: string\]: unknown/,
    );
    expect(generated).not.toMatch(/\bany\b/);
    expect(generated).not.toMatch(/\[k: string\]: unknown/);
  });

  test('passes positive and negative TypeScript contract probes', () => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
    const arguments_ =
      process.platform === 'win32'
        ? [
            '/d',
            '/s',
            '/c',
            'pnpm exec tsc --project tests/contract/type-probes/tsconfig.json',
          ]
        : [
            'exec',
            'tsc',
            '--project',
            'tests/contract/type-probes/tsconfig.json',
          ];
    expect(() =>
      execFileSync(command, arguments_, {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});

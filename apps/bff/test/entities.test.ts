import path from 'node:path';
import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, test } from 'vitest';

import {
  AUTH_HEADERS,
  buildTestApp,
  testConfig as baseConfig,
} from './helpers/app.js';

const root = process.cwd();
const contractsDir = path.join(root, 'packages', 'contracts');

function contractValidator(ref: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const manifest = JSON.parse(
    readFileSync(path.join(contractsDir, 'schemas.manifest.json'), 'utf8'),
  ) as { schemas: string[] };
  for (const file of manifest.schemas) {
    ajv.addSchema(
      JSON.parse(readFileSync(path.join(contractsDir, 'schemas', file), 'utf8')),
    );
  }
  const validate = ajv.getSchema(ref);
  if (!validate) throw new Error(`unknown schema ref ${ref}`);
  return validate;
}

const validateEntityResponse = contractValidator(
  'https://assistant.example/schemas/chat.schema.json#/$defs/EntityDetailsResponse',
);


function testConfig(overrides: Partial<Record<string, string>> = {}) {
  return baseConfig({ BFF_ENTITY_DETAIL_PROVIDER: 'fixture', ...overrides });
}

const EXPO = 'expo_demo_2026_spring';

describe('E07 GET /api/v1/entities/{entity_type}/{entity_id}', () => {
  test.each([
    ['exhibitor', 'exhibitor_huayan', '华研生物科技'],
    ['product', 'product_collagen_serum', '胶原焕颜精华'],
    ['event', 'event_ai_forum', 'AI赋能美业论坛'],
  ])(
    'returns a schema-valid %s detail',
    async (entityType, entityId, expectedName) => {
      const app = buildTestApp(testConfig());

      const response = await app.inject({ headers: AUTH_HEADERS,
        method: 'GET',
        url: `/api/v1/entities/${entityType}/${entityId}?expo_id=${EXPO}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(
        validateEntityResponse(body),
        JSON.stringify(validateEntityResponse.errors),
      ).toBe(true);
      expect(body.data.entity_type).toBe(entityType);
      expect(body.data.entity.id).toBe(entityId);
      expect(JSON.stringify(body.data.entity)).toContain(expectedName);
    },
  );

  test('entity ids stay linked to the SSE card fixtures', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: `/api/v1/entities/exhibitor/exhibitor_huayan?expo_id=${EXPO}`,
    });

    // 与 chat-stream-exhibitor.sse 的卡片使用同一套结构化 ID。
    expect(response.json().data.entity.booths[0]).toMatchObject({
      booth_id: 'booth_demo_C18',
      display_code: 'C18',
      map_shape_id: 'shape_demo_C18',
    });
  });

  test('returns a locatable guide-map exhibitor keyed by hall booth number', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      headers: AUTH_HEADERS,
      method: 'GET',
      url: `/api/v1/entities/exhibitor/exhibitor_guide_b91_H06A?expo_id=${EXPO}`,
    });

    expect(response.statusCode).toBe(200);
    expect(
      validateEntityResponse(response.json()),
      JSON.stringify(validateEntityResponse.errors),
    ).toBe(true);
    expect(response.json().data.entity).toMatchObject({
      id: 'exhibitor_guide_b91_H06A',
      name: '丽本',
      hall: { id: 'hall_b91', name: '9.1馆' },
      booths: [
        {
          booth_id: 'booth_b91_H06A',
          display_code: 'H06A',
          map_shape_id: 'shape_b91_H06A',
        },
      ],
    });
  });

  test('returns ENTITY_NOT_FOUND for an unknown entity id', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: `/api/v1/entities/exhibitor/exhibitor_does_not_exist?expo_id=${EXPO}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('ENTITY_NOT_FOUND');
  });

  test('returns ENTITY_NOT_FOUND when the id exists under a different type', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: `/api/v1/entities/product/exhibitor_huayan?expo_id=${EXPO}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('ENTITY_NOT_FOUND');
  });

  test('rejects an unsupported entity_type with INVALID_ARGUMENT', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: `/api/v1/entities/booth/booth_demo_C18?expo_id=${EXPO}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });

  test('requires expo_id', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: '/api/v1/entities/exhibitor/exhibitor_huayan',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });

  test('hard-filters an old expo instead of returning current-edition data', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: '/api/v1/entities/exhibitor/exhibitor_huayan?expo_id=expo_demo_2025_spring',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('EXPO_NOT_FOUND');
  });

  test('returns UPSTREAM_UNAVAILABLE when no provider is configured, never a fabricated entity', async () => {
    const app = buildTestApp(testConfig({ BFF_ENTITY_DETAIL_PROVIDER: 'none' }));

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: `/api/v1/entities/exhibitor/exhibitor_huayan?expo_id=${EXPO}`,
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.data).toBeNull();
    expect(body.error.retryable).toBe(true);
    // 不得夹带任何实体内容。
    expect(JSON.stringify(body)).not.toContain('华研生物');
  });

  test('never leaks internal details in the public error envelope', async () => {
    const app = buildTestApp(testConfig({ BFF_ENTITY_DETAIL_PROVIDER: 'none' }));

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'GET',
      url: `/api/v1/entities/exhibitor/exhibitor_huayan?expo_id=${EXPO}`,
    });

    expect(response.json().error.details).toBeNull();
    expect(Object.keys(response.json().error).sort()).toEqual(
      ['code', 'details', 'message', 'retryable', 'user_message'].sort(),
    );
  });
});

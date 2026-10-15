import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, test, vi } from 'vitest';

import { buildServer } from '../src/server.js';
import { parseSse } from '../src/fixtures.js';

const root = process.cwd();
const contractsDirectory = path.join(root, 'packages', 'contracts');

async function json(file: string) {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}

async function ajvWithContracts() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const manifest = (await json(
    path.join(contractsDirectory, 'schemas.manifest.json'),
  )) as unknown as { schemas: string[] };
  for (const file of manifest.schemas) {
    ajv.addSchema(await json(path.join(contractsDirectory, 'schemas', file)));
  }
  return ajv;
}

function schemaRef(defs: string): string {
  return `https://assistant.example/schemas/${defs}`;
}

describe('mock-b internal routes (I01-I08)', () => {
  test('I07 health returns a schema-valid HealthResponse', async () => {
    const ajv = await ajvWithContracts();
    const validate = ajv.getSchema(
      schemaRef('chat.schema.json#/$defs/HealthResponse'),
    )!;
    const app = buildServer();

    const response = await app.inject({
      method: 'GET',
      url: '/internal/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  });

  test('I08 version returns a schema-valid VersionResponse', async () => {
    const ajv = await ajvWithContracts();
    const validate = ajv.getSchema(
      schemaRef('chat.schema.json#/$defs/VersionResponse'),
    )!;
    const app = buildServer();

    const response = await app.inject({
      method: 'GET',
      url: '/internal/v1/version',
    });

    expect(response.statusCode).toBe(200);
    expect(
      validate(response.json()),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  test('I06 quality signals accepts a batch and returns 202 with accepted count', async () => {
    const ajv = await ajvWithContracts();
    const requestValidate = ajv.getSchema(
      schemaRef('feedback.schema.json#/$defs/QualitySignalsRequest'),
    )!;
    const responseValidate = ajv.getSchema(
      schemaRef('feedback.schema.json#/$defs/QualitySignalsResponse'),
    )!;
    const app = buildServer();

    const requestBody = {
      signals: [
        {
          signal_id: 'signal_1',
          signal_type: 'negative_feedback',
          occurred_at: '2026-08-24T10:00:00+08:00',
          request_id: 'req_1',
          expo_id: 'expo_1',
          payload: { reason: 'irrelevant' },
        },
      ],
    };
    expect(requestValidate(requestBody), JSON.stringify(requestValidate.errors)).toBe(
      true,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/internal/v1/quality/signals',
      payload: requestBody,
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(responseValidate(body), JSON.stringify(responseValidate.errors)).toBe(
      true,
    );
    expect(body.accepted).toBe(1);
  });

  test('I05 resolve synthesizes unique, ambiguous, and not_found ResolveResponses', async () => {
    const ajv = await ajvWithContracts();
    const validate = ajv.getSchema(
      schemaRef('chat.schema.json#/$defs/ResolveResponse'),
    )!;
    const app = buildServer();

    const cases: Array<[string, string]> = [
      ['华研生物', 'unique'],
      ['多个候选展商', 'ambiguous'],
      ['找不到的展商', 'not_found'],
    ];
    for (const [mention, resolution] of cases) {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/entities/resolve',
        payload: {
          request_id: 'req_1',
          expo_id: 'expo_1',
          mention,
          entity_types: ['exhibitor'],
          strict: false,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(body.resolution).toBe(resolution);
    }
  });

  test('I04 retrieve returns the retrieve-no-knowledge fixture', async () => {
    const ajv = await ajvWithContracts();
    const validate = ajv.getSchema(
      schemaRef('chat.schema.json#/$defs/RetrieveResponse'),
    )!;
    const fixture = await json(
      path.join(root, 'packages', 'test-fixtures', 'retrieve-no-knowledge.json'),
    );
    const app = buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/v1/retrieve',
      payload: {
        request_id: 'req_1',
        expo_id: 'expo_1',
        query: '任意问题',
        scope: ['faq'],
        mode: 'hybrid',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    expect(body.chunks).toEqual(fixture.chunks);
  });

  test('I03 search selects exact/fuzzy/hybrid fixtures by keyword and honors the override header', async () => {
    const ajv = await ajvWithContracts();
    const validate = ajv.getSchema(
      schemaRef('chat.schema.json#/$defs/SearchResponse'),
    )!;
    const app = buildServer();

    const byKeyword: Array<[string, string]> = [
      ['精确查找展商', 'exact'],
      ['模糊搜索一下', 'fuzzy'],
      ['混合检索胶原蛋白', 'hybrid'],
      ['随便问问', 'hybrid'],
    ];
    for (const [query, expectedRoute] of byKeyword) {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/search',
        payload: {
          request_id: 'req_1',
          expo_id: 'expo_1',
          query,
          entity_types: ['exhibitor'],
          search_mode: 'auto',
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(body.route).toBe(expectedRoute);
    }

    const overrideResponse = await app.inject({
      method: 'POST',
      url: '/internal/v1/search',
      headers: { 'x-scenario-id': 'search-exact' },
      payload: {
        request_id: 'req_1',
        expo_id: 'expo_1',
        query: '混合检索胶原蛋白',
        entity_types: ['exhibitor'],
        search_mode: 'auto',
      },
    });
    expect(overrideResponse.json().route).toBe('exact');
  });

  test('I02 non-stream agent returns a schema-valid InternalAgentResponse', async () => {
    const ajv = await ajvWithContracts();
    const validate = ajv.getSchema(
      schemaRef('chat.schema.json#/$defs/InternalAgentResponse'),
    )!;
    const app = buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/v1/agent',
      payload: {
        request_id: 'req_1',
        conversation_id: 'conv_1',
        query: '这个展商找不到，不知道',
        expo_id: 'expo_1',
        locale: 'zh-CN',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    expect(body.answer_status).toBe('abstain');
  });

  test('I02 shares I01 pre-stream failure scenarios (e.g. 503) for a genuinely failing upstream', async () => {
    const app = buildServer();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/v1/agent',
      payload: {
        request_id: 'req_1',
        conversation_id: 'conv_1',
        query: '服务不可用测试',
        expo_id: 'expo_1',
        locale: 'zh-CN',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  describe('I01 agent/stream', () => {
    test('defaults to chat-exhibitor and streams a complete SSE sequence', async () => {
      const ajv = await ajvWithContracts();
      const eventValidate = ajv.getSchema(
        schemaRef('events.schema.json#/$defs/SseEvent'),
      )!;
      const app = buildServer();

      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '随便问问',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      const frames = parseSse(response.payload);
      expect(frames[0]?.event).toBe('message.start');
      expect(frames.at(-1)?.event).toBe('message.done');
      for (const frame of frames) {
        expect(
          eventValidate(frame),
          `${frame.event}: ${JSON.stringify(eventValidate.errors)}`,
        ).toBe(true);
      }
    });

    test('streams a guide-map exhibitor card when the query names a hall-map brand', async () => {
      const app = buildServer();
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '丽本在哪个展位',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      const frames = parseSse(response.payload);
      const card = frames.find((frame) => frame.event === 'entity.card');
      const payload = (card?.data.card as { title?: string; payload?: { booths?: unknown } })
        ?? {};
      expect(payload.title).toBe('丽本');
      expect(payload.payload?.booths).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            display_code: 'H06A',
            map_shape_id: 'shape_b91_H06A',
          }),
        ]),
      );
    });

    test('selects chat-booth via keyword and includes a booth entity.card', async () => {
      const app = buildServer();
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '这个展位在哪里',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      const frames = parseSse(response.payload);
      const card = frames.find((frame) => frame.event === 'entity.card');
      expect((card?.data.card as Record<string, unknown>)?.type).toBe(
        'booth',
      );
    });

    test('chat-interrupted cuts off after 2 events with no terminal event', async () => {
      const app = buildServer();
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '连接中断了',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      const frames = parseSse(response.payload);
      expect(frames).toHaveLength(2);
      expect(frames.some((frame) => frame.event === 'message.done')).toBe(
        false,
      );
      expect(frames.some((frame) => frame.event === 'message.error')).toBe(
        false,
      );
    });

    test('chat-unknown-event streams debug.trace through alongside known events', async () => {
      const app = buildServer();
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        headers: { 'x-scenario-id': 'chat-unknown-event' },
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '任意',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      const frames = parseSse(response.payload);
      expect(frames.map((frame) => frame.event)).toEqual([
        'message.start',
        'debug.trace',
        'message.delta',
        'message.done',
      ]);
    });

    test('chat-error terminates the stream with a message.error event', async () => {
      const app = buildServer();
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '出错了，故障',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      const frames = parseSse(response.payload);
      expect(frames.at(-1)?.event).toBe('message.error');
    });

    test('http-429 fails before any SSE event with Retry-After and InternalErrorEnvelope', async () => {
      const ajv = await ajvWithContracts();
      const validate = ajv.getSchema(
        schemaRef('error.schema.json#/$defs/InternalErrorEnvelope'),
      )!;
      const app = buildServer();

      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '限流一下试试',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('2');
      expect(response.headers['content-type']).toMatch(/application\/json/);
      const body = response.json();
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    test('http-503 fails before any SSE event with Retry-After', async () => {
      const app = buildServer();
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        headers: { 'x-scenario-id': 'http-503' },
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '任意',
          expo_id: 'expo_1',
          locale: 'zh-CN',
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.headers['retry-after']).toBe('5');
      const body = response.json();
      expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(body.error.trace_id).toBeTypeOf('string');
    });

    test('initial-timeout delays past 30s before returning a 504 timeout error', async () => {
      vi.useFakeTimers();
      try {
        const app = buildServer();
        const responsePromise = app.inject({
          method: 'POST',
          url: '/internal/v1/agent/stream',
          headers: { 'x-scenario-id': 'initial-timeout' },
          payload: {
            request_id: 'req_1',
            conversation_id: 'conv_1',
            query: '任意',
            expo_id: 'expo_1',
            locale: 'zh-CN',
          },
        });
        await vi.advanceTimersByTimeAsync(30_001);
        const response = await responsePromise;

        expect(response.statusCode).toBe(504);
        const body = response.json();
        expect(body.error.code).toBe('AI_UPSTREAM_TIMEOUT');
      } finally {
        vi.useRealTimers();
      }
    });

    test('old-expo hard-filters via override with 404 and EXPO_NOT_FOUND', async () => {
      const app = buildServer();
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/agent/stream',
        headers: { 'x-scenario-id': 'old-expo' },
        payload: {
          request_id: 'req_1',
          conversation_id: 'conv_1',
          query: '任意',
          expo_id: 'expo_demo_2025_spring',
          locale: 'zh-CN',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('EXPO_NOT_FOUND');
    });
  });
});

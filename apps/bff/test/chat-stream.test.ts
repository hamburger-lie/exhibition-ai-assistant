process.env.DATABASE_URL ??=
  'postgresql://postgres:assistant_dev_password@127.0.0.1:55532/assistant_dev?schema=public';

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { buildServer as buildMockBServer } from '../../mock-b/src/server.js';
import { disconnectPrismaClient } from '../src/persistence/client.js';
import { clearChatIdempotency } from '../src/services/message-idempotency.js';
import {
  AUTH_HEADERS,
  buildTestApp,
  testConfig as baseConfig,
} from './helpers/app.js';

const mockB = buildMockBServer();
let mockBBaseUrl = '';

function testConfig(overrides: Partial<Record<string, string>> = {}) {
  return baseConfig({ B_SERVICE_BASE_URL: mockBBaseUrl, ...overrides });
}

beforeAll(async () => {
  await mockB.listen({ host: '127.0.0.1', port: 0 });
  const address = mockB.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('mock-b did not bind to a TCP port');
  }
  mockBBaseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await mockB.close();
  await disconnectPrismaClient();
});


const validPayload = {
  conversation_id: 'conv_1',
  message: '找展商',
  context: { expo_id: 'expo_demo_2026_spring' },
};

beforeEach(async () => {
  await clearChatIdempotency();
});

describe('E03 POST /api/v1/chat/stream', () => {
  test('API-01: a repeated client.message_id replays the cached terminal stream instead of calling upstream again', async () => {
    const app = buildTestApp(testConfig());
    const clientMessageId = `client_msg_${randomUUID()}`;
    const payload = {
      ...validPayload,
      client: { message_id: clientMessageId },
    };

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'chat-exhibitor' },
      payload,
    });
    // A second call with a DIFFERENT scenario header: if idempotency works,
    // this header is never consulted because upstream is never called again.
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'chat-booth' },
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const secondEvents = (second.body.match(/^event: (.+)$/gm) ?? []).map((line) =>
      line.replace('event: ', ''),
    );
    expect(secondEvents.at(-1)).toBe('message.done');
    expect(second.body).toContain('华研生物'); // chat-exhibitor's answer, not chat-booth's
  });

  test('proxies a full scenario, ending with message.done', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'chat-exhibitor' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    const events = response.body.match(/^event: (.+)$/gm) ?? [];
    expect(events.map((line) => line.replace('event: ', ''))).toEqual([
      'message.start',
      'status.update',
      'message.delta',
      'entity.card',
      'citation',
      'suggestion.list',
      'message.done',
    ]);
  });

  test('drops unknown events but forwards known ones in order', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'chat-unknown-event' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('debug.trace');
    const events = (response.body.match(/^event: (.+)$/gm) ?? []).map((line) =>
      line.replace('event: ', ''),
    );
    expect(events).toEqual(['message.start', 'message.delta', 'message.done']);
  });

  test('ends without a terminal event when the upstream connection drops mid-stream', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'chat-interrupted' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    const events = (response.body.match(/^event: (.+)$/gm) ?? []).map((line) =>
      line.replace('event: ', ''),
    );
    expect(events).toHaveLength(2);
    expect(events).not.toContain('message.done');
    expect(events).not.toContain('message.error');
  });

  test('forwards a legitimate mid-stream message.error as the terminal event', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'chat-error' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    const events = (response.body.match(/^event: (.+)$/gm) ?? []).map((line) =>
      line.replace('event: ', ''),
    );
    expect(events.at(-1)).toBe('message.error');
  });

  test('maps a pre-stream 503 from upstream to a public UPSTREAM_UNAVAILABLE envelope', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'http-503' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).not.toContain('text/event-stream');
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  test('maps a pre-stream 429 from upstream to a public RATE_LIMITED envelope', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'http-429' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('RATE_LIMITED');
    // 规格 §6：429 的恢复要「按 Retry-After」，上游给的值必须透传给浏览器。
    expect(response.headers['retry-after']).toBe('2');
  });

  test('rejects a request missing required fields with INVALID_ARGUMENT', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: AUTH_HEADERS,
      payload: { message: '你好' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });
});

describe('E03 pre-stream retry', () => {
  let stub: Server;
  let stubBaseUrl = '';
  let receivedRequestIds: string[] = [];

  afterEach(async () => {
    await new Promise<void>((resolve) => stub.close(() => resolve()));
  });

  test('retries once with the same request_id before giving up', async () => {
    receivedRequestIds = [];
    let callCount = 0;

    stub = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString('utf8');
      });
      req.on('end', () => {
        callCount += 1;
        const parsed = JSON.parse(raw) as { request_id: string };
        receivedRequestIds.push(parsed.request_id);

        if (callCount === 1) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              data: null,
              error: {
                code: 'UPSTREAM_UNAVAILABLE',
                message: 'first attempt fails',
                user_message: '服务暂时不可用。',
                retryable: true,
              },
            }),
          );
          return;
        }

        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
        });
        res.write(
          'event: message.start\ndata: {"request_id":"r","conversation_id":"c","message_id":"m","protocol_version":"1.0.0"}\n\n',
        );
        res.write(
          'event: message.done\ndata: {"request_id":"r","conversation_id":"c","message_id":"m","answer_status":"answered","intent":"faq_query","search_route":"none","confidence":"high","latency_ms":1,"versions":{"kb":"k","search":"s"}}\n\n',
        );
        res.end();
      });
    });

    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const address = stub.address();
    if (!address || typeof address === 'string') {
      throw new Error('stub did not bind to a TCP port');
    }
    stubBaseUrl = `http://127.0.0.1:${address.port}`;

    const app = buildTestApp(testConfig({ B_SERVICE_BASE_URL: stubBaseUrl }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-request-id': 'req_retry_fixed' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(callCount).toBe(2);
    expect(receivedRequestIds).toEqual(['req_retry_fixed', 'req_retry_fixed']);
  });
});

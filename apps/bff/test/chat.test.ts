process.env.DATABASE_URL ??=
  'postgresql://postgres:assistant_dev_password@127.0.0.1:55532/assistant_dev?schema=public';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { buildServer as buildMockBServer } from '../../mock-b/src/server.js';
import { disconnectPrismaClient, getPrismaClient } from '../src/persistence/client.js';
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

beforeEach(async () => {
  await clearChatIdempotency();
});


describe('E04 POST /api/v1/chat', () => {
  test('returns a non-stream fallback answer without leaking internal_trace', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/chat',
      payload: {
        conversation_id: 'conv_1',
        message: '找展商',
        context: { expo_id: 'expo_demo_2026_spring' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.conversation_id).toEqual(expect.any(String));
    expect(body.data.message_id).toEqual(expect.any(String));
    expect(body.data.answer).toEqual(expect.any(String));
    expect(Array.isArray(body.data.cards)).toBe(true);
    expect(Array.isArray(body.data.citations)).toBe(true);
    expect(body.data.versions).toEqual({ kb: 'kb_mock_1', search: 'search_mock_1' });
    expect(body.data.internal_trace).toBeUndefined();
  });

  test('API-01: a repeated client.message_id only generates one answer', async () => {
    const app = buildTestApp(testConfig());
    const clientMessageId = `client_msg_${randomUUID()}`;
    const payload = {
      conversation_id: 'conv_1',
      message: '找展商',
      context: { expo_id: 'expo_demo_2026_spring' },
      client: { message_id: clientMessageId },
    };

    const first = await app.inject({ headers: AUTH_HEADERS, method: 'POST', url: '/api/v1/chat', payload });
    const second = await app.inject({ headers: AUTH_HEADERS, method: 'POST', url: '/api/v1/chat', payload });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    // Mock B mints a fresh message_id per call; an identical id on replay
    // proves the second request never reached upstream again.
    expect(second.json().data.message_id).toBe(first.json().data.message_id);
    expect(second.json().data.answer).toBe(first.json().data.answer);
  });

  test('API-01: the idempotency record is persisted, not held in process memory', async () => {
    const app = buildTestApp(testConfig());
    const clientMessageId = `client_msg_${randomUUID()}`;

    await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/chat',
      payload: {
        conversation_id: 'conv_1',
        message: '找展商',
        context: { expo_id: 'expo_demo_2026_spring' },
        client: { message_id: clientMessageId },
      },
    });

    const row = await getPrismaClient().chatIdempotency.findUnique({
      where: { clientMessageId },
    });
    expect(row?.status).toBe('completed');
    expect(row?.result).toMatchObject({ answerStatus: expect.any(String) });
  });

  test('API-01: E03 and E04 share one idempotency rule across endpoints', async () => {
    const app = buildTestApp(testConfig());
    const clientMessageId = `client_msg_${randomUUID()}`;
    const body = {
      conversation_id: 'conv_1',
      message: '找展商',
      context: { expo_id: 'expo_demo_2026_spring' },
      client: { message_id: clientMessageId },
    };

    // 先走非流式生成，再用同一个 client.message_id 请求流式接口。
    const nonStream = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/chat',
      payload: body,
    });
    const stream = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/stream',
      headers: { ...AUTH_HEADERS, 'x-scenario-id': 'chat-exhibitor' },
      payload: body,
    });

    expect(nonStream.statusCode).toBe(200);
    expect(stream.statusCode).toBe(200);
    // 流式端点回放的是 E04 已生成的那一份答案，没有再次调用上游。
    expect(stream.body).toContain(nonStream.json().data.message_id);
    expect(stream.body).toContain('Mock 非流式回答');
    expect(stream.body).not.toContain('华研生物');
    expect((stream.body.match(/^event: (.+)$/gm) ?? []).at(-1)).toBe(
      'event: message.done',
    );
  });

  test('a failed generation releases the slot so a retry can regenerate', async () => {
    // 上游不可达 → 本次生成失败，不应把失败固化成「已生成」。
    const app = buildTestApp(testConfig({ B_SERVICE_BASE_URL: 'http://127.0.0.1:1' }));
    const clientMessageId = `client_msg_${randomUUID()}`;

    const failed = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/chat',
      payload: {
        conversation_id: 'conv_1',
        message: '找展商',
        context: { expo_id: 'expo_demo_2026_spring' },
        client: { message_id: clientMessageId },
      },
    });

    expect(failed.statusCode).toBe(503);
    const row = await getPrismaClient().chatIdempotency.findUnique({
      where: { clientMessageId },
    });
    expect(row).toBeNull();
  });

  test('rejects an empty message', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/chat',
      payload: {
        conversation_id: 'conv_1',
        message: '',
        context: { expo_id: 'expo_demo_2026_spring' },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });
});

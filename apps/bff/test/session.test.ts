import { describe, expect, test } from 'vitest';

import { buildApp } from '../src/app.js';
import { InMemoryRateLimitStore } from '../src/stores/rate-limit-store.js';
import {
  InMemorySessionStore,
  newSessionRecord,
  newSessionToken,
  type SessionStore,
} from '../src/stores/session-store.js';
import { StoreUnavailableError } from '../src/stores/store-errors.js';
import { buildTestApp, testConfig } from './helpers/app.js';

/** 每次调用都失败的 store，用于验证「失败关闭」。 */
class BrokenSessionStore implements SessionStore {
  readonly name = 'broken';
  async save(): Promise<void> {
    throw new StoreUnavailableError('session save');
  }
  async find(): Promise<never> {
    throw new StoreUnavailableError('session lookup');
  }
  async close(): Promise<void> {}
}

function appWithSessionStore(sessionStore: SessionStore) {
  const rateLimitStore = new InMemoryRateLimitStore();
  return buildApp(testConfig(), {
    sessionStore,
    rateLimitStore,
    close: async () => {
      await sessionStore.close();
      await rateLimitStore.close();
    },
  });
}

describe('E01 POST /api/v1/session', () => {
  test('creates an anonymous session, a short-lived token and a default conversation', async () => {
    const store = new InMemorySessionStore();
    const app = appWithSessionStore(store);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2026_spring', source: 'direct_h5' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.data.session_id).toEqual(expect.any(String));
    expect(body.data.anonymous_user_id).toEqual(expect.any(String));
    expect(body.data.session_token).toEqual(expect.any(String));
    expect(body.data.default_conversation_id).toEqual(expect.any(String));
    expect(new Date(body.data.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(body.meta.api_version).toBe('v1');

    // 令牌确实写进了共享存储，而不是只存在于响应里。
    const stored = await store.find(body.data.session_token as string);
    expect(stored).toMatchObject({
      sessionId: body.data.session_id,
      defaultConversationId: body.data.default_conversation_id,
      expoId: 'expo_demo_2026_spring',
    });
  });

  test('reuses X-Request-Id when supplied and echoes it in the envelope', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      headers: { 'x-request-id': 'req_fixed_123' },
      payload: { expo_id: 'expo_demo_2026_spring', source: 'direct_h5' },
    });

    expect(response.headers['x-request-id']).toBe('req_fixed_123');
    expect(response.json().request_id).toBe('req_fixed_123');
  });

  test('generates a request id when none is supplied', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2026_spring', source: 'direct_h5' },
    });

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.json().request_id).toBe(response.headers['x-request-id']);
  });

  test('rejects a request missing required fields with INVALID_ARGUMENT', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { source: 'direct_h5' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });

  test('rejects an unsupported source enum value', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2026_spring', source: 'sms' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });

  test('hard-filters an old expo without falling back to the latest one', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2025_spring', source: 'direct_h5' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('EXPO_NOT_FOUND');
  });

  test('refuses to issue a token it cannot persist', async () => {
    const app = appWithSessionStore(new BrokenSessionStore());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2026_spring', source: 'direct_h5' },
    });

    // 不能签发一个后续无法验证的令牌。
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(response.json().data).toBeNull();
    expect(JSON.stringify(response.json())).not.toContain('sess_');
  });
});

describe('InMemorySessionStore', () => {
  test('round-trips a session record', async () => {
    const store = new InMemorySessionStore();
    const token = newSessionToken();
    const record = newSessionRecord('expo_demo_2026_spring', 3600);

    await store.save(token, record, 3600);

    expect(await store.find(token)).toMatchObject({
      sessionId: record.sessionId,
      expoId: 'expo_demo_2026_spring',
    });
  });

  test('returns undefined for an unknown token', async () => {
    const store = new InMemorySessionStore();
    expect(await store.find('sess_unknown')).toBeUndefined();
  });

  test('treats an expired record as absent', async () => {
    const store = new InMemorySessionStore();
    const token = newSessionToken();
    await store.save(token, newSessionRecord('expo_demo_2026_spring', -1), 1);

    expect(await store.find(token)).toBeUndefined();
  });
});

describe('session guard on protected endpoints', () => {
  const chatPayload = {
    conversation_id: 'conv_1',
    message: '找展商',
    context: { expo_id: 'expo_demo_2026_spring' },
  };

  test('rejects a protected request with no Authorization header', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: chatPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_EXPIRED');
  });

  test('rejects an unknown bearer token', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: { authorization: 'Bearer sess_not_a_real_token' },
      payload: chatPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_EXPIRED');
  });

  test('leaves the public endpoints reachable without a token', async () => {
    const app = buildTestApp();

    const config = await app.inject({
      method: 'GET',
      url: '/api/v1/config?expo_id=expo_demo_2026_spring',
    });
    const session = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2026_spring', source: 'direct_h5' },
    });

    expect(config.statusCode).toBe(200);
    expect(session.statusCode).toBe(201);
  });

  test('fails closed with 503 when the session store is unavailable, never letting the request through', async () => {
    const app = appWithSessionStore(new BrokenSessionStore());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      headers: { authorization: 'Bearer sess_anything' },
      payload: chatPayload,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  test('a freshly issued token immediately works on a protected endpoint', async () => {
    const app = appWithSessionStore(new InMemorySessionStore());

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2026_spring', source: 'direct_h5' },
    });
    const token = created.json().data.session_token as string;

    const guarded = await app.inject({
      method: 'GET',
      url: '/api/v1/entities/exhibitor/exhibitor_huayan?expo_id=expo_demo_2026_spring',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(guarded.statusCode).not.toBe(401);
  });
});

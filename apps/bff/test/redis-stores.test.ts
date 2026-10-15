process.env.REDIS_URL ??= 'redis://127.0.0.1:56379';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadRuntimeConfig } from '../src/config/runtime-config.js';
import {
  createRedisClient,
  RedisRateLimitStore,
  RedisSessionStore,
  waitForRedisReady,
} from '../src/stores/redis-stores.js';
import { newSessionRecord, newSessionToken } from '../src/stores/session-store.js';
import { StoreUnavailableError } from '../src/stores/store-errors.js';

const REDIS_URL = process.env.REDIS_URL as string;

/**
 * 针对真实 Redis 的集成测试。
 *
 * 关键在于验证「跨进程/跨实例共享」：这里用**两套独立的 store 实例 + 独立的
 * Redis 连接**来模拟两个 BFF 实例，A 实例写入的会话必须能被 B 实例读到，
 * 限流配额也必须由两者共用。
 */
const clients: ReturnType<typeof createRedisClient>[] = [];

async function newClient() {
  const client = createRedisClient(REDIS_URL);
  clients.push(client);
  await waitForRedisReady(client);
  return client;
}

beforeAll(async () => {
  // 先确认 Redis 可用；不可用时直接失败，而不是静默跳过。
  const probe = await newClient();
  await probe.ping();
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.quit().catch(() => undefined)));
});

describe('RedisSessionStore', () => {
  test('round-trips a session record through Redis', async () => {
    const store = new RedisSessionStore(await newClient());
    const token = newSessionToken();
    const record = newSessionRecord('expo_demo_2026_spring', 60);

    await store.save(token, record, 60);

    expect(await store.find(token)).toMatchObject({
      sessionId: record.sessionId,
      anonymousUserId: record.anonymousUserId,
      defaultConversationId: record.defaultConversationId,
      expoId: 'expo_demo_2026_spring',
    });
  });

  test('a session written by one instance is readable by another instance', async () => {
    const instanceA = new RedisSessionStore(await newClient());
    const instanceB = new RedisSessionStore(await newClient());
    const token = newSessionToken();

    await instanceA.save(token, newSessionRecord('expo_demo_2026_spring', 60), 60);

    // 实例 B 有独立的连接和对象，只能通过 Redis 拿到这条会话。
    expect(await instanceB.find(token)).toBeDefined();
  });

  test('a session survives dropping and re-creating the client (process restart)', async () => {
    const token = newSessionToken();
    const before = new RedisSessionStore(await newClient());
    await before.save(token, newSessionRecord('expo_demo_2026_spring', 60), 60);
    await before.close();

    // 全新连接 = 新进程；会话状态在 Redis 里，不随进程消失。
    const after = new RedisSessionStore(await newClient());
    expect(await after.find(token)).toBeDefined();
  });

  test('honours the TTL so expired sessions disappear', async () => {
    const store = new RedisSessionStore(await newClient());
    const token = newSessionToken();

    await store.save(token, newSessionRecord('expo_demo_2026_spring', 1), 1);
    expect(await store.find(token)).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await store.find(token)).toBeUndefined();
  });

  test('returns undefined for an unknown token', async () => {
    const store = new RedisSessionStore(await newClient());
    expect(await store.find(`sess_${randomUUID()}`)).toBeUndefined();
  });

  test('raises StoreUnavailableError when Redis cannot be reached', async () => {
    // 指向一个没有监听的端口。
    const broken = createRedisClient('redis://127.0.0.1:1', {
      retryStrategy: () => null,
    });
    // 这条连接注定失败，挂个 handler 免得 ioredis 打出未处理错误噪音。
    broken.on('error', () => undefined);
    clients.push(broken);
    const store = new RedisSessionStore(broken);

    await expect(store.find('sess_whatever')).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
  });
});

describe('RedisRateLimitStore', () => {
  test('shares one quota across two independent instances', async () => {
    const key = `test_${randomUUID()}`;
    const instanceA = new RedisRateLimitStore(await newClient());
    const instanceB = new RedisRateLimitStore(await newClient());

    // 配额为 2：A 用掉一次，B 用掉一次，B 的第二次就该被拒。
    expect((await instanceA.hit(key, 60_000, 2)).allowed).toBe(true);
    expect((await instanceB.hit(key, 60_000, 2)).allowed).toBe(true);

    const blocked = await instanceB.hit(key, 60_000, 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  test('the counter survives a client restart within the window', async () => {
    const key = `test_${randomUUID()}`;
    const before = new RedisRateLimitStore(await newClient());
    await before.hit(key, 60_000, 1);
    await before.close();

    const after = new RedisRateLimitStore(await newClient());
    expect((await after.hit(key, 60_000, 1)).allowed).toBe(false);
  });

  test('the window expires so the quota eventually resets', async () => {
    const key = `test_${randomUUID()}`;
    const store = new RedisRateLimitStore(await newClient());

    expect((await store.hit(key, 800, 1)).allowed).toBe(true);
    expect((await store.hit(key, 800, 1)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect((await store.hit(key, 800, 1)).allowed).toBe(true);
  });

  test('raises StoreUnavailableError when Redis cannot be reached', async () => {
    const broken = createRedisClient('redis://127.0.0.1:1', {
      retryStrategy: () => null,
    });
    broken.on('error', () => undefined);
    clients.push(broken);
    const store = new RedisRateLimitStore(broken);

    await expect(store.hit('k', 1000, 1)).rejects.toBeInstanceOf(
      StoreUnavailableError,
    );
  });
});

describe('two BFF instances backed by the same Redis', () => {
  async function instance(overrides: Partial<Record<string, string>> = {}) {
    const config = loadRuntimeConfig({
      ...process.env,
      BFF_LOG_LEVEL: 'silent',
      BFF_STORE_BACKEND: 'redis',
      REDIS_URL,
      BFF_RATE_LIMIT_MAX: '1000',
      ...overrides,
    });
    const redis = createRedisClient(REDIS_URL);
    clients.push(redis);
    await waitForRedisReady(redis);
    return buildApp(config, {
      sessionStore: new RedisSessionStore(redis),
      rateLimitStore: new RedisRateLimitStore(redis),
      close: async () => undefined,
    });
  }

  test('a token issued by instance A authenticates on instance B', async () => {
    const instanceA = await instance();
    const instanceB = await instance();

    const created = await instanceA.inject({
      method: 'POST',
      url: '/api/v1/session',
      payload: { expo_id: 'expo_demo_2026_spring', source: 'direct_h5' },
    });
    expect(created.statusCode).toBe(201);
    const token = created.json().data.session_token as string;

    const onB = await instanceB.inject({
      method: 'GET',
      url: '/api/v1/entities/exhibitor/exhibitor_huayan?expo_id=expo_demo_2026_spring',
      headers: { authorization: `Bearer ${token}` },
    });

    // 关键：B 实例从未签发过这个 token，只能从共享 Redis 里认出它。
    expect(onB.statusCode).toBe(200);
    expect(onB.json().data.entity.id).toBe('exhibitor_huayan');
  });

  test('rate limiting is shared: the quota spent on A counts against B', async () => {
    // 用同一个 IP（inject 默认 127.0.0.1）和很小的配额。
    const limit = '2';
    const instanceA = await instance({ BFF_RATE_LIMIT_MAX: limit });
    const instanceB = await instance({ BFF_RATE_LIMIT_MAX: limit });
    const url = '/api/v1/config?expo_id=expo_demo_2026_spring';

    // 先把这个 IP 的窗口清掉，避免受其他用例影响。
    const cleanup = await newClient();
    await cleanup.del('assistant:ratelimit:127.0.0.1');

    const a1 = await instanceA.inject({ method: 'GET', url });
    const b1 = await instanceB.inject({ method: 'GET', url });
    const b2 = await instanceB.inject({ method: 'GET', url });

    expect(a1.statusCode).toBe(200);
    expect(b1.statusCode).toBe(200);
    // 第三次命中共享配额上限，即使它打在另一个实例上。
    expect(b2.statusCode).toBe(429);
    expect(b2.headers['retry-after']).toEqual(expect.any(String));
    expect(Number(b2.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(b2.json().error.code).toBe('RATE_LIMITED');

    await cleanup.del('assistant:ratelimit:127.0.0.1');
  });
});

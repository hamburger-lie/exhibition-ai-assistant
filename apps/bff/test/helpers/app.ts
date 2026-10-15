import type { FastifyInstance } from 'fastify';

import { buildApp, type AppStores } from '../../src/app.js';
import {
  loadRuntimeConfig,
  type RuntimeConfig,
} from '../../src/config/runtime-config.js';
import { InMemoryRateLimitStore } from '../../src/stores/rate-limit-store.js';
import {
  InMemorySessionStore,
  type SessionRecord,
  type SessionStore,
} from '../../src/stores/session-store.js';

/** 受保护端点在单元测试里使用的固定会话令牌。 */
export const TEST_TOKEN = 'sess_test_fixed_token';
export const AUTH_HEADERS = { authorization: `Bearer ${TEST_TOKEN}` };

const TEST_SESSION: SessionRecord = {
  sessionId: 'session_test',
  anonymousUserId: 'anon_test',
  defaultConversationId: 'conv_1',
  expoId: 'expo_demo_2026_spring',
  expiresAt: new Date(Date.now() + 3_600_000),
};

/**
 * 预置了一个有效会话的内存 SessionStore，让受保护端点的用例可以同步构建
 * 应用，同时仍然走真实的鉴权中间件（而不是绕过它）。
 */
class SeededSessionStore extends InMemorySessionStore {
  private readonly seeded = new Map<string, SessionRecord>([
    [TEST_TOKEN, TEST_SESSION],
  ]);

  override async find(token: string): Promise<SessionRecord | undefined> {
    return this.seeded.get(token) ?? (await super.find(token));
  }
}

export function testConfig(
  overrides: Partial<Record<string, string>> = {},
): RuntimeConfig {
  return loadRuntimeConfig({
    ...process.env,
    BFF_RATE_LIMIT_MAX: '1000',
    BFF_LOG_LEVEL: 'silent',
    BFF_STORE_BACKEND: 'memory',
    ...overrides,
  });
}

export function buildTestStores(): AppStores {
  const sessionStore: SessionStore = new SeededSessionStore();
  const rateLimitStore = new InMemoryRateLimitStore();
  return {
    sessionStore,
    rateLimitStore,
    close: async () => {
      await sessionStore.close();
      await rateLimitStore.close();
    },
  };
}

/** 构建带有效会话的测试应用；鉴权与限流中间件照常生效。 */
export function buildTestApp(config: RuntimeConfig = testConfig()): FastifyInstance {
  return buildApp(config, buildTestStores());
}

import { Redis, type RedisOptions } from 'ioredis';

import type {
  SessionRecord,
  SessionStore,
} from './session-store.js';
import type { RateLimitDecision, RateLimitStore } from './rate-limit-store.js';
import { StoreUnavailableError } from './store-errors.js';

const SESSION_PREFIX = 'assistant:session:';
const RATE_LIMIT_PREFIX = 'assistant:ratelimit:';

/**
 * 共享一个 ioredis 连接。
 *
 * `maxRetriesPerRequest: 1` + `enableOfflineQueue: false`：Redis 断开时命令
 * 立刻失败而不是无限排队，让上层能马上「失败关闭」，而不是把请求挂死。
 */
export function createRedisClient(url: string, options: RedisOptions = {}): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
    // 生产里由编排层负责拉起 Redis，这里只做有限重连，避免刷屏。
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
    ...options,
  });
}

/**
 * 等待连接就绪。
 *
 * 因为关闭了 offline queue（为了「Redis 挂了立刻失败」而不是把请求挂住），
 * 连接就绪前发命令会直接被拒，所以启动时必须显式等一次 ready。
 */
export async function waitForRedisReady(
  client: Redis,
  timeoutMs = 10_000,
): Promise<void> {
  if (client.status === 'ready') return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new StoreUnavailableError('redis connect'));
    }, timeoutMs);

    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(new StoreUnavailableError('redis connect', error));
    };
    function cleanup() {
      clearTimeout(timer);
      client.off('ready', onReady);
      client.off('error', onError);
    }

    client.once('ready', onReady);
    client.once('error', onError);
  });
}

interface StoredSession {
  sessionId: string;
  anonymousUserId: string;
  defaultConversationId: string;
  expoId: string;
  expiresAt: string;
}

export class RedisSessionStore implements SessionStore {
  readonly name = 'redis';

  constructor(private readonly redis: Redis) {}

  async save(
    token: string,
    record: SessionRecord,
    ttlSeconds: number,
  ): Promise<void> {
    const payload: StoredSession = {
      sessionId: record.sessionId,
      anonymousUserId: record.anonymousUserId,
      defaultConversationId: record.defaultConversationId,
      expoId: record.expoId,
      expiresAt: record.expiresAt.toISOString(),
    };
    try {
      // TTL 交给 Redis：过期由存储层负责，无需额外清理任务。
      await this.redis.set(
        `${SESSION_PREFIX}${token}`,
        JSON.stringify(payload),
        'EX',
        Math.max(1, ttlSeconds),
      );
    } catch (error) {
      throw new StoreUnavailableError('session save', error);
    }
  }

  async find(token: string): Promise<SessionRecord | undefined> {
    let raw: string | null;
    try {
      raw = await this.redis.get(`${SESSION_PREFIX}${token}`);
    } catch (error) {
      throw new StoreUnavailableError('session lookup', error);
    }

    if (!raw) return undefined;

    let parsed: StoredSession;
    try {
      parsed = JSON.parse(raw) as StoredSession;
    } catch {
      return undefined;
    }

    const expiresAt = new Date(parsed.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return undefined;
    }

    return {
      sessionId: parsed.sessionId,
      anonymousUserId: parsed.anonymousUserId,
      defaultConversationId: parsed.defaultConversationId,
      expoId: parsed.expoId,
      expiresAt,
    };
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  readonly name = 'redis';

  constructor(private readonly redis: Redis) {}

  async hit(
    key: string,
    windowMs: number,
    max: number,
  ): Promise<RateLimitDecision> {
    const redisKey = `${RATE_LIMIT_PREFIX}${key}`;
    try {
      // INCR + 首次命中时设窗口 TTL：计数在 Redis 里，多实例共用同一配额。
      const pipeline = this.redis.multi();
      pipeline.incr(redisKey);
      pipeline.pttl(redisKey);
      const results = await pipeline.exec();

      if (!results) {
        throw new Error('redis pipeline returned no result');
      }

      const count = Number(results[0]?.[1] ?? 0);
      let ttlMs = Number(results[1]?.[1] ?? -1);

      if (ttlMs < 0) {
        // 第一次命中（或 TTL 丢失）时补设窗口。
        await this.redis.pexpire(redisKey, windowMs);
        ttlMs = windowMs;
      }

      if (count > max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (error) {
      throw new StoreUnavailableError('rate limit check', error);
    }
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

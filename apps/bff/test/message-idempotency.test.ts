process.env.DATABASE_URL ??=
  'postgresql://postgres:assistant_dev_password@127.0.0.1:55532/assistant_dev?schema=public';

import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';

import { disconnectPrismaClient, getPrismaClient } from '../src/persistence/client.js';
import {
  acquireChatSlot,
  clearChatIdempotency,
  completeChatSlot,
  releaseChatSlot,
  type CachedChatResult,
} from '../src/services/message-idempotency.js';

afterAll(async () => {
  await disconnectPrismaClient();
});

function result(overrides: Partial<CachedChatResult> = {}): CachedChatResult {
  return {
    conversationId: 'conv_1',
    messageId: 'msg_1',
    answer: '第一次生成的答案',
    answerStatus: 'answered',
    cards: [],
    citations: [],
    suggestions: [],
    requestId: 'req_1',
    ...overrides,
  };
}

describe('acquireChatSlot: exactly-once generation (API-01)', () => {
  test('the first caller owns the slot', async () => {
    const key = `client_${randomUUID()}`;
    await expect(acquireChatSlot(key, 'req_1', 1_000)).resolves.toEqual({
      kind: 'owned',
    });
    await clearChatIdempotency(key);
  });

  test('a later caller replays the stored result instead of regenerating', async () => {
    const key = `client_${randomUUID()}`;
    await acquireChatSlot(key, 'req_1', 1_000);
    await completeChatSlot(key, result());

    const second = await acquireChatSlot(key, 'req_2', 1_000);

    expect(second.kind).toBe('replay');
    if (second.kind === 'replay') {
      expect(second.result.answer).toBe('第一次生成的答案');
      expect(second.result.messageId).toBe('msg_1');
    }
    await clearChatIdempotency(key);
  });

  test('replay survives a process restart because state lives in PostgreSQL', async () => {
    const key = `client_${randomUUID()}`;
    await acquireChatSlot(key, 'req_1', 1_000);
    await completeChatSlot(key, result({ answer: '重启前生成的答案' }));

    // 模拟进程重启：断开连接池，后续调用会重新建连，进程内不留任何状态。
    await disconnectPrismaClient();

    const afterRestart = await acquireChatSlot(key, 'req_after_restart', 1_000);
    expect(afterRestart.kind).toBe('replay');
    if (afterRestart.kind === 'replay') {
      expect(afterRestart.result.answer).toBe('重启前生成的答案');
    }
    await clearChatIdempotency(key);
  });

  test('concurrent duplicates elect exactly one owner', async () => {
    const key = `client_${randomUUID()}`;

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        acquireChatSlot(key, `req_${index}`, 300),
      ),
    );

    expect(outcomes.filter((o) => o.kind === 'owned')).toHaveLength(1);
    // 其余请求既没有拿到所有权，也没有拿到结果（持有者还没写入完成态）。
    expect(outcomes.filter((o) => o.kind === 'timeout')).toHaveLength(7);

    const rows = await getPrismaClient().chatIdempotency.findMany({
      where: { clientMessageId: key },
    });
    expect(rows).toHaveLength(1);
    await clearChatIdempotency(key);
  });

  test('a waiter picks up the result once the owner completes', async () => {
    const key = `client_${randomUUID()}`;
    await acquireChatSlot(key, 'req_owner', 1_000);

    // 持有者稍后完成；等待者的预算足够长，应当等到结果并回放。
    setTimeout(() => {
      void completeChatSlot(key, result({ answer: '等待后拿到的答案' }));
    }, 150);

    const waiter = await acquireChatSlot(key, 'req_waiter', 3_000);

    expect(waiter.kind).toBe('replay');
    if (waiter.kind === 'replay') {
      expect(waiter.result.answer).toBe('等待后拿到的答案');
    }
    await clearChatIdempotency(key);
  });
});

describe('lease takeover and release', () => {
  test('an expired lease can be taken over by exactly one caller', async () => {
    const key = `client_${randomUUID()}`;
    await acquireChatSlot(key, 'req_dead_owner', 1_000);

    // 模拟持有者崩溃：把租约改成已过期。
    await getPrismaClient().chatIdempotency.update({
      where: { clientMessageId: key },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });

    const contenders = await Promise.all([
      acquireChatSlot(key, 'req_a', 200),
      acquireChatSlot(key, 'req_b', 200),
      acquireChatSlot(key, 'req_c', 200),
    ]);

    expect(contenders.filter((o) => o.kind === 'owned')).toHaveLength(1);
    await clearChatIdempotency(key);
  });

  test('releasing a failed generation lets a retry regenerate', async () => {
    const key = `client_${randomUUID()}`;
    await acquireChatSlot(key, 'req_1', 1_000);
    await releaseChatSlot(key);

    await expect(acquireChatSlot(key, 'req_2', 1_000)).resolves.toEqual({
      kind: 'owned',
    });
    await clearChatIdempotency(key);
  });

  test('release never discards an already completed result', async () => {
    const key = `client_${randomUUID()}`;
    await acquireChatSlot(key, 'req_1', 1_000);
    await completeChatSlot(key, result());

    await releaseChatSlot(key);

    const outcome = await acquireChatSlot(key, 'req_2', 1_000);
    expect(outcome.kind).toBe('replay');
    await clearChatIdempotency(key);
  });
});

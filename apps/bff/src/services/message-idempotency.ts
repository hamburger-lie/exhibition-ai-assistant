import { Prisma } from '@prisma/client';

import { getPrismaClient } from '../persistence/client.js';

/**
 * API-01：相同 `client.message_id` 只生成一次回答。
 *
 * 实现要点（全部落在 PostgreSQL，因此多实例部署下语义依然成立）：
 *
 * 1. `client_message_id` 上有唯一约束，INSERT 竞争只有一个赢家 → 只有一个
 *    实例会真正调用上游生成。
 * 2. 输的一方读到既有行：已完成就直接回放结果；仍在生成中就有界等待，
 *    等到完成后回放同一份结果。
 * 3. 持有者写入租约 `lease_expires_at`。若持有者进程崩溃/重启，租约到期后
 *    其他实例可通过条件 UPDATE 原子接管（`updateMany` 的 where 里带上
 *    status + 租约条件，只有一个能改到 1 行），不会永久卡死。
 * 4. 生成失败时释放（删除）该行，让用户重试可以重新生成；只有成功终态才
 *    写入 completed。
 */

export interface CachedChatResult {
  conversationId: string;
  messageId: string;
  answer: string;
  answerStatus: string;
  cards: unknown[];
  citations: unknown[];
  suggestions: string[];
  requestId: string;
}

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * 租约时长。必须显著长于一次完整流式回答的耗时，否则可能在流还没结束时
 * 被别的实例接管而重复生成。
 */
export const LEASE_MS = 5 * 60_000;
/** 等待在途生成完成的轮询间隔。 */
const POLL_INTERVAL_MS = 100;

export type AcquireOutcome =
  /** 本次请求取得所有权，应当真正调用上游生成。 */
  | { kind: 'owned' }
  /** 已有完成结果，直接回放，不再调用上游。 */
  | { kind: 'replay'; result: CachedChatResult }
  /** 另一实例仍在生成，且已超过本次请求的等待预算。 */
  | { kind: 'timeout' };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

/** 尝试插入一条 in_progress 记录；成功即代表取得所有权。 */
async function tryInsert(
  clientMessageId: string,
  requestId: string,
): Promise<boolean> {
  try {
    await getPrismaClient().chatIdempotency.create({
      data: {
        clientMessageId,
        requestId,
        status: 'in_progress',
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false;
    }
    throw error;
  }
}

/** 条件接管过期租约；只有改到 1 行的调用方拿到所有权。 */
async function tryTakeOver(
  clientMessageId: string,
  requestId: string,
): Promise<boolean> {
  const { count } = await getPrismaClient().chatIdempotency.updateMany({
    where: {
      clientMessageId,
      status: 'in_progress',
      leaseExpiresAt: { lte: new Date() },
    },
    data: {
      requestId,
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
    },
  });
  return count === 1;
}

export async function acquireChatSlot(
  clientMessageId: string,
  requestId: string,
  waitBudgetMs: number,
): Promise<AcquireOutcome> {
  const deadline = Date.now() + waitBudgetMs;

  for (;;) {
    if (await tryInsert(clientMessageId, requestId)) {
      return { kind: 'owned' };
    }

    const existing = await getPrismaClient().chatIdempotency.findUnique({
      where: { clientMessageId },
    });

    if (!existing) {
      // 竞争窗口内被释放了，重新尝试插入。
      continue;
    }

    if (existing.status === 'completed' && existing.result) {
      return {
        kind: 'replay',
        result: existing.result as unknown as CachedChatResult,
      };
    }

    if (
      existing.status === 'in_progress' &&
      existing.leaseExpiresAt.getTime() <= Date.now() &&
      (await tryTakeOver(clientMessageId, requestId))
    ) {
      return { kind: 'owned' };
    }

    if (Date.now() >= deadline) {
      return { kind: 'timeout' };
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/** 生成成功后写入可回放结果。 */
export async function completeChatSlot(
  clientMessageId: string,
  result: CachedChatResult,
): Promise<void> {
  await getPrismaClient().chatIdempotency.updateMany({
    where: { clientMessageId },
    data: {
      status: 'completed',
      result: result as unknown as Prisma.InputJsonValue,
    },
  });
}

/** 生成失败/中断时释放槽位，让后续重试可以重新生成。 */
export async function releaseChatSlot(clientMessageId: string): Promise<void> {
  await getPrismaClient().chatIdempotency.deleteMany({
    where: { clientMessageId, status: 'in_progress' },
  });
}

/** 测试用：清理指定键，避免用例之间互相影响。 */
export async function clearChatIdempotency(
  clientMessageId?: string,
): Promise<void> {
  await getPrismaClient().chatIdempotency.deleteMany(
    clientMessageId ? { where: { clientMessageId } } : undefined,
  );
}

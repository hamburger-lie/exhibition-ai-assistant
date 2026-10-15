process.env.DATABASE_URL ??=
  'postgresql://postgres:assistant_dev_password@127.0.0.1:55532/assistant_dev?schema=public';

import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, test } from 'vitest';

import { disconnectPrismaClient, getPrismaClient } from '../src/persistence/client.js';
import { createOutboxEntry } from '../src/persistence/repositories.js';
import { processOutboxOnce } from '../src/services/quality-outbox.js';
import type { BClientConfig } from '../src/config/runtime-config.js';

afterAll(async () => {
  await disconnectPrismaClient();
});

let stub: Server | undefined;

afterEach(async () => {
  if (stub) {
    await new Promise<void>((resolve) => stub?.close(() => resolve()));
    stub = undefined;
  }
});

async function startStub(
  handler: (callCount: number) => number,
): Promise<{ config: BClientConfig; callCount: () => number }> {
  let calls = 0;
  stub = createServer((req, res) => {
    calls += 1;
    const status = handler(calls);
    req.resume();
    req.on('end', () => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => stub?.listen(0, '127.0.0.1', resolve));
  const address = stub.address();
  if (!address || typeof address === 'string') {
    throw new Error('stub did not bind to a TCP port');
  }
  return {
    config: {
      baseUrl: `http://127.0.0.1:${address.port}`,
      maxPreStreamAttempts: 1,
      preStreamTimeoutMs: 30_000,
    },
    callCount: () => calls,
  };
}

function newSignalPayload() {
  return {
    signal_id: `signal_${randomUUID()}`,
    signal_type: 'negative_feedback',
    occurred_at: new Date().toISOString(),
    request_id: 'req_1',
    message_id: 'msg_1',
    expo_id: 'expo_demo_2026_spring',
    payload: { reason: 'wrong_information', target: null },
  };
}

describe('processOutboxOnce', () => {
  test('resolves a due entry when I06 accepts it (202)', async () => {
    const { config } = await startStub(() => 202);
    const feedbackId = `feedback_${randomUUID()}`;
    const entry = await createOutboxEntry({
      feedbackId,
      signalType: 'negative_feedback',
      payload: newSignalPayload(),
    });

    const result = await processOutboxOnce(config, 10);

    expect(result.resolved).toBeGreaterThanOrEqual(1);
    const stored = await getPrismaClient().qualitySignalOutbox.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(stored.resolvedAt).not.toBeNull();
  });

  test('records attempts and schedules backoff on failure, keeping the last error', async () => {
    const { config } = await startStub(() => 503);
    const feedbackId = `feedback_${randomUUID()}`;
    const entry = await createOutboxEntry({
      feedbackId,
      signalType: 'negative_feedback',
      payload: newSignalPayload(),
    });

    await processOutboxOnce(config, 10);

    const stored = await getPrismaClient().qualitySignalOutbox.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(stored.resolvedAt).toBeNull();
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toMatch(/503/);
    expect(stored.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('does not pick up an entry whose next_attempt_at is still in the future', async () => {
    const { config, callCount } = await startStub(() => 202);
    const feedbackId = `feedback_${randomUUID()}`;
    const entry = await createOutboxEntry({
      feedbackId,
      signalType: 'negative_feedback',
      payload: newSignalPayload(),
    });
    await getPrismaClient().qualitySignalOutbox.update({
      where: { id: entry.id },
      data: { nextAttemptAt: new Date(Date.now() + 60_000) },
    });

    await processOutboxOnce(config, 10);

    expect(callCount()).toBe(0);
    const stored = await getPrismaClient().qualitySignalOutbox.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(stored.resolvedAt).toBeNull();
  });

  test('parks the entry after exhausting retries, keeping the last error', async () => {
    const { config } = await startStub(() => 503);
    const feedbackId = `feedback_${randomUUID()}`;
    const entry = await createOutboxEntry({
      feedbackId,
      signalType: 'negative_feedback',
      payload: newSignalPayload(),
    });
    // Simulate having already exhausted the retry budget.
    await getPrismaClient().qualitySignalOutbox.update({
      where: { id: entry.id },
      data: { attempts: 4 },
    });

    await processOutboxOnce(config, 10);

    const stored = await getPrismaClient().qualitySignalOutbox.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(stored.attempts).toBe(5);
    expect(stored.resolvedAt).toBeNull();
    expect(stored.lastError).toMatch(/503/);
    expect(stored.nextAttemptAt.getFullYear()).toBeGreaterThan(2100);
  });
});

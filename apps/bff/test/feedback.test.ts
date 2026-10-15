process.env.DATABASE_URL ??=
  'postgresql://postgres:assistant_dev_password@127.0.0.1:55532/assistant_dev?schema=public';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer as buildMockBServer } from '../../mock-b/src/server.js';
import { disconnectPrismaClient } from '../src/persistence/client.js';
import { getPrismaClient } from '../src/persistence/client.js';
import {
  AUTH_HEADERS,
  buildTestApp,
  testConfig as baseConfig,
} from './helpers/app.js';

const mockB = buildMockBServer();
let mockBBaseUrl = '';

function testConfig(baseUrl: string) {
  return baseConfig({ B_SERVICE_BASE_URL: baseUrl });
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


function positivePayload(feedbackId: string) {
  return {
    feedback_id: feedbackId,
    request_id: 'req_1',
    conversation_id: 'conv_1',
    message_id: 'msg_1',
    rating: 'positive',
  };
}

function negativePayload(feedbackId: string, reason = 'wrong_information') {
  return {
    feedback_id: feedbackId,
    request_id: 'req_1',
    conversation_id: 'conv_1',
    message_id: 'msg_1',
    rating: 'negative',
    reason,
  };
}

describe('E05 POST /api/v1/feedback', () => {
  test('accepts positive feedback bound to request_id/message_id', async () => {
    const app = buildTestApp(testConfig(mockBBaseUrl));
    const feedbackId = `feedback_pos_${randomUUID()}`;

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/feedback',
      payload: positivePayload(feedbackId),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ feedback_id: feedbackId, accepted: true });

    const stored = await getPrismaClient().feedback.findUnique({
      where: { feedbackId },
    });
    expect(stored).toMatchObject({
      requestId: 'req_1',
      conversationId: 'conv_1',
      messageId: 'msg_1',
      rating: 'positive',
    });
  });

  test('accepts negative feedback with an enum reason and resolves the outbox entry', async () => {
    const app = buildTestApp(testConfig(mockBBaseUrl));
    const feedbackId = `feedback_neg_${randomUUID()}`;

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/feedback',
      payload: negativePayload(feedbackId, 'not_resolved'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ feedback_id: feedbackId, accepted: true });

    // I06 (mock-b) is reachable and returns 202, so the outbox entry resolves immediately.
    const outboxEntries = await getPrismaClient().qualitySignalOutbox.findMany({
      where: { feedbackId },
    });
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0]?.resolvedAt).not.toBeNull();
  });

  test('rejects a negative feedback reason outside the enum', async () => {
    const app = buildTestApp(testConfig(mockBBaseUrl));

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/feedback',
      payload: negativePayload(`feedback_bad_reason_${randomUUID()}`, 'because_i_said_so'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });

  test('rejects a negative rating missing the required reason', async () => {
    const app = buildTestApp(testConfig(mockBBaseUrl));

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/feedback',
      payload: {
        feedback_id: `feedback_missing_reason_${randomUUID()}`,
        request_id: 'req_1',
        conversation_id: 'conv_1',
        message_id: 'msg_1',
        rating: 'negative',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  test('resubmitting the same feedback_id does not double-count', async () => {
    const app = buildTestApp(testConfig(mockBBaseUrl));
    const feedbackId = `feedback_dup_${randomUUID()}`;
    const payload = positivePayload(feedbackId);

    const first = await app.inject({ headers: AUTH_HEADERS, method: 'POST', url: '/api/v1/feedback', payload });
    const second = await app.inject({ headers: AUTH_HEADERS, method: 'POST', url: '/api/v1/feedback', payload });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data).toEqual(first.json().data);

    const rows = await getPrismaClient().feedback.findMany({ where: { feedbackId } });
    expect(rows).toHaveLength(1);
  });

  test('still returns success and queues the outbox when I06 is unreachable', async () => {
    // Deliberately unreachable port: nothing listens here.
    const app = buildTestApp(testConfig('http://127.0.0.1:1'));
    const feedbackId = `feedback_i06_down_${randomUUID()}`;

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/feedback',
      payload: negativePayload(feedbackId),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ feedback_id: feedbackId, accepted: true });

    const outboxEntries = await getPrismaClient().qualitySignalOutbox.findMany({
      where: { feedbackId },
    });
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0]?.resolvedAt).toBeNull();
    expect(outboxEntries[0]?.attempts).toBe(0); // inline attempt failed but is not yet retried by the worker
  });
});

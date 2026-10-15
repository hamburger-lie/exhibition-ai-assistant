process.env.DATABASE_URL ??=
  'postgresql://postgres:assistant_dev_password@127.0.0.1:55532/assistant_dev?schema=public';

import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';

import { disconnectPrismaClient, getPrismaClient } from '../src/persistence/client.js';
import { AUTH_HEADERS, buildTestApp, testConfig } from './helpers/app.js';

afterAll(async () => {
  await disconnectPrismaClient();
});


function behaviorEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    event_id: `event_${randomUUID()}`,
    event_type: 'page_view',
    occurred_at: new Date().toISOString(),
    request_id: 'req_1',
    ...overrides,
  };
}

describe('E06 POST /api/v1/events/batch', () => {
  test('accepts a batch and persists each event', async () => {
    const app = buildTestApp(testConfig());
    const events = [
      behaviorEvent({ event_type: 'page_view' }),
      behaviorEvent({
        event_type: 'entity_click',
        entity: { type: 'exhibitor', id: 'exhibitor_huayan' },
      }),
    ];

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/events/batch',
      payload: { events },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ accepted: 2 });

    const stored = await getPrismaClient().analyticsEvent.findMany({
      where: { eventId: { in: events.map((event) => event.event_id) } },
    });
    expect(stored).toHaveLength(2);
  });

  test('is idempotent by event_id: resending the same batch does not double-insert', async () => {
    const app = buildTestApp(testConfig());
    const event = behaviorEvent();

    const first = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/events/batch',
      payload: { events: [event] },
    });
    const second = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/events/batch',
      payload: { events: [event] },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().data).toEqual({ accepted: 1 });
    expect(second.json().data).toEqual({ accepted: 1 }); // still "accepted": already recorded

    const stored = await getPrismaClient().analyticsEvent.findMany({
      where: { eventId: event.event_id },
    });
    expect(stored).toHaveLength(1);
  });

  test('rejects a batch larger than 50 events', async () => {
    const app = buildTestApp(testConfig());
    const events = Array.from({ length: 51 }, () => behaviorEvent());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/events/batch',
      payload: { events },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });

  test('rejects an empty batch', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/events/batch',
      payload: { events: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  test('rejects an unsupported event_type', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/events/batch',
      payload: { events: [behaviorEvent({ event_type: 'not_a_real_event' })] },
    });

    expect(response.statusCode).toBe(400);
  });
});

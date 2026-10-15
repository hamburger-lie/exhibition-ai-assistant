import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, test } from 'vitest';

import { buildLoggerOptions } from '../src/observability/logger.js';
import { resetMetrics } from '../src/observability/metrics.js';
import { redactObject, redactString } from '../src/security/redaction.js';
import { AUTH_HEADERS, buildTestApp, testConfig } from './helpers/app.js';


describe('security/redaction', () => {
  test('masks known sensitive field names', () => {
    const result = redactObject({
      authorization: 'Bearer sess_abc123',
      Cookie: 'session=xyz',
      session_token: 'sess_abc123',
      password: 'hunter2',
      normal_field: 'safe value',
    });

    expect(result).toEqual({
      authorization: '[REDACTED]',
      Cookie: '[REDACTED]',
      session_token: '[REDACTED]',
      password: '[REDACTED]',
      normal_field: 'safe value',
    });
  });

  test('scrubs a Bearer token even embedded in free text', () => {
    expect(redactString('failed with Authorization: Bearer sess_abc123.def-456')).toBe(
      'failed with Authorization: Bearer [REDACTED]',
    );
  });

  test('recurses into nested objects and arrays without touching safe data', () => {
    const result = redactObject({
      user: { name: '张三', token: 'sess_should_be_hidden' },
      items: [{ comment: 'my token is Bearer abc123' }, { comment: 'ok' }],
    });

    expect(result).toEqual({
      user: { name: '张三', token: '[REDACTED]' },
      items: [{ comment: 'my token is Bearer [REDACTED]' }, { comment: 'ok' }],
    });
  });
});

describe('observability/logger', () => {
  test('redact config covers Authorization, Cookie, and token-shaped fields', () => {
    const options = buildLoggerOptions('info', '1.2.3');

    expect(options.base).toEqual({ service: 'bff', version: '1.2.3' });
    expect(options.redact.censor).toBe('[REDACTED]');
    expect(options.redact.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        '*.session_token',
        '*.token',
      ]),
    );
  });
});

describe('/internal/metrics', () => {
  afterEach(() => {
    resetMetrics();
  });

  test('exposes the required signals: stream interruption, 429s, upstream errors, feedback failures, first-event latency', async () => {
    const app = buildTestApp(testConfig());

    const response = await app.inject({ method: 'GET', url: '/internal/metrics' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('stream_interrupted_total');
    expect(body).toHaveProperty('rate_limited_total');
    expect(body).toHaveProperty('upstream_errors_total');
    expect(body).toHaveProperty('feedback_failures_total');
    expect(body).toHaveProperty('first_event_latency_ms');
  });

  test('rate_limited_total increments after a 429', async () => {
    const app = buildTestApp(testConfig({ BFF_RATE_LIMIT_MAX: '1' }));

    await app.inject({ method: 'GET', url: '/api/v1/config?expo_id=expo_demo_2026_spring' });
    const limited = await app.inject({
      method: 'GET',
      url: '/api/v1/config?expo_id=expo_demo_2026_spring',
    });
    expect(limited.statusCode).toBe(429);

    const metricsResponse = await app.inject({ method: 'GET', url: '/internal/metrics' });
    const total = Object.values(
      metricsResponse.json().rate_limited_total as Record<string, number>,
    ).reduce((sum, value) => sum + value, 0);
    expect(total).toBeGreaterThanOrEqual(1);
  });
});

describe('E03/E04 upstream timeout', () => {
  let stub: Server | undefined;

  afterEach(async () => {
    if (stub) {
      await new Promise<void>((resolve) => stub?.close(() => resolve()));
      stub = undefined;
    }
  });

  async function startSlowStub(delayMs: number): Promise<string> {
    stub = createServer((req, res) => {
      req.resume();
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      }, delayMs);
    });
    await new Promise<void>((resolve) => stub?.listen(0, '127.0.0.1', resolve));
    const address = stub.address();
    if (!address || typeof address === 'string') {
      throw new Error('stub did not bind to a TCP port');
    }
    return `http://127.0.0.1:${address.port}`;
  }

  const validPayload = {
    conversation_id: 'conv_1',
    message: '找展商',
    context: { expo_id: 'expo_demo_2026_spring' },
  };

  test('E04 returns AI_UPSTREAM_TIMEOUT when upstream exceeds the configured budget', async () => {
    const baseUrl = await startSlowStub(500);
    const app = buildTestApp(
      testConfig({ B_SERVICE_BASE_URL: baseUrl, B_SERVICE_TIMEOUT_MS: '100' }),
    );

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/chat',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(504);
    expect(response.json().error.code).toBe('AI_UPSTREAM_TIMEOUT');
    expect(response.json().error.user_message).toBe('响应超时，请重试。');
  });

  test('E03 returns AI_UPSTREAM_TIMEOUT when upstream exceeds the configured budget', async () => {
    const baseUrl = await startSlowStub(500);
    const app = buildTestApp(
      testConfig({ B_SERVICE_BASE_URL: baseUrl, B_SERVICE_TIMEOUT_MS: '100' }),
    );

    const response = await app.inject({ headers: AUTH_HEADERS,
      method: 'POST',
      url: '/api/v1/chat/stream',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(504);
    expect(response.json().error.code).toBe('AI_UPSTREAM_TIMEOUT');
  });
});

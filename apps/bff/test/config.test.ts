import { describe, expect, test } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadRuntimeConfig } from '../src/config/runtime-config.js';

function testConfig(overrides: Partial<Record<string, string>> = {}) {
  return loadRuntimeConfig({
    ...process.env,
    BFF_RATE_LIMIT_MAX: '1000',
    BFF_LOG_LEVEL: 'silent',
    BFF_STORE_BACKEND: 'memory',
    BFF_CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    ...overrides,
  });
}

describe('E02 GET /api/v1/config', () => {
  test('returns welcome text, quick actions and feature flags for a known expo_id', async () => {
    const app = buildApp(testConfig());

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/config?expo_id=expo_demo_2026_spring',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.assistant_name).toEqual(expect.any(String));
    expect(body.data.welcome_text).toEqual(expect.any(String));
    expect(Array.isArray(body.data.quick_actions)).toBe(true);
    expect(body.data.quick_actions.length).toBeGreaterThan(0);
    expect(body.data.features).toEqual({
      streaming: true,
      feedback: true,
      citations: true,
      map_highlight: true,
    });
    expect(body.data.config_version).toEqual(expect.any(String));
  });

  test('requires expo_id', async () => {
    const app = buildApp(testConfig());

    const response = await app.inject({ method: 'GET', url: '/api/v1/config' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_ARGUMENT');
  });

  test('hard-filters an old expo instead of silently falling back', async () => {
    const app = buildApp(testConfig());

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/config?expo_id=expo_demo_2025_spring',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('EXPO_NOT_FOUND');
  });

  test('returns EXPO_NOT_FOUND for a completely unknown expo_id', async () => {
    const app = buildApp(testConfig());

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/config?expo_id=expo_unknown',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('EXPO_NOT_FOUND');
  });
});

describe('CORS allowlist', () => {
  test('reflects an allowed origin', async () => {
    const app = buildApp(testConfig());

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/config?expo_id=expo_demo_2026_spring',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });

  test('does not reflect a disallowed origin', async () => {
    const app = buildApp(testConfig());

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/config?expo_id=expo_demo_2026_spring',
      headers: { origin: 'http://evil.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('answers preflight OPTIONS requests', async () => {
    const app = buildApp(testConfig());

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/config',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toEqual(
      expect.stringContaining('GET'),
    );
  });
});

describe('basic rate limiting', () => {
  test('returns 429 with Retry-After once the window max is exceeded', async () => {
    const app = buildApp(
      testConfig({ BFF_RATE_LIMIT_MAX: '2', BFF_RATE_LIMIT_WINDOW_MS: '60000' }),
    );
    const url = '/api/v1/config?expo_id=expo_demo_2026_spring';

    const first = await app.inject({ method: 'GET', url });
    const second = await app.inject({ method: 'GET', url });
    const third = await app.inject({ method: 'GET', url });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.headers['retry-after']).toEqual(expect.any(String));
    const body = third.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryable).toBe(true);
  });
});

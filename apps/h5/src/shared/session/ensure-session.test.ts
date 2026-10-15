// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError } from '../api/client.js';
import { bootstrap, ensureAnonymousSession } from './ensure-session.js';
import { loadStoredSession, saveSession } from './session-store.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>(
    '../api/client.js',
  );
  return {
    ...actual,
    createSession: vi.fn(),
    getConfig: vi.fn(),
  };
});

import { createSession, getConfig } from '../api/client.js';

const EXPO_ID = 'expo_demo_2026_spring';

function freshSessionData(suffix: string) {
  return {
    session_id: `session_${suffix}`,
    anonymous_user_id: `anon_${suffix}`,
    session_token: `token_${suffix}`,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    default_conversation_id: `conv_${suffix}`,
  };
}

const configData = {
  assistant_name: 'AI 问答助手',
  welcome_text: '你好',
  quick_actions: [],
  features: { streaming: true, feedback: true, citations: true, map_highlight: true },
  config_version: 'v1',
};

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(createSession).mockReset();
  vi.mocked(getConfig).mockReset();
});

describe('ensureAnonymousSession', () => {
  test('creates and persists a new session when none is cached', async () => {
    vi.mocked(createSession).mockResolvedValue(freshSessionData('new'));

    const session = await ensureAnonymousSession(EXPO_ID);

    expect(session.session_token).toBe('token_new');
    expect(createSession).toHaveBeenCalledWith({
      expo_id: EXPO_ID,
      source: 'direct_h5',
    });
    expect(loadStoredSession()?.session_token).toBe('token_new');
  });

  test('reuses a cached session from localStorage without calling the API', async () => {
    saveSession(freshSessionData('cached'));

    const session = await ensureAnonymousSession(EXPO_ID);

    expect(session.session_token).toBe('token_cached');
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('bootstrap', () => {
  test('loads session and config on the happy path', async () => {
    saveSession(freshSessionData('cached'));
    vi.mocked(getConfig).mockResolvedValue(configData);

    const result = await bootstrap(EXPO_ID);

    expect(result.config).toEqual(configData);
    expect(getConfig).toHaveBeenCalledWith(EXPO_ID, 'token_cached');
  });

  test('clears an expired token, rebuilds the session and retries once on 401', async () => {
    saveSession(freshSessionData('stale'));
    vi.mocked(getConfig)
      .mockRejectedValueOnce(
        new ApiError(401, 'SESSION_EXPIRED', 'expired', '登录已过期。', true),
      )
      .mockResolvedValueOnce(configData);
    vi.mocked(createSession).mockResolvedValue(freshSessionData('rebuilt'));

    const result = await bootstrap(EXPO_ID);

    expect(result.session.session_token).toBe('token_rebuilt');
    expect(result.config).toEqual(configData);
    expect(loadStoredSession()?.session_token).toBe('token_rebuilt');
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(getConfig).toHaveBeenCalledTimes(2);
  });

  test('propagates a non-401 error without clearing the session', async () => {
    saveSession(freshSessionData('cached'));
    vi.mocked(getConfig).mockRejectedValue(
      new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'down', '服务不可用。', true),
    );

    await expect(bootstrap(EXPO_ID)).rejects.toThrow('down');
    expect(loadStoredSession()?.session_token).toBe('token_cached');
  });
});

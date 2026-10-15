import { ApiError, createSession, getConfig, type ConfigData } from '../api/client.js';
import {
  clearSession,
  loadStoredSession,
  saveSession,
  type StoredSession,
} from './session-store.js';

/** Reuses a cached, non-expired session or creates a fresh anonymous one. */
export async function ensureAnonymousSession(
  expoId: string,
): Promise<StoredSession> {
  const stored = loadStoredSession();
  if (stored) {
    return stored;
  }

  const session = await createSession({ expo_id: expoId, source: 'direct_h5' });
  saveSession(session);
  return session;
}

export interface BootstrapResult {
  session: StoredSession;
  config: ConfigData;
}

/**
 * Loads the anonymous session and H5 config. On a 401 (expired/invalid
 * token) it clears the stale session, creates a new one, and retries the
 * config call exactly once before surfacing the error.
 */
export async function bootstrap(expoId: string): Promise<BootstrapResult> {
  const session = await ensureAnonymousSession(expoId);

  try {
    const config = await getConfig(expoId, session.session_token);
    return { session, config };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearSession();
      const freshSession = await ensureAnonymousSession(expoId);
      const config = await getConfig(expoId, freshSession.session_token);
      return { session: freshSession, config };
    }
    throw error;
  }
}

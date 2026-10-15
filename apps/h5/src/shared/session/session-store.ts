const STORAGE_KEY = 'assistant.session.v1';

export interface StoredSession {
  session_id: string;
  anonymous_user_id: string;
  session_token: string;
  expires_at: string;
  default_conversation_id: string;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.session_id === 'string' &&
    typeof record.anonymous_user_id === 'string' &&
    typeof record.session_token === 'string' &&
    typeof record.expires_at === 'string' &&
    typeof record.default_conversation_id === 'string'
  );
}

/** Reads and validates the cached session; clears and returns null if missing/expired/malformed. */
export function loadStoredSession(): StoredSession | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  if (!isStoredSession(parsed)) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  if (new Date(parsed.expires_at).getTime() <= Date.now()) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }

  return parsed;
}

export function saveSession(session: StoredSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

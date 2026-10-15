const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|token|session_token|service_token|password|secret|api[-_]?key)$/i;

const BEARER_TOKEN_PATTERN = /(Bearer\s+)[A-Za-z0-9._-]+/gi;

/** Scrubs a Bearer-token-shaped substring even inside otherwise free text. */
export function redactString(value: string): string {
  return value.replace(BEARER_TOKEN_PATTERN, '$1[REDACTED]');
}

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

/**
 * Recursively redacts an arbitrary log payload: known sensitive field names
 * (Authorization/Cookie/token/password/...) are fully masked, and any
 * remaining string value is scanned for a Bearer-token pattern even when the
 * field name itself gives no hint (free-text messages/comments).
 */
export function redactObject(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[REDACTED]'
      : redactValue(value);
  }
  return output;
}

import { randomUUID } from 'node:crypto';

export function generateTraceId(): string {
  return `trace_${randomUUID()}`;
}

export interface BffLoggerOptions {
  level: string;
  base: { service: string; version: string };
  redact: { paths: string[]; censor: string };
}

/**
 * Pino options for the Fastify logger: structured JSON, service/version in
 * every line, and built-in path-based redaction so Authorization/Cookie
 * headers and token-shaped fields never reach the log sink in the clear.
 * Free-text fields (e.g. a Bearer token embedded in a comment) are handled
 * separately by security/redaction.ts wherever we log arbitrary payloads.
 */
export function buildLoggerOptions(
  level: string,
  serviceVersion: string,
): BffLoggerOptions {
  return {
    level,
    base: { service: 'bff', version: serviceVersion },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'req.headers["x-service-token"]',
        '*.session_token',
        '*.service_token',
        '*.token',
        '*.password',
        '*.authorization',
      ],
      censor: '[REDACTED]',
    },
  };
}

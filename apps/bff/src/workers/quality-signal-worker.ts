import type { BClientConfig } from '../config/runtime-config.js';
import { processOutboxOnce } from '../services/quality-outbox.js';

export interface QualitySignalWorker {
  stop: () => void;
}

/**
 * Polls the quality-signal outbox on an interval, alongside the Fastify
 * server. Core retry/backoff logic lives in `processOutboxOnce`, which is
 * unit-tested directly; this wrapper only owns the interval lifecycle.
 */
export function startQualitySignalWorker(
  config: BClientConfig,
  intervalMs = 30_000,
): QualitySignalWorker {
  const timer = setInterval(() => {
    processOutboxOnce(config).catch(() => {
      // Best-effort background job: a failed poll is retried next tick.
    });
  }, intervalMs);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
  };
}

import type { BClientConfig } from '../config/runtime-config.js';
import {
  createOutboxEntry,
  listDueOutboxEntries,
  markOutboxResolved,
  recordOutboxAttemptFailure,
  type NewOutboxEntry,
} from '../persistence/repositories.js';
import { submitQualitySignals, type QualitySignal } from '../upstream/b-client.js';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;
// Once attempts are exhausted the row is parked (not deleted) so the last
// error stays inspectable, without being picked up again.
const PARKED_UNTIL = new Date('2999-01-01T00:00:00.000Z');

export function enqueueQualitySignal(entry: NewOutboxEntry) {
  return createOutboxEntry(entry);
}

function backoffDelayMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
}

export interface ProcessOutboxResult {
  processed: number;
  resolved: number;
  failed: number;
}

/**
 * Picks up due outbox rows and retries I06 with capped exponential backoff.
 * Never logs Authorization/token values — only the upstream status or the
 * fetch error message, neither of which carries credentials.
 */
export async function processOutboxOnce(
  config: BClientConfig,
  limit = 10,
): Promise<ProcessOutboxResult> {
  const due = await listDueOutboxEntries(new Date(), limit);
  let resolved = 0;
  let failed = 0;

  for (const entry of due) {
    const signal = entry.payload as unknown as QualitySignal;

    try {
      const result = await submitQualitySignals(
        config,
        [signal],
        new AbortController().signal,
      );

      if (result.status === 202) {
        await markOutboxResolved(entry.id);
        resolved += 1;
        continue;
      }

      throw new Error(`upstream responded with status ${result.status}`);
    } catch (error) {
      failed += 1;
      const attempts = entry.attempts + 1;
      const message = error instanceof Error ? error.message : 'unknown error';
      const nextAttemptAt =
        attempts >= MAX_ATTEMPTS
          ? PARKED_UNTIL
          : new Date(Date.now() + backoffDelayMs(attempts));
      await recordOutboxAttemptFailure(entry.id, attempts, message, nextAttemptAt);
    }
  }

  return { processed: due.length, resolved, failed };
}

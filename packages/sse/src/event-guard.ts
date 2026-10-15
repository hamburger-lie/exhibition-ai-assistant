import type { SseFrame } from './parser.js';

const KNOWN_EVENTS = new Set([
  'message.start',
  'status.update',
  'message.delta',
  'entity.card',
  'citation',
  'suggestion.list',
  'message.done',
  'message.error',
]);

const TERMINAL_EVENTS = new Set(['message.done', 'message.error']);

export function isKnownEvent(event: string): boolean {
  return KNOWN_EVENTS.has(event);
}

export function isTerminalEvent(event: string): boolean {
  return TERMINAL_EVENTS.has(event);
}

/**
 * Enforces the two safety rules shared by every SSE consumer (H5 and BFF):
 * unknown events are dropped instead of crashing the reader, and nothing is
 * forwarded once a terminal event (`message.done`/`message.error`) has been
 * seen — the stream is over even if more bytes arrive.
 */
export class TerminalEventGuard {
  private terminated = false;

  get isTerminated(): boolean {
    return this.terminated;
  }

  /** Returns true when `frame` should be forwarded/handled by the caller. */
  accept(frame: SseFrame): boolean {
    if (this.terminated || !isKnownEvent(frame.event)) {
      return false;
    }

    if (isTerminalEvent(frame.event)) {
      this.terminated = true;
    }

    return true;
  }
}

import type { SseFrame } from '@ai-assistant/sse';
import { TerminalEventGuard } from '@ai-assistant/sse';

/**
 * Forwards only whitelisted, contract-known SSE events from I01 to the
 * public E03 stream. Everything else (unknown events, anything after a
 * terminal event) is dropped here so no internal trace/prompt/model field
 * can leak to the browser even if an upstream implementation misbehaves.
 */
export class UpstreamEventWhitelist {
  private readonly guard = new TerminalEventGuard();

  get isTerminated(): boolean {
    return this.guard.isTerminated;
  }

  /** Returns the frame to forward, or null if it must be dropped. */
  filter(frame: SseFrame): SseFrame | null {
    return this.guard.accept(frame) ? frame : null;
  }
}

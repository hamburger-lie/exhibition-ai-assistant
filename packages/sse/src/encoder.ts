import type { SseFrame } from './parser.js';

/** Encodes a single frame to wire format: `event: X\ndata: Y\n\n`. */
export function encodeSseFrame(frame: SseFrame): string {
  return `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
}

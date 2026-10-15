export interface SseFrame {
  event: string;
  data: unknown;
}

/**
 * Incremental SSE parser for chunked byte streams. Buffers partial UTF-8
 * sequences (via TextDecoder's `stream: true`) and partial lines/frames
 * across `push()` calls, so a multi-byte character or a `\n\n` frame
 * boundary split across two network chunks is still decoded correctly.
 */
export class SseStreamParser {
  private readonly decoder = new TextDecoder('utf-8');
  private buffer = '';

  push(chunk: Uint8Array): SseFrame[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drainFrames();
  }

  private drainFrames(): SseFrame[] {
    const frames: SseFrame[] = [];
    let separatorIndex = this.buffer.indexOf('\n\n');

    while (separatorIndex !== -1) {
      const block = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      const frame = parseFrameBlock(block);
      if (frame) {
        frames.push(frame);
      }
      separatorIndex = this.buffer.indexOf('\n\n');
    }

    return frames;
  }
}

function parseFrameBlock(block: string): SseFrame | null {
  let event = '';
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }

  if (!event || dataLines.length === 0) {
    return null;
  }

  return { event, data: JSON.parse(dataLines.join('\n')) as unknown };
}

/** One-shot parse of a complete, already-buffered SSE text (e.g. a fixture file). */
export function parseSseText(source: string): SseFrame[] {
  const parser = new SseStreamParser();
  const normalized = source.replace(/\r\n?/g, '\n');
  const withTrailingBoundary = normalized.endsWith('\n\n')
    ? normalized
    : `${normalized.replace(/\n+$/, '')}\n\n`;
  return parser.push(new TextEncoder().encode(withTrailingBoundary));
}

import { describe, expect, test } from 'vitest';

import { encodeSseFrame } from '../src/encoder.js';
import { TerminalEventGuard, isKnownEvent, isTerminalEvent } from '../src/event-guard.js';
import { SseStreamParser, parseSseText } from '../src/parser.js';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('SseStreamParser', () => {
  test('parses a single frame delivered in one chunk', () => {
    const parser = new SseStreamParser();
    const frames = parser.push(
      bytes('event: message.delta\ndata: {"delta":"hi"}\n\n'),
    );

    expect(frames).toEqual([{ event: 'message.delta', data: { delta: 'hi' } }]);
  });

  test('reassembles a UTF-8 character split across two network chunks', () => {
    // "你" is E4 BD A0 in UTF-8; split the raw frame bytes mid-character.
    const full = bytes('event: message.delta\ndata: {"delta":"你好"}\n\n');
    const splitPoint = full.indexOf(0xbd); // inside the first character's bytes
    const chunk1 = full.slice(0, splitPoint);
    const chunk2 = full.slice(splitPoint);

    const parser = new SseStreamParser();
    const firstResult = parser.push(chunk1);
    expect(firstResult).toEqual([]); // incomplete frame, nothing decodable yet as a full char

    const secondResult = parser.push(chunk2);
    expect(secondResult).toEqual([
      { event: 'message.delta', data: { delta: '你好' } },
    ]);
  });

  test('reassembles a frame whose blank-line boundary is split across chunks', () => {
    const parser = new SseStreamParser();
    const part1 = bytes('event: message.delta\ndata: {"delta":"a"}\n');
    const part2 = bytes('\n');

    expect(parser.push(part1)).toEqual([]);
    expect(parser.push(part2)).toEqual([
      { event: 'message.delta', data: { delta: 'a' } },
    ]);
  });

  test('preserves event order across multiple frames in one chunk', () => {
    const parser = new SseStreamParser();
    const frames = parser.push(
      bytes(
        'event: message.start\ndata: {"a":1}\n\n' +
          'event: message.delta\ndata: {"a":2}\n\n' +
          'event: message.done\ndata: {"a":3}\n\n',
      ),
    );

    expect(frames.map((frame) => frame.event)).toEqual([
      'message.start',
      'message.delta',
      'message.done',
    ]);
  });

  test('parseSseText parses a complete fixture-style buffer in one shot', () => {
    const frames = parseSseText(
      'event: message.start\ndata: {"a":1}\n\nevent: message.done\ndata: {"a":2}\n\n',
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]?.event).toBe('message.start');
    expect(frames[1]?.event).toBe('message.done');
  });
});

describe('encodeSseFrame', () => {
  test('round-trips through the parser', () => {
    const wire = encodeSseFrame({ event: 'citation', data: { id: 'c_1' } });
    expect(wire).toBe('event: citation\ndata: {"id":"c_1"}\n\n');

    const parser = new SseStreamParser();
    expect(parser.push(bytes(wire))).toEqual([
      { event: 'citation', data: { id: 'c_1' } },
    ]);
  });
});

describe('event-guard', () => {
  test('known/unknown event classification', () => {
    expect(isKnownEvent('message.delta')).toBe(true);
    expect(isKnownEvent('debug.trace')).toBe(false);
    expect(isTerminalEvent('message.done')).toBe(true);
    expect(isTerminalEvent('message.error')).toBe(true);
    expect(isTerminalEvent('message.delta')).toBe(false);
  });

  test('drops unknown events but forwards known ones', () => {
    const guard = new TerminalEventGuard();
    expect(guard.accept({ event: 'message.start', data: {} })).toBe(true);
    expect(guard.accept({ event: 'debug.trace', data: {} })).toBe(false);
    expect(guard.accept({ event: 'message.delta', data: {} })).toBe(true);
    expect(guard.isTerminated).toBe(false);
  });

  test('enforces a single terminal event and drops everything after it', () => {
    const guard = new TerminalEventGuard();
    expect(guard.accept({ event: 'message.done', data: {} })).toBe(true);
    expect(guard.isTerminated).toBe(true);
    // A duplicate/late terminal event, or any event at all, must be dropped.
    expect(guard.accept({ event: 'message.done', data: {} })).toBe(false);
    expect(guard.accept({ event: 'message.delta', data: {} })).toBe(false);
  });
});

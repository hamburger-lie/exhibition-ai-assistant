export interface RecordedEvent {
  event_type: string;
  occurred_at: string;
  request_id?: string;
  message_id?: string;
  props?: Record<string, unknown>;
}

/**
 * In-memory buffer for behavior events (page_view/stream_cancel/etc). Task 11
 * wires this to POST /api/v1/events/batch (E06); until then it's a queryable
 * queue so callers can record events and tests can assert on them.
 */
const buffer: RecordedEvent[] = [];

export function recordEvent(
  eventType: string,
  fields: Omit<RecordedEvent, 'event_type' | 'occurred_at'> = {},
): void {
  buffer.push({
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    ...fields,
  });
}

export function getRecordedEvents(): readonly RecordedEvent[] {
  return buffer;
}

export function clearRecordedEvents(): void {
  buffer.length = 0;
}

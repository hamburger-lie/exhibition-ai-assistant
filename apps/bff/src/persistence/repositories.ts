import { Prisma, type Feedback, type QualitySignalOutbox } from '@prisma/client';

import { getPrismaClient } from './client.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export interface NewFeedback {
  feedbackId: string;
  requestId: string;
  conversationId: string;
  messageId: string;
  rating: 'positive' | 'negative';
  reason?: string;
  comment?: string;
}

export function findFeedbackByFeedbackId(
  feedbackId: string,
): Promise<Feedback | null> {
  return getPrismaClient().feedback.findUnique({ where: { feedbackId } });
}

/** Idempotent by feedback_id: a resubmission returns the original row untouched. */
export async function createFeedbackIfAbsent(
  input: NewFeedback,
): Promise<Feedback> {
  try {
    return await getPrismaClient().feedback.create({ data: input });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const existing = await findFeedbackByFeedbackId(input.feedbackId);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Analytics events
// ---------------------------------------------------------------------------

export interface NewAnalyticsEvent {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  requestId: string;
  messageId?: string;
  entityType?: string;
  entityId?: string;
  props?: Prisma.InputJsonValue;
}

/** Returns true if newly inserted, false if event_id was already recorded (idempotent). */
export async function insertAnalyticsEventIfAbsent(
  input: NewAnalyticsEvent,
): Promise<boolean> {
  try {
    await getPrismaClient().analyticsEvent.create({ data: input });
    return true;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return false;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Quality signal outbox
// ---------------------------------------------------------------------------

export interface NewOutboxEntry {
  feedbackId: string;
  signalType: string;
  payload: Prisma.InputJsonValue;
  lastError?: string;
}

export function createOutboxEntry(
  input: NewOutboxEntry,
): Promise<QualitySignalOutbox> {
  return getPrismaClient().qualitySignalOutbox.create({ data: input });
}

export function listDueOutboxEntries(
  now: Date,
  limit: number,
): Promise<QualitySignalOutbox[]> {
  return getPrismaClient().qualitySignalOutbox.findMany({
    where: { resolvedAt: null, nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });
}

export function recordOutboxAttemptFailure(
  id: string,
  attempts: number,
  lastError: string,
  nextAttemptAt: Date,
): Promise<QualitySignalOutbox> {
  return getPrismaClient().qualitySignalOutbox.update({
    where: { id },
    data: { attempts, lastError, nextAttemptAt },
  });
}

export function markOutboxResolved(id: string): Promise<QualitySignalOutbox> {
  return getPrismaClient().qualitySignalOutbox.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });
}

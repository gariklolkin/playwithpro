import { ConflictException } from '@nestjs/common';
import { ServiceType, SessionStatus } from '@prisma/client';

/**
 * Session states that grant the coach access to the attached video:
 * payment onward, never before and never after a cancellation.
 */
export const COACH_ACCESS_STATUSES: SessionStatus[] = [
  SessionStatus.PAID_ESCROW,
  SessionStatus.IN_PROGRESS,
  SessionStatus.AWAITING_CONFIRMATION,
  SessionStatus.COMPLETED_PAID,
  SessionStatus.DISPUTED,
  SessionStatus.RESOLVED,
];

/** Paid statuses whose session room is reachable (inside the join window). */
export const ROOM_ACCESS_STATUSES: SessionStatus[] = [
  SessionStatus.PAID_ESCROW,
  SessionStatus.IN_PROGRESS,
  SessionStatus.AWAITING_CONFIRMATION,
];

/** Statuses in which the player may still change the booking's inputs (clips, goal). */
export const PLAYER_EDITABLE_STATUSES: SessionStatus[] = [
  SessionStatus.PENDING_PAYMENT,
  SessionStatus.PAID_ESCROW,
];

/**
 * The one rule behind every player-side edit of a booking: unpaid or paid,
 * and the slot has not started. Throws a conflict otherwise.
 */
export function assertEditableBeforeStart(
  session: { status: SessionStatus; startsAt: Date },
  message: string,
  now = Date.now(),
): void {
  if (
    !PLAYER_EDITABLE_STATUSES.includes(session.status) ||
    session.startsAt.getTime() <= now
  ) {
    throw new ConflictException(message);
  }
}

/** Online services meet in a video room; a game meets at the venue. */
export function isOnlineService(type: ServiceType): boolean {
  return type !== ServiceType.GAME;
}

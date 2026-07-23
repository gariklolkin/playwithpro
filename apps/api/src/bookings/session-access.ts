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

/** Online services meet in a video room; a game meets at the venue. */
export function isOnlineService(type: ServiceType): boolean {
  return type !== ServiceType.GAME;
}

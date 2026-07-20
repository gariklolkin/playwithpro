import { SessionStatus } from '@prisma/client';

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

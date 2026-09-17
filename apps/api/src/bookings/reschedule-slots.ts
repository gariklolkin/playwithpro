import {
  Prisma,
  RescheduleStatus,
  SessionStatus,
  SlotStatus,
} from '@prisma/client';
import { RESCHEDULE_NOTICE_MS } from './session.mapper';

type Tx = Prisma.TransactionClient;

/**
 * BOOKED → OPEN for slots that no live session uses and that can still be
 * sold (2 hours of notice); anything else is left as history. Safe to call
 * with the session's own slot: a live session keeps it booked.
 */
export async function releaseHeldSlots(
  tx: Tx,
  slotIds: Array<string | null>,
  now: Date,
): Promise<void> {
  const ids = slotIds.filter((id): id is string => id !== null);
  if (ids.length === 0) return;
  await tx.availabilitySlot.updateMany({
    where: {
      id: { in: ids },
      status: SlotStatus.BOOKED,
      startsAt: { gt: new Date(now.getTime() + RESCHEDULE_NOTICE_MS) },
      sessions: {
        none: {
          status: {
            in: [
              SessionStatus.PENDING_PAYMENT,
              SessionStatus.PAID_ESCROW,
              SessionStatus.IN_PROGRESS,
            ],
          },
        },
      },
    },
    data: { status: SlotStatus.OPEN },
  });
}

/**
 * The session is going away (cancelled): its open proposal, if any, closes
 * silently and gives its offered slots back — inside the caller's transaction.
 */
export async function supersedeOpenProposal(
  tx: Tx,
  sessionId: string,
  now: Date,
): Promise<void> {
  const open = await tx.sessionReschedule.findFirst({
    where: { sessionId, status: RescheduleStatus.OPEN },
    select: { id: true, options: { select: { slotId: true } } },
  });
  if (!open) return;
  await tx.sessionReschedule.updateMany({
    where: { id: open.id, status: RescheduleStatus.OPEN },
    data: { status: RescheduleStatus.SUPERSEDED, respondedAt: now },
  });
  await releaseHeldSlots(
    tx,
    open.options.map((option) => option.slotId),
    now,
  );
}

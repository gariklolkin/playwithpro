import { CancellationTier, RescheduleStatus } from '@prisma/client';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The platform policy as snapshotted on a session at booking. */
export interface CancellationPolicySnapshot {
  freeHours: number;
  lateRefundPercent: number;
  noRefundHours: number;
  graceMin: number;
}

/** The session columns the snapshot lives in. */
export interface PolicyColumns {
  cancelFreeHours: number;
  cancelLateRefundPercent: number;
  cancelNoRefundHours: number;
  cancelGraceMin: number;
}

export type CancellationActor = 'player' | 'coach' | 'admin';

export interface CancellationTermsInput {
  policy: CancellationPolicySnapshot;
  priceMinor: number;
  feeMinor: number;
  startsAt: Date;
  /** When escrow was funded; null = "as if paid now" (an unpaid booking). */
  paidAt: Date | null;
  by: CancellationActor;
  now: Date;
  /**
   * The player's tier when a reschedule was last accepted (when worse than
   * FREE): moving the session never buys back a better one.
   */
  tierFloor?: CancellationTier | null;
  /**
   * A coach-made reschedule proposal is open, or the latest one was declined
   * or expired with no accepted move since: the coach signalled they cannot
   * make the time, so the player cancels for free.
   */
  coachProposalOutstanding?: boolean;
}

export interface CancellationTermsResult {
  tier: CancellationTier;
  /** Returned to the player. */
  refundMinor: number;
  /** Retained part before the fee, the fee on it, and what the coach receives. */
  coachGrossMinor: number;
  coachFeeMinor: number;
  coachNetMinor: number;
  /** A coach cancelling inside the free-cancellation window. */
  late: boolean;
}

/** The moments the policy turns on, for display in the viewer's timezone. */
export interface CancellationMoments {
  /** Full refund until here (may already be in the past). */
  freeUntil: Date;
  /** The late-refund percentage until here; nothing after. */
  partialUntil: Date;
  /** End of the late-booking grace when it applies, else null. */
  graceUntil: Date | null;
}

export function policyOf(session: PolicyColumns): CancellationPolicySnapshot {
  return {
    freeHours: session.cancelFreeHours,
    lateRefundPercent: session.cancelLateRefundPercent,
    noRefundHours: session.cancelNoRefundHours,
    graceMin: session.cancelGraceMin,
  };
}

export function toPolicyColumns(
  policy: CancellationPolicySnapshot,
): PolicyColumns {
  return {
    cancelFreeHours: policy.freeHours,
    cancelLateRefundPercent: policy.lateRefundPercent,
    cancelNoRefundHours: policy.noRefundHours,
    cancelGraceMin: policy.graceMin,
  };
}

/**
 * When the policy changes tier for a session. The grace exists only for a
 * booking paid after free cancellation had already ended, and never reaches
 * into the no-refund window (the slot cannot be resold from there on).
 */
export function cancellationMoments(
  policy: CancellationPolicySnapshot,
  startsAt: Date,
  paidAt: Date,
): CancellationMoments {
  const freeUntil = new Date(startsAt.getTime() - policy.freeHours * HOUR);
  const partialUntil = new Date(
    startsAt.getTime() - policy.noRefundHours * HOUR,
  );
  const graceEnd = Math.min(
    paidAt.getTime() + policy.graceMin * MINUTE,
    partialUntil.getTime(),
  );
  const graceApplies =
    paidAt.getTime() > freeUntil.getTime() && graceEnd > paidAt.getTime();
  return {
    freeUntil,
    partialUntil,
    graceUntil: graceApplies ? new Date(graceEnd) : null,
  };
}

/**
 * What cancelling at `now` means in money — the single definition behind the
 * cancel transaction, the amounts the cancel dialog shows, and the checkout
 * policy block. The coach and an admin always refund the player in full; the
 * player's refund follows the tiers. The platform fee on a partial payout is
 * proportional to the retained part of the snapshotted fee.
 */
export function cancellationTerms(
  input: CancellationTermsInput,
): CancellationTermsResult {
  const { policy, priceMinor, feeMinor, startsAt, by, now } = input;
  const msLeft = startsAt.getTime() - now.getTime();
  const tier =
    by === 'player' ? playerTier(input, msLeft) : CancellationTier.FREE;
  const refundMinor =
    tier === CancellationTier.FREE
      ? priceMinor
      : tier === CancellationTier.PARTIAL
        ? Math.round((priceMinor * policy.lateRefundPercent) / 100)
        : 0;
  const coachGrossMinor = priceMinor - refundMinor;
  const coachFeeMinor =
    priceMinor === 0
      ? 0
      : Math.round((feeMinor * coachGrossMinor) / priceMinor);
  return {
    tier,
    refundMinor,
    coachGrossMinor,
    coachFeeMinor,
    coachNetMinor: coachGrossMinor - coachFeeMinor,
    late: by === 'coach' && msLeft < policy.freeHours * HOUR,
  };
}

const SEVERITY: Record<CancellationTier, number> = {
  [CancellationTier.FREE]: 0,
  [CancellationTier.PARTIAL]: 1,
  [CancellationTier.NONE]: 2,
};

/** The tier that is worse for the player. */
export function worseTier(
  a: CancellationTier,
  b: CancellationTier | null | undefined,
): CancellationTier {
  return b && SEVERITY[b] > SEVERITY[a] ? b : a;
}

function playerTier(
  input: CancellationTermsInput,
  msLeft: number,
): CancellationTier {
  if (input.coachProposalOutstanding) {
    return CancellationTier.FREE;
  }
  return worseTier(clockTier(input, msLeft), input.tierFloor);
}

/** The tier by the clock alone: distance to the start and the grace. */
function clockTier(
  input: CancellationTermsInput,
  msLeft: number,
): CancellationTier {
  const { policy, startsAt, now } = input;
  if (msLeft >= policy.freeHours * HOUR) {
    return CancellationTier.FREE;
  }
  if (msLeft < policy.noRefundHours * HOUR) {
    return CancellationTier.NONE;
  }
  const { graceUntil } = cancellationMoments(
    policy,
    startsAt,
    input.paidAt ?? now,
  );
  return graceUntil !== null && now.getTime() <= graceUntil.getTime()
    ? CancellationTier.FREE
    : CancellationTier.PARTIAL;
}

/**
 * Whether the coach has an unanswered — or unsuccessfully answered — request
 * to move the session: their latest proposal is open, or was declined or
 * expired, and no reschedule was accepted after it.
 */
export function coachProposalOutstanding(
  reschedules: Array<{
    byCoach: boolean;
    status: RescheduleStatus;
    createdAt: Date;
  }>,
): boolean {
  const newestFirst = [...reschedules].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  for (const proposal of newestFirst) {
    if (proposal.status === RescheduleStatus.ACCEPTED) {
      return false;
    }
    if (proposal.byCoach) {
      return (
        proposal.status === RescheduleStatus.OPEN ||
        proposal.status === RescheduleStatus.DECLINED ||
        proposal.status === RescheduleStatus.EXPIRED
      );
    }
  }
  return false;
}

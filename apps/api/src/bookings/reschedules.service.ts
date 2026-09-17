import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RESCHEDULE_MAX_OPTIONS, SessionResponse } from '@playwithpro/shared';
import {
  CancellationTier,
  NotificationKind,
  Prisma,
  RescheduleStatus,
  SessionStatus,
  SlotStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ANALYTICS,
  LIFECYCLE_EVENTS,
  type Analytics,
} from '../observability/observability';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';
import {
  cancellationTerms,
  coachProposalOutstanding,
  policyOf,
  worseTier,
} from './cancellation-policy';
import { releaseHeldSlots } from './reschedule-slots';
import { RESCHEDULE_NOTICE_MS } from './session.mapper';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const PROPOSAL_SESSION_SELECT = {
  id: true,
  status: true,
  playerId: true,
  proProfileId: true,
  slotId: true,
  startsAt: true,
  endsAt: true,
  paidAt: true,
  priceMinor: true,
  platformFeeMinor: true,
  rescheduleCount: true,
  cancelTierFloor: true,
  cancelFreeHours: true,
  cancelLateRefundPercent: true,
  cancelNoRefundHours: true,
  cancelGraceMin: true,
  proProfile: { select: { userId: true } },
  reschedules: {
    select: { byCoach: true, status: true, createdAt: true },
  },
} as const satisfies Prisma.SessionSelect;

type ProposalSession = Prisma.SessionGetPayload<{
  select: typeof PROPOSAL_SESSION_SELECT;
}>;

/**
 * Moving a paid session by mutual agreement. A proposal offers up to three
 * of the coach's open slots and *holds* them with the same conditional
 * OPEN→BOOKED claim a booking uses, so nobody can take them while the other
 * side decides; every exit (accept, decline, withdraw, expiry, the session
 * being cancelled or starting) releases what it does not use. Acceptance
 * moves the session's slot and time in one transaction and touches nothing
 * else: escrow, snapshots, room, clips and goal stay as they were.
 *
 * One open proposal per session is a database guarantee (a partial unique
 * index); every transition is a conditional update, so concurrent actors —
 * two accepts, an accept and a cancel, the sweep — resolve to one outcome.
 */
@Injectable()
export class ReschedulesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReschedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bookings: BookingsService,
    private readonly notifications: NotificationsService,
    @Inject(ANALYTICS) private readonly analytics: Analytics,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  async propose(
    user: AuthenticatedUser,
    sessionId: string,
    slotIds: string[],
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    const now = new Date();
    if (
      session.status !== SessionStatus.PAID_ESCROW ||
      session.startsAt.getTime() - now.getTime() < RESCHEDULE_NOTICE_MS
    ) {
      throw new ConflictException(
        'Only a paid session starting at least 2 hours from now can be moved.',
      );
    }
    if (
      session.rescheduleCount >=
      this.config.getOrThrow<number>('RESCHEDULE_MAX_PER_SESSION')
    ) {
      throw new ConflictException('This session cannot be moved again.');
    }
    const unique = [...new Set(slotIds)];
    if (
      unique.length !== slotIds.length ||
      unique.length < 1 ||
      unique.length > RESCHEDULE_MAX_OPTIONS
    ) {
      throw new BadRequestException(
        `Offer between 1 and ${RESCHEDULE_MAX_OPTIONS} different slots.`,
      );
    }
    const slots = await this.prisma.availabilitySlot.findMany({
      where: { id: { in: unique } },
    });
    const duration = session.endsAt.getTime() - session.startsAt.getTime();
    const maxShift =
      this.config.getOrThrow<number>('RESCHEDULE_MAX_SHIFT_DAYS') * DAY;
    const valid =
      slots.length === unique.length &&
      slots.every(
        (slot) =>
          slot.profileId === session.proProfileId &&
          slot.id !== session.slotId &&
          slot.endsAt.getTime() - slot.startsAt.getTime() === duration &&
          slot.startsAt.getTime() - now.getTime() >= RESCHEDULE_NOTICE_MS &&
          Math.abs(slot.startsAt.getTime() - session.startsAt.getTime()) <=
            maxShift,
      );
    if (!valid) {
      throw new BadRequestException(
        "Offer the coach's own open slots of the same duration, at least 2 hours from now and within the allowed range.",
      );
    }
    const byCoach = session.proProfile.userId === user.id;
    const ttl =
      this.config.getOrThrow<number>('RESCHEDULE_PROPOSAL_TTL_HOURS') * HOUR;
    const expiresAt = new Date(
      Math.min(
        now.getTime() + ttl,
        session.startsAt.getTime() - RESCHEDULE_NOTICE_MS,
      ),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        // The partial unique index refuses a second open proposal.
        const proposal = await tx.sessionReschedule.create({
          data: {
            sessionId: session.id,
            proposedById: user.id,
            byCoach,
            fromStartsAt: session.startsAt,
            fromEndsAt: session.endsAt,
            expiresAt,
          },
        });
        for (const slot of slots) {
          const held = await tx.availabilitySlot.updateMany({
            where: {
              id: slot.id,
              status: SlotStatus.OPEN,
              startsAt: { gt: new Date(now.getTime() + RESCHEDULE_NOTICE_MS) },
            },
            data: { status: SlotStatus.BOOKED },
          });
          if (held.count === 0) {
            throw new ConflictException(
              'One of the offered slots is no longer available.',
            );
          }
        }
        await tx.sessionRescheduleOption.createMany({
          data: slots.map((slot) => ({
            rescheduleId: proposal.id,
            slotId: slot.id,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
          })),
        });
        // The session must still be the one we validated against.
        const still = await tx.session.count({
          where: {
            id: session.id,
            status: SessionStatus.PAID_ESCROW,
            startsAt: session.startsAt,
          },
        });
        if (still === 0) {
          throw new ConflictException('This session can no longer be moved.');
        }
        await this.notifications.enqueue(tx, [
          {
            kind: NotificationKind.RESCHEDULE_PROPOSED,
            sessionId: session.id,
            recipientId: byCoach ? session.playerId : session.proProfile.userId,
            dedupeSuffix: proposal.id,
            payload: { rescheduleId: proposal.id },
          },
        ]);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This session already has an open proposal.',
        );
      }
      throw error;
    }
    this.track(LIFECYCLE_EVENTS.rescheduleProposed, user, session.id, {
      options: slots.length,
    });
    return this.bookings.sessionResponse(session.id, user);
  }

  /** The other party picks one option: the session moves, nothing else does. */
  async accept(
    user: AuthenticatedUser,
    sessionId: string,
    optionId: string,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    const proposal = await this.openProposal(session.id);
    if (proposal.proposedById === user.id) {
      throw new ForbiddenException('The other party answers this proposal.');
    }
    const chosen = proposal.options.find((option) => option.id === optionId);
    if (!chosen || chosen.slotId === null) {
      throw new NotFoundException();
    }
    const now = new Date();
    // What cancelling would have cost the player right now: a move never
    // buys back a better tier than this.
    const tierNow = cancellationTerms({
      policy: policyOf(session),
      priceMinor: session.priceMinor,
      feeMinor: session.platformFeeMinor,
      startsAt: session.startsAt,
      paidAt: session.paidAt,
      by: 'player',
      now,
      tierFloor: session.cancelTierFloor,
      coachProposalOutstanding: coachProposalOutstanding(session.reschedules),
    }).tier;
    const floor = worseTier(tierNow, session.cancelTierFloor);

    await this.prisma.$transaction(async (tx) => {
      const accepted = await tx.sessionReschedule.updateMany({
        where: {
          id: proposal.id,
          status: RescheduleStatus.OPEN,
          expiresAt: { gt: now },
        },
        data: {
          status: RescheduleStatus.ACCEPTED,
          acceptedOptionId: chosen.id,
          respondedAt: now,
        },
      });
      // Guarded on the old slot and time: an accept racing a cancellation,
      // the start-time sweep or another accept loses here.
      const moved = await tx.session.updateMany({
        where: {
          id: session.id,
          status: SessionStatus.PAID_ESCROW,
          slotId: session.slotId,
          startsAt: session.startsAt,
        },
        data: {
          slotId: chosen.slotId as string,
          startsAt: chosen.startsAt,
          endsAt: chosen.endsAt,
          rescheduleCount: { increment: 1 },
          rescheduledAt: now,
          // The update .ics must outrank the invite (and earlier updates).
          calendarSequence: { increment: 1 },
          cancelTierFloor: floor === CancellationTier.FREE ? null : floor,
        },
      });
      if (accepted.count === 0 || moved.count === 0) {
        throw new ConflictException('This proposal can no longer be accepted.');
      }
      await releaseHeldSlots(
        tx,
        proposal.options
          .filter((option) => option.id !== chosen.id)
          .map((option) => option.slotId),
        now,
      );
      await releaseHeldSlots(tx, [session.slotId], now);
      const payload = {
        rescheduleId: proposal.id,
        fromStartsAt: session.startsAt.toISOString(),
      };
      await this.notifications.enqueue(tx, [
        {
          kind: NotificationKind.RESCHEDULE_ACCEPTED_PLAYER,
          sessionId: session.id,
          recipientId: session.playerId,
          dedupeSuffix: proposal.id,
          payload,
        },
        {
          kind: NotificationKind.RESCHEDULE_ACCEPTED_COACH,
          sessionId: session.id,
          recipientId: session.proProfile.userId,
          dedupeSuffix: proposal.id,
          payload,
        },
      ]);
    });
    this.logger.log(
      `Session ${session.id} moved to ${chosen.startsAt.toISOString()} (proposal ${proposal.id})`,
    );
    this.track(LIFECYCLE_EVENTS.rescheduleAccepted, user, session.id, {
      proposedBy: proposal.byCoach ? 'coach' : 'player',
    });
    return this.bookings.sessionResponse(session.id, user);
  }

  async decline(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    const proposal = await this.openProposal(session.id);
    if (proposal.proposedById === user.id) {
      throw new ForbiddenException('The other party answers this proposal.');
    }
    await this.close(proposal, RescheduleStatus.DECLINED, [
      {
        kind: NotificationKind.RESCHEDULE_DECLINED,
        sessionId: session.id,
        recipientId: proposal.proposedById,
      },
    ]);
    this.track(LIFECYCLE_EVENTS.rescheduleDeclined, user, session.id, {});
    return this.bookings.sessionResponse(session.id, user);
  }

  async withdraw(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionResponse> {
    const session = await this.requireParty(user, sessionId);
    const proposal = await this.openProposal(session.id);
    if (proposal.proposedById !== user.id) {
      throw new ForbiddenException('Only the proposer can withdraw.');
    }
    await this.close(proposal, RescheduleStatus.WITHDRAWN, [
      {
        kind: NotificationKind.RESCHEDULE_WITHDRAWN,
        sessionId: session.id,
        recipientId: proposal.byCoach
          ? session.playerId
          : session.proProfile.userId,
      },
    ]);
    return this.bookings.sessionResponse(session.id, user);
  }

  /**
   * Closes whatever the clock or the session's fate left open: proposals past
   * their expiry (both parties are told) and proposals on sessions that are
   * no longer movable — cancelled or started (silently superseded).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      await this.sweepOnce();
    } catch (error) {
      this.logger.error(
        'Reschedule sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sweepOnce(now = new Date()): Promise<void> {
    const stale = await this.prisma.sessionReschedule.findMany({
      where: {
        status: RescheduleStatus.OPEN,
        OR: [
          { expiresAt: { lte: now } },
          { session: { status: { not: SessionStatus.PAID_ESCROW } } },
        ],
      },
      select: {
        id: true,
        sessionId: true,
        proposedById: true,
        byCoach: true,
        options: { select: { id: true, slotId: true } },
        session: {
          select: {
            status: true,
            playerId: true,
            proProfile: { select: { userId: true } },
          },
        },
      },
      take: 100,
    });
    for (const proposal of stale) {
      try {
        const movable = proposal.session.status === SessionStatus.PAID_ESCROW;
        await this.close(
          proposal,
          movable ? RescheduleStatus.EXPIRED : RescheduleStatus.SUPERSEDED,
          movable
            ? [
                proposal.session.playerId,
                proposal.session.proProfile.userId,
              ].map((recipientId) => ({
                kind: NotificationKind.RESCHEDULE_EXPIRED,
                sessionId: proposal.sessionId,
                recipientId,
              }))
            : [],
          now,
        );
      } catch (error) {
        // Someone answered at the same moment: their outcome stands.
        this.logger.warn(
          `Proposal ${proposal.id} not swept: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /** OPEN → a closed status, releasing every offered slot, in one transaction. */
  private async close(
    proposal: {
      id: string;
      options: Array<{ slotId: string | null }>;
    },
    status: RescheduleStatus,
    notify: Array<{
      kind: NotificationKind;
      sessionId: string;
      recipientId: string;
    }>,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const closed = await tx.sessionReschedule.updateMany({
        where: { id: proposal.id, status: RescheduleStatus.OPEN },
        data: { status, respondedAt: now },
      });
      if (closed.count === 0) {
        throw new ConflictException('This proposal is no longer open.');
      }
      await releaseHeldSlots(
        tx,
        proposal.options.map((option) => option.slotId),
        now,
      );
      await this.notifications.enqueue(
        tx,
        notify.map((row) => ({ ...row, dedupeSuffix: proposal.id })),
      );
    });
  }

  private async requireParty(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<ProposalSession> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: PROPOSAL_SESSION_SELECT,
    });
    if (
      !session ||
      (session.playerId !== user.id && session.proProfile.userId !== user.id)
    ) {
      throw new NotFoundException();
    }
    return session;
  }

  private async openProposal(sessionId: string) {
    const proposal = await this.prisma.sessionReschedule.findFirst({
      where: { sessionId, status: RescheduleStatus.OPEN },
      select: {
        id: true,
        proposedById: true,
        byCoach: true,
        options: {
          select: { id: true, slotId: true, startsAt: true, endsAt: true },
        },
      },
    });
    if (!proposal) {
      throw new ConflictException('This session has no open proposal.');
    }
    return proposal;
  }

  private track(
    event: string,
    user: AuthenticatedUser,
    sessionId: string,
    properties: Record<string, unknown>,
  ): void {
    this.analytics.track({
      event,
      distinctId: user.id,
      properties: { sessionId, role: user.role, ...properties },
    });
  }
}

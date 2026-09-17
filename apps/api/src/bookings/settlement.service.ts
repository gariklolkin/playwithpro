import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CancellationTier,
  DisputeOutcome,
  NotificationKind,
  PaymentStatus,
  SessionStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ANALYTICS,
  LIFECYCLE_EVENTS,
  type Analytics,
} from '../observability/observability';
import type { PaymentProvider } from '../payments/payment-provider';
import { PAYMENT_PROVIDER } from '../payments/payment-provider';
import { PrismaService } from '../prisma/prisma.service';
import { toSharedServiceType } from '../pros/pro-profile.mapper';

/**
 * Moves escrowed money exactly once per held payment. Session status is the
 * source of truth for the direction; the conditional HELD→terminal update is
 * the claim, so concurrent settlers (user action + sweep) never double-move.
 * A provider failure reverts the claim and the sweep retries — a session can
 * therefore be completed/resolved/cancelled while its payment briefly stays
 * HELD, never the other way around.
 *
 * A late player cancellation (partial or no refund) is the one case that
 * waits: the payment stays HELD until the session's original start time so
 * the coach or an admin can still waive the fee, then settles with a single
 * partial release. The claim is also conditional on the payment row's
 * version: a waiver touches the row in its own transaction, so a settlement
 * that read it before the waiver loses its claim and the next pass refunds.
 */
@Injectable()
export class SettlementService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(ANALYTICS) private readonly analytics: Analytics,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    void this.sweep();
  }

  /** Settles the session's held payment if its status owes a money movement. */
  async settle(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        playerId: true,
        serviceType: true,
        priceMinor: true,
        currency: true,
        startsAt: true,
        cancellationTier: true,
        cancellationRefundMinor: true,
        feeWaivedAt: true,
        proProfile: { select: { userId: true } },
        dispute: { select: { outcome: true } },
      },
    });
    if (!session) {
      return;
    }
    const owed = this.movementFor(session, new Date());
    if (owed === null) {
      return;
    }
    const { target, refundMinor } = owed;
    const held = await this.prisma.payment.findFirst({
      where: { sessionId, status: PaymentStatus.HELD },
    });
    if (!held || held.providerRef === null) {
      return;
    }
    const claimed = await this.prisma.payment.updateMany({
      where: {
        id: held.id,
        status: PaymentStatus.HELD,
        updatedAt: held.updatedAt,
      },
      data: { status: target, refundedMinor: refundMinor },
    });
    if (claimed.count === 0) {
      return;
    }
    try {
      if (target === PaymentStatus.RELEASED) {
        await this.payments.release(
          held.providerRef,
          refundMinor ? { refundMinor } : undefined,
        );
      } else {
        await this.payments.refund(held.providerRef);
      }
      this.logger.log(
        `Settled payment ${held.id} for session ${sessionId} as ${target}${
          refundMinor ? ` (refunded part ${refundMinor})` : ''
        }`,
      );
      // Money events are emitted here, after the exactly-once movement, so
      // the funnel counts each release/refund once — keyed by the payer.
      // The outcome emails follow the money: written once the movement is
      // recorded, never before (a retry lands here again with the same key).
      if (session.status !== SessionStatus.CANCELLED) {
        const [playerKind, coachKind] =
          session.status === SessionStatus.RESOLVED
            ? [
                NotificationKind.DISPUTE_RESOLVED_PLAYER,
                NotificationKind.DISPUTE_RESOLVED_COACH,
              ]
            : [
                NotificationKind.SESSION_COMPLETED_PLAYER,
                NotificationKind.SESSION_COMPLETED_COACH,
              ];
        await this.notifications.enqueue(this.prisma, [
          { kind: playerKind, sessionId, recipientId: session.playerId },
          {
            kind: coachKind,
            sessionId,
            recipientId: session.proProfile.userId,
          },
        ]);
      }
      this.analytics.track({
        // A late cancellation paying the coach is not a completed session.
        event:
          target === PaymentStatus.REFUNDED
            ? LIFECYCLE_EVENTS.sessionRefunded
            : session.status === SessionStatus.CANCELLED
              ? LIFECYCLE_EVENTS.cancellationSettled
              : LIFECYCLE_EVENTS.sessionCompleted,
        distinctId: session.playerId,
        properties: {
          sessionId,
          serviceType: toSharedServiceType(session.serviceType),
          amountMinor: session.priceMinor,
          currency: session.currency,
          sessionStatus: session.status.toLowerCase(),
          refundedMinor: refundMinor ?? 0,
        },
      });
    } catch (error) {
      await this.prisma.payment.updateMany({
        where: { id: held.id, status: target },
        data: { status: PaymentStatus.HELD, refundedMinor: null },
      });
      this.logger.error(
        `Provider ${target === PaymentStatus.RELEASED ? 'release' : 'refund'} failed for session ${sessionId}; will retry`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Retries payments left HELD by a provider failure or a crash. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      await this.sweepOnce();
    } catch (error) {
      // The scan itself can fail transiently (e.g. a deadlock against a
      // concurrent TRUNCATE in tests, or a DB blip in production); the next
      // tick retries, and a bootstrap kickoff must never leave an
      // unhandled rejection behind.
      this.logger.error(
        'Settlement sweep failed; retrying on the next tick',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sweepOnce(): Promise<void> {
    const owed = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.HELD,
        session: {
          status: {
            in: [
              SessionStatus.COMPLETED_PAID,
              SessionStatus.RESOLVED,
              SessionStatus.CANCELLED,
            ],
          },
        },
      },
      select: { sessionId: true },
    });
    for (const payment of owed) {
      try {
        await this.settle(payment.sessionId);
      } catch (error) {
        this.logger.error(
          `Failed to settle session ${payment.sessionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * The money movement the session's state owes right now, or null. A
   * completion pays the coach; a release-resolved dispute pays the coach, a
   * refund-resolved one returns the money. A cancellation refunds in full
   * when it was free, waived, or predates the policy (no record); a late one
   * owes nothing until the original start time, then a release carrying the
   * part that goes back to the player.
   */
  private movementFor(
    session: {
      status: SessionStatus;
      startsAt: Date;
      cancellationTier: CancellationTier | null;
      cancellationRefundMinor: number | null;
      feeWaivedAt: Date | null;
      dispute: { outcome: DisputeOutcome | null } | null;
    },
    now: Date,
  ): { target: PaymentStatus; refundMinor: number | null } | null {
    switch (session.status) {
      case SessionStatus.COMPLETED_PAID:
        return { target: PaymentStatus.RELEASED, refundMinor: null };
      case SessionStatus.CANCELLED: {
        const late =
          session.feeWaivedAt === null &&
          (session.cancellationTier === CancellationTier.PARTIAL ||
            session.cancellationTier === CancellationTier.NONE);
        if (!late) {
          return { target: PaymentStatus.REFUNDED, refundMinor: null };
        }
        if (now.getTime() < session.startsAt.getTime()) {
          return null;
        }
        return {
          target: PaymentStatus.RELEASED,
          refundMinor: session.cancellationRefundMinor || null,
        };
      }
      case SessionStatus.RESOLVED:
        return session.dispute?.outcome === DisputeOutcome.RELEASE
          ? { target: PaymentStatus.RELEASED, refundMinor: null }
          : session.dispute?.outcome === DisputeOutcome.REFUND
            ? { target: PaymentStatus.REFUNDED, refundMinor: null }
            : null;
      default:
        return null;
    }
  }
}

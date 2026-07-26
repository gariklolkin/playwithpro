import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminDisputeItem,
  AdminDisputeListResponse,
  DisputeOutcome as SharedDisputeOutcome,
  DisputeStatus as SharedDisputeStatus,
  SessionResponse,
} from '@playwithpro/shared';
import {
  Dispute,
  DisputeOutcome,
  DisputeStatus,
  ServiceType,
  SessionStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { BookingsService } from '../bookings/bookings.service';
import { SessionProgressionService } from '../bookings/session-progression.service';
import { SettlementService } from '../bookings/settlement.service';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';

type DisputeWithSession = Dispute & {
  session: {
    id: string;
    serviceType: ServiceType;
    startsAt: Date;
    endsAt: Date;
    priceMinor: number;
    currency: string;
    platformFeeMinor: number;
    player: { id: string; displayName: string };
    proProfile: { id: string; user: { displayName: string } };
    attendance: Array<{
      userId: string;
      joinedAt: Date;
      leftAt: Date | null;
      user: { displayName: string };
    }>;
  };
};

const DISPUTE_INCLUDE = {
  session: {
    select: {
      id: true,
      serviceType: true,
      startsAt: true,
      endsAt: true,
      priceMinor: true,
      currency: true,
      platformFeeMinor: true,
      player: { select: { id: true, displayName: true } },
      proProfile: {
        select: { id: true, user: { select: { displayName: true } } },
      },
      attendance: {
        orderBy: { joinedAt: 'asc' as const },
        select: {
          userId: true,
          joinedAt: true,
          leftAt: true,
          user: { select: { displayName: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly progression: SessionProgressionService,
    private readonly settlement: SettlementService,
  ) {}

  /**
   * Player-only escape hatch from the confirmation window: flips the session
   * to DISPUTED (freezing auto-confirm and the payout) and records the
   * reason. The status flip and the dispute row are one transaction, and the
   * conditional update makes a second open — or a race with the auto-confirm
   * sweep — lose cleanly.
   */
  async open(
    user: AuthenticatedUser,
    sessionId: string,
    reason: string,
  ): Promise<SessionResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        playerId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        proProfile: { select: { userId: true } },
      },
    });
    if (
      !session ||
      (session.playerId !== user.id && session.proProfile.userId !== user.id)
    ) {
      throw new NotFoundException();
    }
    if (session.playerId !== user.id) {
      throw new ForbiddenException('Only the player can open a dispute.');
    }
    // Persist the clock-derived status first so a session whose end time
    // just passed is disputable without waiting for the sweep.
    await this.progression.normalize(session);
    await this.prisma.$transaction(async (tx) => {
      const disputed = await tx.session.updateMany({
        where: { id: session.id, status: SessionStatus.AWAITING_CONFIRMATION },
        data: { status: SessionStatus.DISPUTED },
      });
      if (disputed.count === 0) {
        throw new ConflictException('This session cannot be disputed.');
      }
      await tx.dispute.create({
        data: { sessionId: session.id, openedById: user.id, reason },
      });
    });
    this.logger.log(`Dispute opened on session ${session.id}`);
    return this.bookings.sessionResponse(session.id);
  }

  async listForAdmin(): Promise<AdminDisputeListResponse> {
    const disputes = await this.prisma.dispute.findMany({
      include: DISPUTE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    const items = disputes.map((dispute) => this.toAdminItem(dispute));
    return {
      open: items.filter((item) => item.status === SharedDisputeStatus.Open),
      resolved: items
        .filter((item) => item.status === SharedDisputeStatus.Resolved)
        .reverse(),
    };
  }

  /**
   * Admin verdict: exactly one outcome, applied exactly once. The dispute row
   * is the claim (conditional OPEN→RESOLVED), the session follows, and the
   * settlement moves the money after the transaction commits.
   */
  async resolve(
    adminId: string,
    disputeId: string,
    outcome: SharedDisputeOutcome,
    note?: string,
  ): Promise<AdminDisputeItem> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, sessionId: true },
    });
    if (!dispute) {
      throw new NotFoundException();
    }
    const prismaOutcome =
      outcome === SharedDisputeOutcome.Release
        ? DisputeOutcome.RELEASE
        : DisputeOutcome.REFUND;
    await this.prisma.$transaction(async (tx) => {
      const resolved = await tx.dispute.updateMany({
        where: { id: dispute.id, status: DisputeStatus.OPEN },
        data: {
          status: DisputeStatus.RESOLVED,
          outcome: prismaOutcome,
          resolvedById: adminId,
          adminNote: note ?? null,
          resolvedAt: new Date(),
        },
      });
      if (resolved.count === 0) {
        throw new ConflictException('This dispute is already resolved.');
      }
      await tx.session.updateMany({
        where: { id: dispute.sessionId, status: SessionStatus.DISPUTED },
        data: { status: SessionStatus.RESOLVED },
      });
    });
    await this.settlement.settle(dispute.sessionId);
    this.logger.log(
      `Dispute ${dispute.id} resolved as ${outcome} by admin ${adminId}`,
    );
    const fresh = await this.prisma.dispute.findUniqueOrThrow({
      where: { id: dispute.id },
      include: DISPUTE_INCLUDE,
    });
    return this.toAdminItem(fresh);
  }

  private toAdminItem(dispute: DisputeWithSession): AdminDisputeItem {
    return {
      id: dispute.id,
      sessionId: dispute.session.id,
      status:
        dispute.status === DisputeStatus.OPEN
          ? SharedDisputeStatus.Open
          : SharedDisputeStatus.Resolved,
      outcome:
        dispute.outcome === DisputeOutcome.RELEASE
          ? SharedDisputeOutcome.Release
          : dispute.outcome === DisputeOutcome.REFUND
            ? SharedDisputeOutcome.Refund
            : null,
      reason: dispute.reason,
      adminNote: dispute.adminNote,
      openedAt: dispute.createdAt.toISOString(),
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      serviceType: toSharedServiceType(dispute.session.serviceType),
      startsAt: dispute.session.startsAt.toISOString(),
      endsAt: dispute.session.endsAt.toISOString(),
      amountMinor: dispute.session.priceMinor,
      currency: dispute.session.currency,
      feeMinor: dispute.session.platformFeeMinor,
      player: dispute.session.player,
      coach: {
        id: dispute.session.proProfile.id,
        displayName: dispute.session.proProfile.user.displayName,
      },
      attendance: dispute.session.attendance.map((entry) => ({
        userId: entry.userId,
        displayName: entry.user.displayName,
        joinedAt: entry.joinedAt.toISOString(),
        leftAt: entry.leftAt?.toISOString() ?? null,
      })),
    };
  }
}

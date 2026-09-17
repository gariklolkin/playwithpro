import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  DisputeOutcome,
  DisputeResolvedVia,
  DisputeStatus,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementService } from './settlement.service';

/** Fixed reason codes of a system resolution; rendered from the catalogs. */
export const SYSTEM_NOTE_NO_COACH_RESPONSE = 'NO_COACH_RESPONSE';

/** Who is resolving: an admin's verdict, the response deadline, or the player's confirmation. */
export type DisputeResolver =
  | { type: 'admin'; userId: string; note?: string }
  | { type: 'system'; noteCode: string }
  | { type: 'player'; userId: string };

/**
 * The one way a dispute is resolved, whoever resolves it: the dispute row is
 * the claim (conditional OPEN→RESOLVED), the session follows, and the
 * settlement moves the money after the transaction commits. Concurrent
 * resolvers — an admin, the deadline sweep, the player confirming — race on
 * the conditional update, so exactly one verdict is recorded and money moves
 * exactly once.
 */
@Injectable()
export class DisputeResolutionService {
  private readonly logger = new Logger(DisputeResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  async resolve(
    dispute: { id: string; sessionId: string },
    outcome: DisputeOutcome,
    resolver: DisputeResolver,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const resolved = await tx.dispute.updateMany({
        // The deadline never beats a coach's response: both are conditional
        // updates on the same row, so whichever lands first wins.
        where: {
          id: dispute.id,
          status: DisputeStatus.OPEN,
          ...(resolver.type === 'system' ? { coachRespondedAt: null } : {}),
        },
        data: {
          status: DisputeStatus.RESOLVED,
          outcome,
          resolvedById: resolver.type === 'system' ? null : resolver.userId,
          resolvedVia:
            resolver.type === 'admin'
              ? DisputeResolvedVia.ADMIN
              : resolver.type === 'system'
                ? DisputeResolvedVia.SYSTEM
                : DisputeResolvedVia.PLAYER_CONFIRMATION,
          systemNoteCode: resolver.type === 'system' ? resolver.noteCode : null,
          adminNote: resolver.type === 'admin' ? (resolver.note ?? null) : null,
          // A resolved dispute has no pending deadline.
          responseDueAt: null,
          resolvedAt: new Date(),
        },
      });
      if (resolved.count === 0) {
        throw new ConflictException('This dispute is already resolved.');
      }
      await tx.session.updateMany({
        where: { id: dispute.sessionId, status: SessionStatus.DISPUTED },
        data: {
          status: SessionStatus.RESOLVED,
          ...(resolver.type === 'player'
            ? { playerConfirmedAt: new Date() }
            : {}),
        },
      });
    });
    await this.settlement.settle(dispute.sessionId);
    this.logger.log(
      `Dispute ${dispute.id} resolved as ${outcome} by ${resolver.type}`,
    );
  }
}

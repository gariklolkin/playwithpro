import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ParticipantEvent {
  /** Provider room name — the session's roomSlug. */
  roomName: string;
  /** Participant identity — the platform user id. */
  identity: string;
  at: Date;
}

/**
 * Stamps provider-reported connection evidence onto attendance rows. The
 * row itself is created by the join action; this service only enriches it,
 * so a lost webhook never erases the fact that a party tried to join.
 * Every mutation is conditional on a null field, which makes at-least-once
 * webhook delivery idempotent. Unknown rooms/identities are ignored.
 */
@Injectable()
export class AttendanceEvidenceService {
  private readonly logger = new Logger(AttendanceEvidenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordConnected(event: ParticipantEvent): Promise<void> {
    const party = await this.resolveParty(event);
    if (!party) return;
    const { sessionId, userId } = party;

    const latest = await this.prisma.sessionAttendance.findFirst({
      where: { sessionId, userId },
      orderBy: { joinedAt: 'desc' },
    });
    // Duplicate delivery: the same connect time is already on record.
    if (latest?.connectedAt?.getTime() === event.at.getTime()) return;

    if (latest && latest.connectedAt === null && latest.leftAt === null) {
      await this.prisma.sessionAttendance.updateMany({
        where: { id: latest.id, connectedAt: null },
        data: { connectedAt: event.at },
      });
      return;
    }
    // No open row (e.g. the client reconnected on the same token after a
    // drop): the connection itself is the evidence, so record it.
    await this.prisma.sessionAttendance.create({
      data: { sessionId, userId, joinedAt: event.at, connectedAt: event.at },
    });
  }

  async recordLeft(event: ParticipantEvent): Promise<void> {
    const party = await this.resolveParty(event);
    if (!party) return;
    const { sessionId, userId } = party;

    const open = await this.prisma.sessionAttendance.findFirst({
      where: { sessionId, userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
    });
    if (!open) return;
    await this.prisma.sessionAttendance.updateMany({
      where: { id: open.id, leftAt: null },
      data: { leftAt: event.at },
    });
  }

  private async resolveParty(
    event: ParticipantEvent,
  ): Promise<{ sessionId: string; userId: string } | null> {
    const session = await this.prisma.session.findUnique({
      where: { roomSlug: event.roomName },
      select: {
        id: true,
        playerId: true,
        proProfile: { select: { userId: true } },
      },
    });
    if (!session) {
      this.logger.warn(`Webhook for unknown room ${event.roomName}; ignored`);
      return null;
    }
    const isParty =
      session.playerId === event.identity ||
      session.proProfile.userId === event.identity;
    if (!isParty) {
      this.logger.warn(
        `Webhook identity ${event.identity} is not a party of ${session.id}; ignored`,
      );
      return null;
    }
    return { sessionId: session.id, userId: event.identity };
  }
}

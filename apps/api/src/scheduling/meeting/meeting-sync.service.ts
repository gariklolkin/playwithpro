import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus, MeetingSyncStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MEETING_PROVIDER } from './meeting-provider';
import type { MeetingProvider } from './meeting-provider';

const MAX_SYNC_ATTEMPTS = 10;

/**
 * Pushes bookings to the calendar provider after they are committed.
 * Bookings never wait for this: the DB row is the source of truth and the
 * verification page shows "link appears shortly" until the sync lands.
 */
@Injectable()
export class MeetingSyncService {
  private readonly logger = new Logger(MeetingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEETING_PROVIDER) private readonly provider: MeetingProvider,
  ) {}

  /** Best-effort immediate sync; failures are retried by the cron. */
  async syncBooking(bookingId: string): Promise<void> {
    const booking = await this.prisma.verificationBooking.findUnique({
      where: { id: bookingId },
      include: {
        slot: true,
        request: { include: { profile: { include: { user: true } } } },
      },
    });
    if (!booking || booking.status !== BookingStatus.SCHEDULED) {
      return;
    }
    try {
      const data: Prisma.VerificationBookingUpdateInput = {
        syncStatus: MeetingSyncStatus.SYNCED,
      };
      if (booking.googleEventId) {
        await this.provider.update(booking.googleEventId, {
          startsAt: booking.slot.startsAt,
          endsAt: booking.slot.endsAt,
        });
      } else {
        const meeting = await this.provider.create({
          bookingId: booking.id,
          summary: 'PlayWithPro verification call',
          description:
            'Short identity video call to verify your professional profile.',
          startsAt: booking.slot.startsAt,
          endsAt: booking.slot.endsAt,
          attendeeEmail: booking.request.profile.user.email,
        });
        data.googleEventId = meeting.externalId;
        data.meetUrl = meeting.joinUrl;
      }
      await this.prisma.verificationBooking.update({
        where: { id: booking.id },
        data,
      });
    } catch (error) {
      this.logger.error(
        `Calendar sync failed for booking ${booking.id}`,
        error as Error,
      );
      await this.prisma.verificationBooking.update({
        where: { id: booking.id },
        data: {
          syncStatus: MeetingSyncStatus.FAILED,
          syncAttempts: { increment: 1 },
        },
      });
    }
  }

  /** Best-effort event removal on cancellations; never throws. */
  async cancelEvent(googleEventId: string | null): Promise<void> {
    if (!googleEventId) {
      return;
    }
    try {
      await this.provider.cancel(googleEventId);
    } catch (error) {
      this.logger.warn(
        `Failed to cancel event ${googleEventId}`,
        error as Error,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryPending(): Promise<void> {
    const stale = await this.prisma.verificationBooking.findMany({
      where: {
        status: BookingStatus.SCHEDULED,
        syncStatus: {
          in: [MeetingSyncStatus.PENDING, MeetingSyncStatus.FAILED],
        },
        syncAttempts: { lt: MAX_SYNC_ATTEMPTS },
        updatedAt: { lt: new Date(Date.now() - 60_000) },
      },
      select: { id: true },
      take: 20,
    });
    for (const { id } of stale) {
      await this.syncBooking(id);
    }
  }
}

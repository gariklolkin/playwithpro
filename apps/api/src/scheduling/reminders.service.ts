import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingNotificationsService } from './scheduling-notifications.service';

const HOUR = 3_600_000;

/**
 * Reminder delivery by polling Postgres: idempotent via the sent-at stamps,
 * survives restarts, and catches up after downtime (the window keys off the
 * slot start, not the exact minute). No queue infrastructure needed.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: SchedulingNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async deliverDue(): Promise<void> {
    await this.deliver(24, 'reminder24hSentAt');
    await this.deliver(1, 'reminder1hSentAt');
  }

  private async deliver(
    hoursBefore: number,
    stamp: 'reminder24hSentAt' | 'reminder1hSentAt',
  ): Promise<void> {
    const now = Date.now();
    const due = await this.prisma.verificationBooking.findMany({
      where: {
        status: BookingStatus.SCHEDULED,
        [stamp]: null,
        slot: {
          startsAt: {
            lte: new Date(now + hoursBefore * HOUR),
            gt: new Date(now),
          },
        },
      },
      include: {
        slot: true,
        request: { include: { profile: { include: { user: true } } } },
      },
      take: 50,
    });
    for (const booking of due) {
      // A last-minute booking gets its confirmation email instead; skip
      // reminders whose window was already inside the booking moment.
      const withinWindowAtBooking =
        booking.createdAt.getTime() >
        booking.slot.startsAt.getTime() - hoursBefore * HOUR;
      if (!withinWindowAtBooking) {
        await this.notify.reminder(
          booking.request.profile.user,
          booking,
          booking.slot,
          hoursBefore,
        );
      }
      await this.prisma.verificationBooking.update({
        where: { id: booking.id },
        data: { [stamp]: new Date() },
      });
    }
    if (due.length > 0) {
      this.logger.log(`Processed ${due.length} ${hoursBefore}h reminder(s)`);
    }
  }
}

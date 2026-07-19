import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Role,
  User,
  VerificationBooking,
  VerificationSlot,
} from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildVerificationCallIcs } from './ics';

/** Formats meeting emails in the coach's own timezone and builds the .ics invite. */
@Injectable()
export class SchedulingNotificationsService {
  private readonly manageUrl: string;
  private readonly organizerEmail: string;

  constructor(
    config: ConfigService,
    private readonly mailer: MailerService,
    private readonly prisma: PrismaService,
  ) {
    const webUrl = config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
    this.manageUrl = `${webUrl}/dashboard/verification`;
    const from =
      config.get<string>('SMTP_FROM') ?? 'no-reply@playwithpro.local';
    this.organizerEmail = /<([^>]+)>/.exec(from)?.[1] ?? from;
  }

  bookingConfirmed(
    user: User,
    booking: VerificationBooking,
    slot: VerificationSlot,
  ): Promise<void> {
    return this.mailer.sendBookingConfirmedEmail({
      to: user.email,
      displayName: user.displayName,
      whenLine: this.whenLine(slot.startsAt, user.timezone),
      meetUrl: booking.meetUrl,
      manageUrl: this.manageUrl,
      ics: this.ics(user, booking, slot),
    });
  }

  bookingRescheduled(
    user: User,
    booking: VerificationBooking,
    slot: VerificationSlot,
  ): Promise<void> {
    return this.mailer.sendBookingRescheduledEmail({
      to: user.email,
      displayName: user.displayName,
      whenLine: this.whenLine(slot.startsAt, user.timezone),
      meetUrl: booking.meetUrl,
      manageUrl: this.manageUrl,
      ics: this.ics(user, booking, slot),
    });
  }

  reminder(
    user: User,
    booking: VerificationBooking,
    slot: VerificationSlot,
    hoursBefore: number,
  ): Promise<void> {
    return this.mailer.sendBookingReminderEmail({
      to: user.email,
      displayName: user.displayName,
      whenLine: this.whenLine(slot.startsAt, user.timezone),
      meetUrl: booking.meetUrl,
      manageUrl: this.manageUrl,
      hoursBefore,
    });
  }

  cancelledByAdmin(user: User, slot: VerificationSlot): Promise<void> {
    return this.mailer.sendBookingCancelledByAdminEmail({
      to: user.email,
      displayName: user.displayName,
      whenLine: this.whenLine(slot.startsAt, user.timezone),
      manageUrl: this.manageUrl,
    });
  }

  noShow(user: User, requestCancelled: boolean): Promise<void> {
    return this.mailer.sendBookingNoShowEmail({
      to: user.email,
      displayName: user.displayName,
      requestCancelled,
      manageUrl: this.manageUrl,
    });
  }

  async coachCancelled(coach: User, detail: string): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { email: true },
    });
    await this.mailer.sendCoachCancelledNoticeEmail(
      admins.map((a) => a.email),
      coach.displayName,
      detail,
    );
  }

  private whenLine(startsAt: Date, timezone: string): string {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(startsAt);
    return `${formatted} (${timezone})`;
  }

  private ics(
    user: User,
    booking: VerificationBooking,
    slot: VerificationSlot,
  ): string {
    return buildVerificationCallIcs({
      bookingId: booking.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      meetUrl: booking.meetUrl,
      organizerEmail: this.organizerEmail,
      attendeeEmail: user.email,
      manageUrl: this.manageUrl,
    });
  }
}

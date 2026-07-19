import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminVerificationItem,
  VerificationState as SharedVerificationState,
} from '@playwithpro/shared';
import {
  BookingStatus,
  ProProfileStatus,
  SlotStatus,
  VerificationState,
} from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { PROFILE_INCLUDE, toProfileResponse } from '../pros/pro-profile.mapper';
import { MeetingSyncService } from '../scheduling/meeting/meeting-sync.service';

/** States an admin can still act on. */
const ACTIVE_STATES: VerificationState[] = [
  VerificationState.AWAITING_SCHEDULING,
  VerificationState.SCHEDULED,
  VerificationState.IN_PROGRESS,
];

/** Approval is expected only around the identity call. */
const APPROVABLE_STATES: VerificationState[] = [
  VerificationState.SCHEDULED,
  VerificationState.IN_PROGRESS,
];

const QUEUE_INCLUDE = {
  bookings: {
    orderBy: { createdAt: 'desc' as const },
    include: { slot: true },
  },
  profile: {
    include: {
      ...PROFILE_INCLUDE,
      user: true,
    },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly sync: MeetingSyncService,
  ) {}

  async listQueue(): Promise<AdminVerificationItem[]> {
    const requests = await this.prisma.verificationRequest.findMany({
      where: { state: { in: ACTIVE_STATES } },
      orderBy: { createdAt: 'asc' },
      include: QUEUE_INCLUDE,
    });
    // Soonest meeting first; requests without a booking need no admin action
    // yet, so they follow, oldest submission first.
    const meetingTime = (request: (typeof requests)[number]) =>
      this.scheduledBooking(request)?.slot.startsAt.getTime() ??
      Number.POSITIVE_INFINITY;
    requests.sort(
      (a, b) =>
        meetingTime(a) - meetingTime(b) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return requests.map((request) => {
      const booking = this.scheduledBooking(request);
      return {
        requestId: request.id,
        submittedAt: request.createdAt.toISOString(),
        state: request.state.toLowerCase() as SharedVerificationState,
        meeting: booking
          ? {
              bookingId: booking.id,
              startsAt: booking.slot.startsAt.toISOString(),
              endsAt: booking.slot.endsAt.toISOString(),
              meetUrl: booking.meetUrl,
            }
          : null,
        profile: toProfileResponse(request.profile),
        user: {
          id: request.profile.user.id,
          email: request.profile.user.email,
          displayName: request.profile.user.displayName,
        },
      };
    });
  }

  async approve(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.activeRequest(requestId);
    if (!APPROVABLE_STATES.includes(request.state)) {
      throw new ConflictException(
        'Approval happens on the identity call — the coach has not scheduled one yet.',
      );
    }
    const booking = this.scheduledBooking(request);
    await this.prisma.$transaction(async (tx) => {
      await tx.verificationRequest.update({
        where: { id: request.id },
        data: {
          state: VerificationState.VERIFIED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      });
      await tx.proProfile.update({
        where: { id: request.profileId },
        data: { status: ProProfileStatus.VERIFIED },
      });
      if (booking) {
        await tx.verificationBooking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.COMPLETED },
        });
        await tx.verificationSlot.update({
          where: { id: booking.slotId },
          data: { status: SlotStatus.REMOVED },
        });
      }
    });
    await this.mailer.sendVerificationApprovedEmail(
      request.profile.user.email,
      request.profile.user.displayName,
    );
  }

  async reject(
    requestId: string,
    reviewerId: string,
    note: string,
  ): Promise<void> {
    const request = await this.activeRequest(requestId);
    const booking = this.scheduledBooking(request);
    await this.prisma.$transaction(async (tx) => {
      await tx.verificationRequest.update({
        where: { id: request.id },
        data: {
          state: VerificationState.REJECTED,
          adminNote: note.trim(),
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      });
      await tx.proProfile.update({
        where: { id: request.profileId },
        data: { status: ProProfileStatus.REJECTED },
      });
      if (booking) {
        await tx.verificationBooking.update({
          where: { id: booking.id },
          data: { status: BookingStatus.CANCELLED_BY_ADMIN },
        });
        await tx.verificationSlot.update({
          where: { id: booking.slotId },
          data: { status: SlotStatus.OPEN },
        });
      }
    });
    if (booking) {
      await this.sync.cancelEvent(booking.googleEventId);
    }
    await this.mailer.sendVerificationRejectedEmail(
      request.profile.user.email,
      request.profile.user.displayName,
      note.trim(),
    );
  }

  private async activeRequest(requestId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      include: {
        bookings: true,
        profile: { include: { user: true } },
      },
    });
    if (!request) {
      throw new NotFoundException();
    }
    if (!ACTIVE_STATES.includes(request.state)) {
      throw new ConflictException('This request has already been resolved.');
    }
    return request;
  }

  private scheduledBooking<T extends { status: BookingStatus }>(request: {
    bookings: T[];
  }): T | undefined {
    return request.bookings.find(
      (booking) => booking.status === BookingStatus.SCHEDULED,
    );
  }
}

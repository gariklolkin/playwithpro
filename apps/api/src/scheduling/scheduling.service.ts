import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminBookingItem,
  AdminSlotItem,
  BOOKING_MIN_NOTICE_HOURS,
  MAX_NO_SHOWS,
  BookingStatus as SharedBookingStatus,
  MeetingSyncStatus as SharedMeetingSyncStatus,
  ProProfileResponse,
  RESCHEDULE_CUTOFF_HOURS,
  VerificationSlotResponse,
  VerificationState as SharedVerificationState,
} from '@playwithpro/shared';
import {
  BookingStatus,
  Prisma,
  ProProfileStatus,
  SlotStatus,
  VerificationState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PROFILE_INCLUDE, toProfileResponse } from '../pros/pro-profile.mapper';
import { MeetingSyncService } from './meeting/meeting-sync.service';
import { SchedulingNotificationsService } from './scheduling-notifications.service';

const HOUR = 3_600_000;

const BOOKING_INCLUDE = {
  slot: true,
  request: { include: { profile: { include: { user: true } } } },
} satisfies Prisma.VerificationBookingInclude;

type BookingWithContext = Prisma.VerificationBookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: MeetingSyncService,
    private readonly notify: SchedulingNotificationsService,
  ) {}

  // ---------- coach ----------

  async listOpenSlots(): Promise<VerificationSlotResponse[]> {
    const slots = await this.prisma.verificationSlot.findMany({
      where: { status: SlotStatus.OPEN, startsAt: { gt: this.minStart() } },
      orderBy: { startsAt: 'asc' },
    });
    return slots.map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    }));
  }

  async book(userId: string, slotId: string): Promise<ProProfileResponse> {
    const { profile, request } = await this.coachRequest(userId);
    if (!profile.user.emailVerifiedAt) {
      // Confirmations, reminders and the meeting invite all go to this
      // address; a booking without a working email is a guaranteed no-show.
      throw new ForbiddenException(
        'Confirm your email address before booking the verification call.',
      );
    }
    if (request.state !== VerificationState.AWAITING_SCHEDULING) {
      throw new ConflictException(
        'Your verification request is not awaiting scheduling.',
      );
    }
    await this.assertBookable(slotId);

    const bookingId = await this.prisma.$transaction(async (tx) => {
      await this.claimSlot(tx, slotId);
      const booking = await tx.verificationBooking.create({
        data: { slotId, requestId: request.id },
      });
      await tx.verificationRequest.update({
        where: { id: request.id },
        data: { state: VerificationState.SCHEDULED },
      });
      return booking.id;
    });

    await this.sync.syncBooking(bookingId);
    const booking = await this.prisma.verificationBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { slot: true },
    });
    await this.notify.bookingConfirmed(profile.user, booking, booking.slot);
    return this.profileResponse(userId);
  }

  async reschedule(
    userId: string,
    newSlotId: string,
  ): Promise<ProProfileResponse> {
    const { profile, request } = await this.coachRequest(userId);
    const current = this.activeBooking(request);
    this.assertManageable(current.slot.startsAt, 'reschedule');
    await this.assertBookable(newSlotId);

    const bookingId = await this.prisma.$transaction(async (tx) => {
      await this.claimSlot(tx, newSlotId);
      await tx.verificationBooking.update({
        where: { id: current.id },
        data: { status: BookingStatus.RESCHEDULED },
      });
      await tx.verificationSlot.update({
        where: { id: current.slotId },
        data: { status: SlotStatus.OPEN },
      });
      // The calendar event moves with the coach: same event id, new times.
      const booking = await tx.verificationBooking.create({
        data: {
          slotId: newSlotId,
          requestId: request.id,
          googleEventId: current.googleEventId,
          meetUrl: current.meetUrl,
        },
      });
      return booking.id;
    });

    await this.sync.syncBooking(bookingId);
    const booking = await this.prisma.verificationBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { slot: true },
    });
    await this.notify.bookingRescheduled(profile.user, booking, booking.slot);
    return this.profileResponse(userId);
  }

  async cancelByPro(userId: string): Promise<ProProfileResponse> {
    const { profile, request } = await this.coachRequest(userId);
    const current = this.activeBooking(request);
    this.assertManageable(current.slot.startsAt, 'cancel');

    await this.prisma.$transaction([
      this.prisma.verificationBooking.update({
        where: { id: current.id },
        data: { status: BookingStatus.CANCELLED_BY_PRO },
      }),
      this.prisma.verificationSlot.update({
        where: { id: current.slotId },
        data: { status: SlotStatus.OPEN },
      }),
      this.prisma.verificationRequest.update({
        where: { id: request.id },
        data: { state: VerificationState.AWAITING_SCHEDULING },
      }),
    ]);

    await this.sync.cancelEvent(current.googleEventId);
    await this.notify.coachCancelled(
      profile.user,
      `cancelled the verification call scheduled for ${current.slot.startsAt.toISOString()}; the slot is open again.`,
    );
    return this.profileResponse(userId);
  }

  async withdraw(userId: string): Promise<ProProfileResponse> {
    const { profile, request } = await this.coachRequest(userId);
    if (
      request.state !== VerificationState.AWAITING_SCHEDULING &&
      request.state !== VerificationState.SCHEDULED
    ) {
      throw new ConflictException(
        'This verification request can no longer be withdrawn.',
      );
    }
    const current = request.bookings.find(
      (booking) => booking.status === BookingStatus.SCHEDULED,
    );

    await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.verificationBooking.update({
          where: { id: current.id },
          data: { status: BookingStatus.CANCELLED_BY_PRO },
        });
        await tx.verificationSlot.update({
          where: { id: current.slotId },
          data: { status: SlotStatus.OPEN },
        });
      }
      await tx.verificationRequest.update({
        where: { id: request.id },
        data: { state: VerificationState.CANCELLED },
      });
      // Back to draft so the coach can submit a fresh request later.
      await tx.proProfile.update({
        where: { id: profile.id },
        data: { status: ProProfileStatus.DRAFT },
      });
    });

    if (current) {
      await this.sync.cancelEvent(current.googleEventId);
    }
    await this.notify.coachCancelled(
      profile.user,
      'withdrew their verification request.',
    );
    return this.profileResponse(userId);
  }

  // ---------- admin ----------

  async createSlots(
    adminId: string,
    slots: Array<{ startsAt: string; endsAt: string }>,
  ): Promise<AdminSlotItem[]> {
    const now = new Date();
    const parsed = slots.map(({ startsAt, endsAt }) => ({
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    }));
    for (const slot of parsed) {
      if (slot.endsAt <= slot.startsAt) {
        throw new BadRequestException('A slot must end after it starts.');
      }
      if (slot.startsAt <= now) {
        throw new BadRequestException('Slots must be in the future.');
      }
    }
    // Idempotent batch publishing: re-posting a pattern skips existing starts.
    const existing = await this.prisma.verificationSlot.findMany({
      where: {
        status: { not: SlotStatus.REMOVED },
        startsAt: { in: parsed.map((slot) => slot.startsAt) },
      },
      select: { startsAt: true },
    });
    const taken = new Set(existing.map((slot) => slot.startsAt.getTime()));
    const fresh = parsed.filter((slot) => !taken.has(slot.startsAt.getTime()));
    if (fresh.length > 0) {
      await this.prisma.verificationSlot.createMany({
        data: fresh.map((slot) => ({ ...slot, createdById: adminId })),
      });
    }
    return this.listSlots();
  }

  async listSlots(): Promise<AdminSlotItem[]> {
    const slots = await this.prisma.verificationSlot.findMany({
      where: {
        status: { not: SlotStatus.REMOVED },
        endsAt: { gt: new Date(Date.now() - 24 * HOUR) },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        bookings: {
          where: { status: BookingStatus.SCHEDULED },
          include: {
            request: { include: { profile: { include: { user: true } } } },
          },
        },
      },
    });
    return slots.map((slot) => {
      const user = slot.bookings[0]?.request.profile.user;
      return {
        id: slot.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        status: slot.status.toLowerCase() as AdminSlotItem['status'],
        bookedBy: user
          ? { id: user.id, displayName: user.displayName, email: user.email }
          : null,
      };
    });
  }

  async removeSlot(slotId: string, force: boolean): Promise<AdminSlotItem[]> {
    const slot = await this.prisma.verificationSlot.findUnique({
      where: { id: slotId },
      include: {
        bookings: { where: { status: BookingStatus.SCHEDULED } },
      },
    });
    if (!slot || slot.status === SlotStatus.REMOVED) {
      throw new NotFoundException();
    }
    const active = slot.bookings[0];
    if (active) {
      if (!force) {
        throw new ConflictException(
          'This slot is booked; removing it cancels the meeting.',
        );
      }
      await this.cancelBookingByAdmin(active.id, SlotStatus.REMOVED);
      return this.listSlots();
    }
    const removed = await this.prisma.verificationSlot.updateMany({
      where: { id: slotId, status: SlotStatus.OPEN },
      data: { status: SlotStatus.REMOVED },
    });
    if (removed.count === 0) {
      // Booked between our read and the update; ask the admin to reconfirm.
      throw new ConflictException(
        'This slot has just been booked; removing it now cancels the meeting.',
      );
    }
    return this.listSlots();
  }

  async listBookings(): Promise<AdminBookingItem[]> {
    const bookings = await this.prisma.verificationBooking.findMany({
      where: {
        slot: { startsAt: { gt: new Date(Date.now() - 30 * 24 * HOUR) } },
      },
      orderBy: { slot: { startsAt: 'asc' } },
      include: BOOKING_INCLUDE,
    });
    return bookings.map((booking) => this.toAdminBookingItem(booking));
  }

  async startMeeting(bookingId: string): Promise<void> {
    const booking = await this.activeBookingById(bookingId);
    if (booking.request.state !== VerificationState.SCHEDULED) {
      throw new ConflictException('Only a scheduled meeting can be started.');
    }
    await this.prisma.verificationRequest.update({
      where: { id: booking.requestId },
      data: { state: VerificationState.IN_PROGRESS },
    });
  }

  async markNoShow(bookingId: string): Promise<void> {
    const booking = await this.activeBookingById(bookingId);
    const { request } = booking;
    if (
      request.state !== VerificationState.SCHEDULED &&
      request.state !== VerificationState.IN_PROGRESS
    ) {
      throw new ConflictException(
        'This meeting cannot be marked as a no-show.',
      );
    }
    const noShowCount = request.noShowCount + 1;
    const cancelled = noShowCount >= MAX_NO_SHOWS;

    await this.prisma.$transaction(async (tx) => {
      await tx.verificationBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.NO_SHOW },
      });
      // The slot's time has effectively passed; it is consumed, not reopened.
      await tx.verificationSlot.update({
        where: { id: booking.slotId },
        data: { status: SlotStatus.REMOVED },
      });
      await tx.verificationRequest.update({
        where: { id: request.id },
        data: {
          noShowCount,
          state: cancelled
            ? VerificationState.CANCELLED
            : VerificationState.AWAITING_SCHEDULING,
        },
      });
      if (cancelled) {
        await tx.proProfile.update({
          where: { id: request.profileId },
          data: { status: ProProfileStatus.DRAFT },
        });
      }
    });

    await this.sync.cancelEvent(booking.googleEventId);
    await this.notify.noShow(booking.request.profile.user, cancelled);
  }

  async cancelBookingByAdmin(
    bookingId: string,
    slotOutcome: SlotStatus = SlotStatus.OPEN,
  ): Promise<void> {
    const booking = await this.activeBookingById(bookingId);
    await this.prisma.$transaction([
      this.prisma.verificationBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED_BY_ADMIN },
      }),
      this.prisma.verificationSlot.update({
        where: { id: booking.slotId },
        data: { status: slotOutcome },
      }),
      this.prisma.verificationRequest.update({
        where: { id: booking.requestId },
        data: { state: VerificationState.AWAITING_SCHEDULING },
      }),
    ]);
    await this.sync.cancelEvent(booking.googleEventId);
    await this.notify.cancelledByAdmin(
      booking.request.profile.user,
      booking.slot,
    );
  }

  async retrySync(bookingId: string): Promise<void> {
    await this.activeBookingById(bookingId);
    await this.sync.syncBooking(bookingId);
  }

  async profileResponse(userId: string): Promise<ProProfileResponse> {
    const profile = await this.prisma.proProfile.findUniqueOrThrow({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    return toProfileResponse(profile);
  }

  // ---------- internals ----------

  private minStart(): Date {
    return new Date(Date.now() + BOOKING_MIN_NOTICE_HOURS * HOUR);
  }

  private async coachRequest(userId: string) {
    const profile = await this.prisma.proProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        verificationRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { bookings: { include: { slot: true } } },
        },
      },
    });
    const request = profile?.verificationRequests[0];
    if (!profile || !request) {
      throw new ConflictException(
        'Submit your profile for verification first.',
      );
    }
    return { profile, request };
  }

  private activeBooking(request: {
    state: VerificationState;
    bookings: Array<
      Prisma.VerificationBookingGetPayload<{ include: { slot: true } }>
    >;
  }) {
    const current = request.bookings.find(
      (booking) => booking.status === BookingStatus.SCHEDULED,
    );
    if (request.state !== VerificationState.SCHEDULED || !current) {
      throw new ConflictException('There is no scheduled meeting to change.');
    }
    return current;
  }

  private async activeBookingById(
    bookingId: string,
  ): Promise<BookingWithContext> {
    const booking = await this.prisma.verificationBooking.findUnique({
      where: { id: bookingId },
      include: BOOKING_INCLUDE,
    });
    if (!booking) {
      throw new NotFoundException();
    }
    if (booking.status !== BookingStatus.SCHEDULED) {
      throw new ConflictException('This booking is no longer active.');
    }
    return booking;
  }

  private assertManageable(startsAt: Date, action: string): void {
    if (startsAt <= new Date(Date.now() + RESCHEDULE_CUTOFF_HOURS * HOUR)) {
      throw new ConflictException(
        `It is too close to the meeting to ${action} it yourself — the admin will follow up.`,
      );
    }
  }

  private async assertBookable(slotId: string): Promise<void> {
    const slot = await this.prisma.verificationSlot.findUnique({
      where: { id: slotId },
    });
    if (!slot || slot.status !== SlotStatus.OPEN) {
      throw new ConflictException(
        'This slot is no longer available. Please pick another one.',
      );
    }
    if (slot.startsAt <= this.minStart()) {
      throw new ConflictException(
        `Slots can be booked up to ${BOOKING_MIN_NOTICE_HOURS} hours before they start. Please pick a later one.`,
      );
    }
  }

  /** The race-safe core: flips OPEN→BOOKED or reports the slot as taken. */
  private async claimSlot(
    tx: Prisma.TransactionClient,
    slotId: string,
  ): Promise<void> {
    const claimed = await tx.verificationSlot.updateMany({
      where: { id: slotId, status: SlotStatus.OPEN },
      data: { status: SlotStatus.BOOKED },
    });
    if (claimed.count === 0) {
      throw new ConflictException(
        'This slot has just been taken. Please pick another one.',
      );
    }
  }

  private toAdminBookingItem(booking: BookingWithContext): AdminBookingItem {
    const { request, slot } = booking;
    return {
      bookingId: booking.id,
      requestId: booking.requestId,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      bookingStatus: booking.status.toLowerCase() as SharedBookingStatus,
      requestState: request.state.toLowerCase() as SharedVerificationState,
      syncStatus: booking.syncStatus.toLowerCase() as SharedMeetingSyncStatus,
      meetUrl: booking.meetUrl,
      noShowCount: request.noShowCount,
      credentials: request.credentials,
      coach: {
        id: request.profile.user.id,
        email: request.profile.user.email,
        displayName: request.profile.user.displayName,
      },
    };
  }
}

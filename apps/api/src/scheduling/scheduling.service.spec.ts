import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingSyncService } from './meeting/meeting-sync.service';
import { SchedulingNotificationsService } from './scheduling-notifications.service';
import { SchedulingService } from './scheduling.service';

const HOUR = 3_600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

const coach = {
  id: 'user-1',
  email: 'coach@example.com',
  displayName: 'Coach Ma',
  timezone: 'Europe/Berlin',
  emailVerifiedAt: new Date('2026-07-01T00:00:00Z'),
};

const openSlot = {
  id: 'slot-2',
  startsAt: inHours(50),
  endsAt: inHours(50.25),
  status: 'OPEN',
};

function profileWithRequest(request: object | null) {
  return {
    id: 'profile-1',
    userId: 'user-1',
    status: 'PENDING_REVIEW',
    user: coach,
    verificationRequests: request ? [request] : [],
  };
}

const awaitingRequest = {
  id: 'req-1',
  profileId: 'profile-1',
  state: 'AWAITING_SCHEDULING',
  noShowCount: 0,
  bookings: [],
};

const scheduledRequest = {
  ...awaitingRequest,
  state: 'SCHEDULED',
  bookings: [
    {
      id: 'booking-1',
      slotId: 'slot-1',
      requestId: 'req-1',
      status: 'SCHEDULED',
      googleEventId: 'evt-1',
      meetUrl: 'https://meet.google.com/abc',
      slot: {
        id: 'slot-1',
        startsAt: inHours(48),
        endsAt: inHours(48.25),
        status: 'BOOKED',
      },
    },
  ],
};

describe('SchedulingService', () => {
  let service: SchedulingService;

  const tx = {
    verificationSlot: { updateMany: jest.fn(), update: jest.fn() },
    verificationBooking: { create: jest.fn(), update: jest.fn() },
    verificationRequest: { update: jest.fn() },
    proProfile: { update: jest.fn() },
  };
  const prisma = {
    proProfile: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'profile-1',
        status: 'PENDING_REVIEW',
        bio: '',
        languages: ['en'],
        services: [],
        verificationRequests: [],
      }),
    },
    verificationSlot: { findUnique: jest.fn(), findMany: jest.fn() },
    verificationBooking: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    verificationRequest: { update: jest.fn() },
    $transaction: jest.fn(
      async (
        arg: ((client: typeof tx) => Promise<unknown>) | Promise<unknown>[],
      ) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg)),
    ),
  };
  const sync = { syncBooking: jest.fn(), cancelEvent: jest.fn() };
  const notify = {
    bookingConfirmed: jest.fn(),
    bookingRescheduled: jest.fn(),
    cancelledByAdmin: jest.fn(),
    noShow: jest.fn(),
    coachCancelled: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.verificationSlot.updateMany.mockResolvedValue({ count: 1 });
    tx.verificationBooking.create.mockResolvedValue({ id: 'booking-new' });
    prisma.verificationBooking.findUniqueOrThrow.mockResolvedValue({
      id: 'booking-new',
      meetUrl: null,
      slot: openSlot,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: PrismaService, useValue: prisma },
        { provide: MeetingSyncService, useValue: sync },
        { provide: SchedulingNotificationsService, useValue: notify },
      ],
    }).compile();
    service = moduleRef.get(SchedulingService);
  });

  describe('book', () => {
    it('claims the slot, schedules the request, syncs and emails', async () => {
      prisma.proProfile.findUnique.mockResolvedValue(
        profileWithRequest(awaitingRequest),
      );
      prisma.verificationSlot.findUnique.mockResolvedValue(openSlot);

      await service.book('user-1', 'slot-2');

      expect(tx.verificationSlot.updateMany).toHaveBeenCalledWith({
        where: { id: 'slot-2', status: 'OPEN' },
        data: { status: 'BOOKED' },
      });
      expect(tx.verificationBooking.create).toHaveBeenCalledWith({
        data: { slotId: 'slot-2', requestId: 'req-1' },
      });
      expect(tx.verificationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'SCHEDULED' } }),
      );
      expect(sync.syncBooking).toHaveBeenCalledWith('booking-new');
      expect(notify.bookingConfirmed).toHaveBeenCalled();
    });

    it('409s when the slot was claimed concurrently', async () => {
      prisma.proProfile.findUnique.mockResolvedValue(
        profileWithRequest(awaitingRequest),
      );
      prisma.verificationSlot.findUnique.mockResolvedValue(openSlot);
      tx.verificationSlot.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.book('user-1', 'slot-2')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.verificationBooking.create).not.toHaveBeenCalled();
      expect(notify.bookingConfirmed).not.toHaveBeenCalled();
    });

    it('refuses when the request is not awaiting scheduling', async () => {
      prisma.proProfile.findUnique.mockResolvedValue(
        profileWithRequest(scheduledRequest),
      );

      await expect(service.book('user-1', 'slot-2')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to book while the email is unconfirmed', async () => {
      prisma.proProfile.findUnique.mockResolvedValue({
        ...profileWithRequest(awaitingRequest),
        user: { ...coach, emailVerifiedAt: null },
      });

      await expect(service.book('user-1', 'slot-2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a slot inside the minimum notice window', async () => {
      prisma.proProfile.findUnique.mockResolvedValue(
        profileWithRequest(awaitingRequest),
      );
      prisma.verificationSlot.findUnique.mockResolvedValue({
        ...openSlot,
        startsAt: inHours(1),
      });

      await expect(service.book('user-1', 'slot-2')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('reschedule', () => {
    it('atomically rebooks: old booking rescheduled, old slot reopened, event carried over', async () => {
      prisma.proProfile.findUnique.mockResolvedValue(
        profileWithRequest(scheduledRequest),
      );
      prisma.verificationSlot.findUnique.mockResolvedValue(openSlot);

      await service.reschedule('user-1', 'slot-2');

      expect(tx.verificationSlot.updateMany).toHaveBeenCalledWith({
        where: { id: 'slot-2', status: 'OPEN' },
        data: { status: 'BOOKED' },
      });
      expect(tx.verificationBooking.update).toHaveBeenCalledWith({
        where: { id: 'booking-1' },
        data: { status: 'RESCHEDULED' },
      });
      expect(tx.verificationSlot.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { status: 'OPEN' },
      });
      expect(tx.verificationBooking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slotId: 'slot-2',
          googleEventId: 'evt-1',
          meetUrl: 'https://meet.google.com/abc',
        }) as object,
      });
      expect(notify.bookingRescheduled).toHaveBeenCalled();
    });

    it('refuses inside the cutoff window', async () => {
      const soon = {
        ...scheduledRequest,
        bookings: [
          {
            ...scheduledRequest.bookings[0],
            slot: {
              ...scheduledRequest.bookings[0].slot,
              startsAt: inHours(0.5),
            },
          },
        ],
      };
      prisma.proProfile.findUnique.mockResolvedValue(profileWithRequest(soon));

      await expect(
        service.reschedule('user-1', 'slot-2'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('markNoShow', () => {
    const bookingWithContext = {
      id: 'booking-1',
      slotId: 'slot-1',
      requestId: 'req-1',
      status: 'SCHEDULED',
      googleEventId: 'evt-1',
      slot: { id: 'slot-1', startsAt: inHours(-0.5), endsAt: inHours(0) },
      request: {
        id: 'req-1',
        profileId: 'profile-1',
        state: 'SCHEDULED',
        noShowCount: 0,
        profile: { id: 'profile-1', user: coach },
      },
    };

    it('first no-show returns the request to scheduling', async () => {
      prisma.verificationBooking.findUnique.mockResolvedValue(
        bookingWithContext,
      );

      await service.markNoShow('booking-1');

      expect(tx.verificationBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'NO_SHOW' } }),
      );
      expect(tx.verificationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { noShowCount: 1, state: 'AWAITING_SCHEDULING' },
        }),
      );
      expect(tx.proProfile.update).not.toHaveBeenCalled();
      expect(notify.noShow).toHaveBeenCalledWith(coach, false);
    });

    it('second no-show cancels the request and resets the profile to draft', async () => {
      prisma.verificationBooking.findUnique.mockResolvedValue({
        ...bookingWithContext,
        request: { ...bookingWithContext.request, noShowCount: 1 },
      });

      await service.markNoShow('booking-1');

      expect(tx.verificationRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { noShowCount: 2, state: 'CANCELLED' },
        }),
      );
      expect(tx.proProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DRAFT' } }),
      );
      expect(notify.noShow).toHaveBeenCalledWith(coach, true);
    });

    it('refuses when the booking is no longer active', async () => {
      prisma.verificationBooking.findUnique.mockResolvedValue({
        ...bookingWithContext,
        status: 'COMPLETED',
      });

      await expect(service.markNoShow('booking-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('startMeeting', () => {
    it('refuses unless the request is scheduled', async () => {
      prisma.verificationBooking.findUnique.mockResolvedValue({
        id: 'booking-1',
        status: 'SCHEDULED',
        requestId: 'req-1',
        slot: {},
        request: { state: 'IN_PROGRESS' },
      });

      await expect(service.startMeeting('booking-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.verificationRequest.update).not.toHaveBeenCalled();
    });
  });
});

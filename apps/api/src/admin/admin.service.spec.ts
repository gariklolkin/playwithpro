import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingSyncService } from '../scheduling/meeting/meeting-sync.service';
import { AdminService } from './admin.service';

const scheduledBooking = {
  id: 'booking-1',
  slotId: 'slot-1',
  status: 'SCHEDULED',
  googleEventId: 'evt-1',
};

const scheduledRequest = {
  id: 'req-1',
  profileId: 'profile-1',
  state: 'SCHEDULED',
  adminNote: '',
  noShowCount: 0,
  reviewedById: null,
  reviewedAt: null,
  createdAt: new Date(),
  bookings: [scheduledBooking],
  profile: {
    id: 'profile-1',
    user: {
      id: 'user-1',
      email: 'coach@example.com',
      displayName: 'Coach Ma',
    },
  },
};

describe('AdminService', () => {
  let service: AdminService;

  const tx = {
    verificationRequest: { update: jest.fn() },
    proProfile: { update: jest.fn() },
    verificationBooking: { update: jest.fn() },
    verificationSlot: { update: jest.fn() },
  };
  const prisma = {
    verificationRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    ),
  };
  const mailer = {
    sendVerificationApprovedEmail: jest.fn(),
    sendVerificationRejectedEmail: jest.fn(),
  };
  const sync = { cancelEvent: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: mailer },
        { provide: MeetingSyncService, useValue: sync },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('listQueue puts the soonest meeting first and exposes the meet link', async () => {
    const profile = {
      id: 'profile-1',
      userId: 'user-1',
      status: 'PENDING_REVIEW',
      bio: '',
      languages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      services: [],
      verificationRequests: [],
      user: scheduledRequest.profile.user,
    };
    const awaiting = {
      ...scheduledRequest,
      id: 'req-awaiting',
      state: 'AWAITING_SCHEDULING',
      createdAt: new Date('2026-07-18T10:00:00Z'),
      bookings: [],
      profile,
    };
    const withMeeting = {
      ...scheduledRequest,
      id: 'req-meeting',
      createdAt: new Date('2026-07-19T10:00:00Z'),
      bookings: [
        {
          ...scheduledBooking,
          meetUrl: 'https://meet.google.com/abc',
          slot: {
            id: 'slot-1',
            startsAt: new Date('2026-07-21T12:30:00Z'),
            endsAt: new Date('2026-07-21T12:45:00Z'),
          },
        },
      ],
      profile,
    };
    prisma.verificationRequest.findMany.mockResolvedValue([
      awaiting,
      withMeeting,
    ]);

    const queue = await service.listQueue();

    expect(queue.map((item) => item.requestId)).toEqual([
      'req-meeting',
      'req-awaiting',
    ]);
    expect(queue[0].meeting).toMatchObject({
      bookingId: 'booking-1',
      startsAt: '2026-07-21T12:30:00.000Z',
      meetUrl: 'https://meet.google.com/abc',
    });
    expect(queue[1].meeting).toBeNull();
  });

  it('approve verifies the profile, completes the booking and emails the coach', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(scheduledRequest);

    await service.approve('req-1', 'admin-1');

    expect(tx.verificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'VERIFIED',
          reviewedById: 'admin-1',
          reviewedAt: expect.any(Date) as Date,
        }) as object,
      }),
    );
    expect(tx.proProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'VERIFIED' } }),
    );
    expect(tx.verificationBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED' } }),
    );
    expect(tx.verificationSlot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REMOVED' } }),
    );
    expect(mailer.sendVerificationApprovedEmail).toHaveBeenCalledWith(
      'coach@example.com',
      'Coach Ma',
    );
  });

  it('refuses to approve before a call is scheduled', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      ...scheduledRequest,
      state: 'AWAITING_SCHEDULING',
      bookings: [],
    });

    await expect(service.approve('req-1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reject stores the note, cancels the meeting and reopens the slot', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(scheduledRequest);

    await service.reject('req-1', 'admin-1', '  No verifiable credentials.  ');

    expect(tx.verificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'REJECTED',
          adminNote: 'No verifiable credentials.',
        }) as object,
      }),
    );
    expect(tx.proProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } }),
    );
    expect(tx.verificationBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED_BY_ADMIN' } }),
    );
    expect(tx.verificationSlot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OPEN' } }),
    );
    expect(sync.cancelEvent).toHaveBeenCalledWith('evt-1');
    expect(mailer.sendVerificationRejectedEmail).toHaveBeenCalledWith(
      'coach@example.com',
      'Coach Ma',
      'No verifiable credentials.',
    );
  });

  it('reject works while the coach is still awaiting scheduling', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      ...scheduledRequest,
      state: 'AWAITING_SCHEDULING',
      bookings: [],
    });

    await service.reject('req-1', 'admin-1', 'Fake credentials.');

    expect(tx.verificationBooking.update).not.toHaveBeenCalled();
    expect(sync.cancelEvent).not.toHaveBeenCalled();
  });

  it('refuses to review an already-resolved request', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      ...scheduledRequest,
      state: 'VERIFIED',
    });

    await expect(service.approve('req-1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s on an unknown request', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(null);

    await expect(service.approve('missing', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from './reminders.service';
import { SchedulingNotificationsService } from './scheduling-notifications.service';

const HOUR = 3_600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

const coach = {
  id: 'user-1',
  email: 'coach@example.com',
  displayName: 'Coach Ma',
  timezone: 'UTC',
};

function dueBooking(startsInHours: number, createdHoursAgo: number) {
  return {
    id: 'booking-1',
    status: 'SCHEDULED',
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    createdAt: new Date(Date.now() - createdHoursAgo * HOUR),
    slot: {
      startsAt: inHours(startsInHours),
      endsAt: inHours(startsInHours + 0.25),
    },
    request: { profile: { user: coach } },
  };
}

describe('RemindersService', () => {
  let service: RemindersService;

  const prisma = {
    verificationBooking: { findMany: jest.fn(), update: jest.fn() },
  };
  const notify = { reminder: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.verificationBooking.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: SchedulingNotificationsService, useValue: notify },
      ],
    }).compile();
    service = moduleRef.get(RemindersService);
  });

  it('sends a due reminder exactly once by stamping it', async () => {
    const booking = dueBooking(23, 48);
    prisma.verificationBooking.findMany
      .mockResolvedValueOnce([booking]) // 24h pass
      .mockResolvedValueOnce([]); // 1h pass

    await service.deliverDue();

    expect(notify.reminder).toHaveBeenCalledTimes(1);
    expect(notify.reminder).toHaveBeenCalledWith(
      coach,
      booking,
      booking.slot,
      24,
    );
    expect(prisma.verificationBooking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { reminder24hSentAt: expect.any(Date) as Date },
    });
  });

  it('queries only unstamped scheduled bookings inside the window', async () => {
    await service.deliverDue();

    const [firstCall, secondCall] = prisma.verificationBooking.findMany.mock
      .calls as Array<[{ where: Record<string, unknown> }]>;
    expect(firstCall[0].where).toMatchObject({
      status: 'SCHEDULED',
      reminder24hSentAt: null,
    });
    expect(secondCall[0].where).toMatchObject({
      status: 'SCHEDULED',
      reminder1hSentAt: null,
    });
  });

  it('stamps but does not email when the booking itself was made inside the window', async () => {
    // Booked 30 minutes ago for a call in 23 hours: the confirmation email
    // already covered this window — a "24h reminder" now would be noise.
    const lastMinute = dueBooking(23, 0.5);
    prisma.verificationBooking.findMany
      .mockResolvedValueOnce([lastMinute])
      .mockResolvedValueOnce([]);

    await service.deliverDue();

    expect(notify.reminder).not.toHaveBeenCalled();
    expect(prisma.verificationBooking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: { reminder24hSentAt: expect.any(Date) as Date },
    });
  });
});

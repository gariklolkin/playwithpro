import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Role } from '@playwithpro/shared';
import { Prisma } from '@prisma/client';
import type { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { BookingsService } from './bookings.service';
import { ReschedulesService } from './reschedules.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('ReschedulesService', () => {
  const tx = {
    sessionReschedule: { create: jest.fn(), updateMany: jest.fn() },
    sessionRescheduleOption: { createMany: jest.fn() },
    availabilitySlot: { updateMany: jest.fn() },
    session: { count: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = {
    session: { findUnique: jest.fn() },
    availabilitySlot: { findMany: jest.fn() },
    sessionReschedule: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const settings: Record<string, number> = {
    RESCHEDULE_MAX_PER_SESSION: 2,
    RESCHEDULE_PROPOSAL_TTL_HOURS: 24,
    RESCHEDULE_MAX_SHIFT_DAYS: 30,
  };
  const config = { getOrThrow: (name: string) => settings[name] };
  const bookings = { sessionResponse: jest.fn() };
  const notifications = { enqueue: jest.fn() };
  const analytics = { track: jest.fn() };
  const service = new ReschedulesService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    bookings as unknown as BookingsService,
    notifications as unknown as NotificationsService,
    analytics,
  );

  const player = { id: 'player-1', role: Role.Amateur };
  const coach = { id: 'coach-1', role: Role.Professional };
  const startsAt = new Date(Date.now() + 3 * DAY);
  const session = {
    id: 'session-1',
    status: 'PAID_ESCROW',
    playerId: 'player-1',
    proProfileId: 'profile-1',
    slotId: 'slot-0',
    startsAt,
    endsAt: new Date(startsAt.getTime() + HOUR),
    paidAt: new Date(Date.now() - 5 * DAY),
    priceMinor: 4005,
    platformFeeMinor: 401,
    rescheduleCount: 0,
    cancelTierFloor: null,
    cancelFreeHours: 24,
    cancelLateRefundPercent: 50,
    cancelNoRefundHours: 2,
    cancelGraceMin: 30,
    proProfile: { userId: 'coach-1' },
    reschedules: [],
  };
  const slot = (id: string, daysAhead: number, overrides = {}) => {
    const start = new Date(Date.now() + daysAhead * DAY);
    return {
      id,
      profileId: 'profile-1',
      startsAt: start,
      endsAt: new Date(start.getTime() + HOUR),
      status: 'OPEN',
      ...overrides,
    };
  };
  const proposal = {
    id: 'proposal-1',
    proposedById: 'player-1',
    byCoach: false,
    options: [
      { id: 'option-1', ...pick(slot('slot-1', 7)) },
      { id: 'option-2', ...pick(slot('slot-2', 8)) },
    ],
  };
  function pick(s: ReturnType<typeof slot>) {
    return { slotId: s.id, startsAt: s.startsAt, endsAt: s.endsAt };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );
    prisma.session.findUnique.mockResolvedValue(session);
    prisma.sessionReschedule.findFirst.mockResolvedValue(proposal);
    tx.sessionReschedule.create.mockResolvedValue({ id: 'proposal-1' });
    tx.sessionReschedule.updateMany.mockResolvedValue({ count: 1 });
    tx.availabilitySlot.updateMany.mockResolvedValue({ count: 1 });
    tx.session.count.mockResolvedValue(1);
    tx.session.updateMany.mockResolvedValue({ count: 1 });
    bookings.sessionResponse.mockResolvedValue({ id: 'session-1' });
  });

  describe('propose', () => {
    it('holds every offered slot and tells the other party', async () => {
      prisma.availabilitySlot.findMany.mockResolvedValue([
        slot('slot-1', 7),
        slot('slot-2', 8),
      ]);

      await service.propose(player, 'session-1', ['slot-1', 'slot-2']);

      expect(tx.sessionReschedule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-1',
          proposedById: 'player-1',
          byCoach: false,
          fromStartsAt: startsAt,
        }) as object,
      });
      // The same conditional claim a booking uses, once per slot.
      expect(tx.availabilitySlot.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'slot-1',
          status: 'OPEN',
          startsAt: { gt: expect.any(Date) as Date },
        },
        data: { status: 'BOOKED' },
      });
      expect(tx.sessionRescheduleOption.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ slotId: 'slot-1' }),
          expect.objectContaining({ slotId: 'slot-2' }),
        ],
      });
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'RESCHEDULE_PROPOSED',
          recipientId: 'coach-1',
          dedupeSuffix: 'proposal-1',
        }),
      ]);
    });

    it('expires after 24 hours, but never later than 2 hours before the start', async () => {
      prisma.availabilitySlot.findMany.mockResolvedValue([slot('slot-1', 7)]);
      await service.propose(player, 'session-1', ['slot-1']);
      const expiryOf = (call: number): Date =>
        (
          (tx.sessionReschedule.create.mock.calls as unknown[][])[call][0] as {
            data: { expiresAt: Date };
          }
        ).data.expiresAt;
      const far = expiryOf(0);
      expect(Math.abs(far.getTime() - (Date.now() + 24 * HOUR))).toBeLessThan(
        5_000,
      );

      const soon = new Date(Date.now() + 10 * HOUR);
      prisma.session.findUnique.mockResolvedValue({
        ...session,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + HOUR),
      });
      await service.propose(player, 'session-1', ['slot-1']);
      const near = expiryOf(1);
      expect(near).toEqual(new Date(soon.getTime() - 2 * HOUR));
    });

    it('rolls everything back when one offered slot is gone', async () => {
      prisma.availabilitySlot.findMany.mockResolvedValue([
        slot('slot-1', 7),
        slot('slot-2', 8),
      ]);
      tx.availabilitySlot.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.propose(player, 'session-1', ['slot-1', 'slot-2']),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('turns the one-open-proposal index violation into a conflict', async () => {
      prisma.availabilitySlot.findMany.mockResolvedValue([slot('slot-1', 7)]);
      tx.sessionReschedule.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.propose(player, 'session-1', ['slot-1']),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it.each([
      ['another coach', slot('slot-1', 7, { profileId: 'profile-9' })],
      [
        'a different duration',
        slot('slot-1', 7, {
          endsAt: new Date(Date.now() + 7 * DAY + 2 * HOUR),
        }),
      ],
      ['less than 2 hours away', slot('slot-1', 1 / 24)],
      ['more than 30 days from the original start', slot('slot-1', 40)],
      ['the current slot', slot('slot-0', 7)],
    ])('rejects an option of %s', async (_label, offered) => {
      prisma.availabilitySlot.findMany.mockResolvedValue([offered]);

      await expect(
        service.propose(player, 'session-1', [offered.id]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects duplicates, too many options and unknown slots', async () => {
      prisma.availabilitySlot.findMany.mockResolvedValue([]);
      for (const ids of [['a', 'a'], ['a', 'b', 'c', 'd'], [], ['ghost']]) {
        await expect(
          service.propose(player, 'session-1', ids),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('refuses a session too close to its start, already moved twice, or not paid', async () => {
      for (const overrides of [
        { startsAt: new Date(Date.now() + 90 * 60_000) },
        { rescheduleCount: 2 },
        { status: 'CANCELLED' },
      ]) {
        prisma.session.findUnique.mockResolvedValue({
          ...session,
          ...overrides,
        });
        await expect(
          service.propose(player, 'session-1', ['slot-1']),
        ).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('is invisible to strangers', async () => {
      await expect(
        service.propose({ id: 'x', role: Role.Amateur }, 'session-1', ['s']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('accept', () => {
    it('moves the session, releases the rest, and leaves the money alone', async () => {
      await service.accept(coach, 'session-1', 'option-2');

      expect(tx.sessionReschedule.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'proposal-1',
          status: 'OPEN',
          expiresAt: { gt: expect.any(Date) as Date },
        },
        data: {
          status: 'ACCEPTED',
          acceptedOptionId: 'option-2',
          respondedAt: expect.any(Date) as Date,
        },
      });
      // Guarded on the old slot and time: a racing cancel or accept loses.
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-1',
          status: 'PAID_ESCROW',
          slotId: 'slot-0',
          startsAt,
        },
        data: {
          slotId: 'slot-2',
          startsAt: proposal.options[1].startsAt,
          endsAt: proposal.options[1].endsAt,
          rescheduleCount: { increment: 1 },
          rescheduledAt: expect.any(Date) as Date,
          calendarSequence: { increment: 1 },
          // Three days ahead: the player could still cancel for free.
          cancelTierFloor: null,
        },
      });
      const released = tx.availabilitySlot.updateMany.mock.calls.map(
        ([arg]) => (arg as { where: { id: { in: string[] } } }).where.id.in,
      );
      expect(released).toEqual([['slot-1'], ['slot-0']]);
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'RESCHEDULE_ACCEPTED_PLAYER',
          recipientId: 'player-1',
          dedupeSuffix: 'proposal-1',
          payload: {
            rescheduleId: 'proposal-1',
            fromStartsAt: startsAt.toISOString(),
          },
        }),
        expect.objectContaining({
          kind: 'RESCHEDULE_ACCEPTED_COACH',
          recipientId: 'coach-1',
        }),
      ]);
    });

    it('freezes the tier the player had when the move was accepted', async () => {
      const soon = new Date(Date.now() + 10 * HOUR);
      prisma.session.findUnique.mockResolvedValue({
        ...session,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + HOUR),
      });

      await service.accept(coach, 'session-1', 'option-1');

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelTierFloor: 'PARTIAL',
          }) as object,
        }),
      );
    });

    it('records no floor when the coach asked for the move', async () => {
      const soon = new Date(Date.now() + 10 * HOUR);
      prisma.session.findUnique.mockResolvedValue({
        ...session,
        startsAt: soon,
        endsAt: new Date(soon.getTime() + HOUR),
        reschedules: [{ byCoach: true, status: 'OPEN', createdAt: new Date() }],
      });
      prisma.sessionReschedule.findFirst.mockResolvedValue({
        ...proposal,
        proposedById: 'coach-1',
        byCoach: true,
      });

      await service.accept(player, 'session-1', 'option-1');

      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancelTierFloor: null }) as object,
        }),
      );
    });

    it('loses cleanly to a cancellation, an expiry or another accept', async () => {
      tx.session.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.accept(coach, 'session-1', 'option-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      tx.session.updateMany.mockResolvedValue({ count: 1 });
      tx.sessionReschedule.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.accept(coach, 'session-1', 'option-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('is for the other party only, and only for an offered option', async () => {
      await expect(
        service.accept(player, 'session-1', 'option-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.accept(coach, 'session-1', 'option-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('decline and withdraw', () => {
    it('declining releases every hold and tells the proposer', async () => {
      await service.decline(coach, 'session-1');

      expect(tx.sessionReschedule.updateMany).toHaveBeenCalledWith({
        where: { id: 'proposal-1', status: 'OPEN' },
        data: { status: 'DECLINED', respondedAt: expect.any(Date) as Date },
      });
      expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['slot-1', 'slot-2'] },
          }) as object,
        }),
      );
      expect(tx.session.updateMany).not.toHaveBeenCalled();
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'RESCHEDULE_DECLINED',
          recipientId: 'player-1',
        }),
      ]);
    });

    it('only the proposer withdraws; only the other party declines', async () => {
      await expect(service.decline(player, 'session-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.withdraw(coach, 'session-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      await service.withdraw(player, 'session-1');
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'RESCHEDULE_WITHDRAWN',
          recipientId: 'coach-1',
        }),
      ]);
    });

    it('409s when there is nothing open', async () => {
      prisma.sessionReschedule.findFirst.mockResolvedValue(null);
      await expect(service.decline(coach, 'session-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('sweep', () => {
    const stale = (status: string) => ({
      id: 'proposal-1',
      sessionId: 'session-1',
      proposedById: 'player-1',
      byCoach: false,
      options: [{ id: 'option-1', slotId: 'slot-1' }],
      session: {
        status,
        playerId: 'player-1',
        proProfile: { userId: 'coach-1' },
      },
    });

    it('expires an unanswered proposal and tells both parties', async () => {
      prisma.sessionReschedule.findMany.mockResolvedValue([
        stale('PAID_ESCROW'),
      ]);

      await service.sweepOnce();

      expect(tx.sessionReschedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'EXPIRED' }) as object,
        }),
      );
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, [
        expect.objectContaining({
          kind: 'RESCHEDULE_EXPIRED',
          recipientId: 'player-1',
        }),
        expect.objectContaining({
          kind: 'RESCHEDULE_EXPIRED',
          recipientId: 'coach-1',
        }),
      ]);
    });

    it('silently supersedes a proposal whose session started or was cancelled', async () => {
      prisma.sessionReschedule.findMany.mockResolvedValue([
        stale('IN_PROGRESS'),
      ]);

      await service.sweepOnce();

      expect(tx.sessionReschedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUPERSEDED' }) as object,
        }),
      );
      expect(notifications.enqueue).toHaveBeenCalledWith(tx, []);
    });

    it('shrugs off a proposal answered at the same moment', async () => {
      prisma.sessionReschedule.findMany.mockResolvedValue([
        stale('PAID_ESCROW'),
      ]);
      tx.sessionReschedule.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.sweepOnce()).resolves.toBeUndefined();
    });
  });
});

import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityMaterializerService,
  expandRules,
} from './availability-materializer.service';

describe('expandRules', () => {
  // Monday 2026-03-23 00:00 UTC; Berlin DST starts on Sunday 2026-03-29.
  const now = new Date('2026-03-23T00:00:00Z');

  it('expands a window into hourly starts on matching weekdays', () => {
    const starts = expandRules(
      [{ weekday: 0, startMinute: 18 * 60, endMinute: 21 * 60 }],
      'Europe/Berlin',
      now,
    );
    // 4 Mondays in 28 days × 3 slots.
    expect(starts).toHaveLength(12);
    expect(starts[0].toISOString()).toBe('2026-03-23T17:00:00.000Z');
  });

  it('keeps wall-clock times stable across the DST switch', () => {
    const starts = expandRules(
      [{ weekday: 0, startMinute: 18 * 60, endMinute: 19 * 60 }],
      'Europe/Berlin',
      now,
    );
    expect(starts.map((s) => s.toISOString())).toEqual([
      '2026-03-23T17:00:00.000Z', // CET, UTC+1
      '2026-03-30T16:00:00.000Z', // CEST, UTC+2
      '2026-04-06T16:00:00.000Z',
      '2026-04-13T16:00:00.000Z',
    ]);
  });

  it('drops starts that are already in the past', () => {
    const monday13h = new Date('2026-03-23T13:00:00Z'); // 14:00 in Berlin
    const starts = expandRules(
      [{ weekday: 0, startMinute: 12 * 60, endMinute: 16 * 60 }],
      'Europe/Berlin',
      monday13h,
    );
    // Today's 12:00 and 13:00 local are gone; 14:00 (13:00Z) is not strictly future.
    expect(starts[0].toISOString()).toBe('2026-03-23T14:00:00.000Z');
  });

  it('excludes a window shorter than one slot', () => {
    const starts = expandRules(
      [{ weekday: 2, startMinute: 600, endMinute: 630 }],
      'UTC',
      now,
    );
    expect(starts).toHaveLength(0);
  });
});

describe('AvailabilityMaterializerService', () => {
  const prisma = {
    proProfile: { findUnique: jest.fn() },
    availabilityRule: { findMany: jest.fn() },
    availabilitySlot: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  let service: AvailabilityMaterializerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AvailabilityMaterializerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(AvailabilityMaterializerService);
  });

  const now = new Date('2026-03-23T00:00:00Z');
  const mondayRule = { weekday: 0, startMinute: 18 * 60, endMinute: 20 * 60 };

  function profileWithRules(rules: object[]) {
    return {
      id: 'profile-1',
      availabilityRules: rules,
      user: { timezone: 'Europe/Berlin' },
    };
  }

  it('creates missing slots but never resurrects an existing start', async () => {
    prisma.proProfile.findUnique.mockResolvedValue(
      profileWithRules([mondayRule]),
    );
    prisma.availabilitySlot.findMany.mockResolvedValue([
      {
        id: 'slot-removed',
        startsAt: new Date('2026-03-23T17:00:00.000Z'),
        status: 'REMOVED',
        source: 'RULE',
      },
    ]);

    await service.materializeProfile('profile-1', now);

    const [[created]] = prisma.availabilitySlot.createMany.mock.calls as [
      [
        {
          data: Array<{ startsAt: Date; endsAt: Date }>;
          skipDuplicates: boolean;
        },
      ],
    ];
    const starts = created.data.map((s) => s.startsAt.toISOString());
    // 4 Mondays × 2 slots minus the REMOVED one that must stay dead.
    expect(starts).toHaveLength(7);
    expect(starts).not.toContain('2026-03-23T17:00:00.000Z');
    expect(created.skipDuplicates).toBe(true);
    expect(
      created.data[0].endsAt.getTime() - created.data[0].startsAt.getTime(),
    ).toBe(3_600_000);
  });

  it('deletes stale open rule slots but keeps manual and booked ones', async () => {
    prisma.proProfile.findUnique.mockResolvedValue(
      profileWithRules([mondayRule]),
    );
    prisma.availabilitySlot.findMany.mockResolvedValue([
      // 17:00 local no longer matches any rule → stale.
      {
        id: 'stale-open',
        startsAt: new Date('2026-03-23T16:00:00.000Z'),
        status: 'OPEN',
        source: 'RULE',
      },
      {
        id: 'manual-off-template',
        startsAt: new Date('2026-03-24T10:00:00.000Z'),
        status: 'OPEN',
        source: 'MANUAL',
      },
      {
        id: 'booked-off-template',
        startsAt: new Date('2026-03-25T10:00:00.000Z'),
        status: 'BOOKED',
        source: 'RULE',
      },
    ]);

    await service.materializeProfile('profile-1', now);

    expect(prisma.availabilitySlot.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['stale-open'] } },
    });
  });

  it('does nothing when the template and slots already agree', async () => {
    prisma.proProfile.findUnique.mockResolvedValue(profileWithRules([]));
    prisma.availabilitySlot.findMany.mockResolvedValue([]);

    await service.materializeProfile('profile-1', now);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('materializes every profile that has rules and survives per-profile failures', async () => {
    prisma.availabilityRule.findMany.mockResolvedValue([
      { profileId: 'p1' },
      { profileId: 'p2' },
    ]);
    const spy = jest
      .spyOn(service, 'materializeProfile')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    await service.materializeAll();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('p2');
  });
});

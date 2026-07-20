import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityMaterializerService } from './availability-materializer.service';
import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  const prisma = {
    proProfile: { findUnique: jest.fn(), create: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
    availabilityRule: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    availabilitySlot: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const materializer = { materializeProfile: jest.fn() };

  const profile = { id: 'profile-1', userId: 'user-1', status: 'DRAFT' };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.proProfile.findUnique.mockResolvedValue(profile);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ timezone: 'UTC' });
    prisma.availabilityRule.findMany.mockResolvedValue([]);
    prisma.availabilitySlot.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AvailabilityMaterializerService, useValue: materializer },
      ],
    }).compile();
    service = moduleRef.get(AvailabilityService);
  });

  describe('replaceRules', () => {
    it('rejects overlapping windows on the same weekday', async () => {
      await expect(
        service.replaceRules('user-1', [
          { weekday: 0, startMinute: 18 * 60, endMinute: 20 * 60 },
          { weekday: 0, startMinute: 19 * 60, endMinute: 21 * 60 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(materializer.materializeProfile).not.toHaveBeenCalled();
    });

    it('rejects windows off the 30-minute grid or shorter than a slot', async () => {
      await expect(
        service.replaceRules('user-1', [
          { weekday: 0, startMinute: 615, endMinute: 720 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.replaceRules('user-1', [
          { weekday: 0, startMinute: 600, endMinute: 630 },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replaces the template atomically and re-materializes', async () => {
      const rules = [{ weekday: 4, startMinute: 600, endMinute: 780 }];

      await service.replaceRules('user-1', rules);

      expect(prisma.availabilityRule.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'profile-1' },
      });
      expect(prisma.availabilityRule.createMany).toHaveBeenCalledWith({
        data: [{ ...rules[0], profileId: 'profile-1' }],
      });
      expect(materializer.materializeProfile).toHaveBeenCalledWith('profile-1');
    });
  });

  describe('addManualSlot', () => {
    const future = new Date(Date.now() + 48 * 3_600_000);
    const aligned = new Date(
      Math.ceil(future.getTime() / 1_800_000) * 1_800_000,
    );

    it('rejects a start off the :00/:30 boundary', async () => {
      await expect(
        service.addManualSlot(
          'user-1',
          new Date(aligned.getTime() + 600_000).toISOString(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an overlapping slot', async () => {
      prisma.availabilitySlot.findFirst.mockResolvedValue({ id: 'other' });

      await expect(
        service.addManualSlot('user-1', aligned.toISOString()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a manual slot with a 60-minute duration', async () => {
      prisma.availabilitySlot.findFirst.mockResolvedValue(null);
      prisma.availabilitySlot.create.mockResolvedValue({});

      await service.addManualSlot('user-1', aligned.toISOString());

      const [[{ data: created }]] = prisma.availabilitySlot.create.mock
        .calls as [
        [{ data: { source: string; startsAt: Date; endsAt: Date } }],
      ];
      expect(created.source).toBe('MANUAL');
      expect(created.endsAt.getTime() - created.startsAt.getTime()).toBe(
        3_600_000,
      );
    });
  });

  describe('removeSlot', () => {
    it('marks a rule slot REMOVED so regeneration keeps it dead', async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        id: 'slot-1',
        profileId: 'profile-1',
        status: 'OPEN',
        source: 'RULE',
      });

      await service.removeSlot('user-1', 'slot-1');

      expect(prisma.availabilitySlot.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { status: 'REMOVED' },
      });
    });

    it('hard-deletes a manual slot so the time can be re-added', async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        id: 'slot-2',
        profileId: 'profile-1',
        status: 'OPEN',
        source: 'MANUAL',
      });

      await service.removeSlot('user-1', 'slot-2');

      expect(prisma.availabilitySlot.delete).toHaveBeenCalledWith({
        where: { id: 'slot-2' },
      });
    });

    it("refuses to touch another coach's slot", async () => {
      prisma.availabilitySlot.findUnique.mockResolvedValue({
        id: 'slot-3',
        profileId: 'someone-else',
        status: 'OPEN',
        source: 'RULE',
      });

      await expect(
        service.removeSlot('user-1', 'slot-3'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getPublicSlots', () => {
    it('rejects unverified profiles', async () => {
      prisma.proProfile.findUnique.mockResolvedValue({ status: 'DRAFT' });

      await expect(service.getPublicSlots('profile-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('serves open slots beyond the 2-hour notice window', async () => {
      prisma.proProfile.findUnique.mockResolvedValue({ status: 'VERIFIED' });
      const startsAt = new Date(Date.now() + 72 * 3_600_000);
      prisma.availabilitySlot.findMany.mockResolvedValue([
        {
          id: 's1',
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3_600_000),
        },
      ]);

      const slots = await service.getPublicSlots('profile-1');

      const [[{ where }]] = prisma.availabilitySlot.findMany.mock.calls as [
        [{ where: { status: string; startsAt: { gt: Date } } }],
      ];
      expect(where.status).toBe('OPEN');
      expect(where.startsAt.gt.getTime()).toBeGreaterThan(
        Date.now() + 1.9 * 3_600_000,
      );
      expect(slots[0]).toEqual({
        id: 's1',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
      });
    });
  });
});

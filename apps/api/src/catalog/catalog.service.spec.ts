import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ServiceType } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CatalogService } from './catalog.service';

const service = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 's1',
  profileId: 'profile-1',
  type: 'CONSULTATION',
  priceMinor: 4000,
  currency: 'EUR',
  venueLabel: '',
  venueLat: null,
  venueLng: null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const verifiedProfile = {
  id: 'profile-1',
  status: 'VERIFIED',
  bio: 'Seasoned coach',
  languages: ['en', 'de'],
  user: { displayName: 'Anna Coach', avatarKey: 'avatars/a.jpg' },
  services: [
    service(),
    service({ id: 's2', type: 'VIDEO_ANALYSIS', priceMinor: 6000 }),
  ],
};

describe('CatalogService', () => {
  let catalog: CatalogService;

  const prisma = {
    proProfile: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    availabilitySlot: {
      groupBy: jest.fn<Promise<unknown>, [unknown]>(),
    },
    $transaction: jest.fn(),
  };
  const storage = {
    objectUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    prisma.proProfile.count.mockResolvedValue(1);
    prisma.proProfile.findMany.mockResolvedValue([verifiedProfile]);
    prisma.availabilitySlot.groupBy.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    catalog = moduleRef.get(CatalogService);
  });

  it('lists only verified coaches with active services', async () => {
    await catalog.list({});

    expect(prisma.proProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'VERIFIED',
          services: {
            some: expect.objectContaining({ active: true }) as object,
          },
        }) as object,
      }),
    );
  });

  it('builds cards with price-from and computed avatar URL', async () => {
    const response = await catalog.list({});

    expect(response.items).toHaveLength(1);
    const [card] = response.items;
    expect(card.priceFromMinor).toBe(4000);
    expect(card.currency).toBe('EUR');
    expect(card.avatarUrl).toBe('https://cdn.test/avatars/a.jpg');
    expect(card.nextSlotAt).toBeNull();
  });

  it('applies service and price filters to the same service', async () => {
    await catalog.list({
      serviceTypes: [ServiceType.VideoAnalysis, ServiceType.Game],
      maxPriceMinor: 5000,
      languages: ['de', 'fr'],
    });

    expect(prisma.proProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          languages: { hasSome: ['de', 'fr'] },
          services: {
            some: expect.objectContaining({
              active: true,
              type: { in: ['VIDEO_ANALYSIS', 'GAME'] },
              priceMinor: { lte: 5000 },
            }) as object,
          },
        }) as object,
      }),
    );
  });

  it('surfaces the grouped next open slot per coach', async () => {
    const nextStart = new Date('2026-08-01T10:00:00Z');
    prisma.availabilitySlot.groupBy.mockResolvedValue([
      { profileId: 'profile-1', _min: { startsAt: nextStart } },
    ]);

    const response = await catalog.list({});

    expect(response.items[0].nextSlotAt).toBe(nextStart.toISOString());
    // Slots must respect the same 2h-notice rule as the public listing.
    const groupArgs = prisma.availabilitySlot.groupBy.mock.calls[0][0] as {
      where: { startsAt: { gt: Date } };
    };
    expect(groupArgs.where.startsAt.gt.getTime()).toBeGreaterThan(
      Date.now() + 119 * 60_000,
    );
  });

  it('serves the public profile of a verified coach', async () => {
    prisma.proProfile.findUnique.mockResolvedValue(verifiedProfile);

    const profile = await catalog.getPublicProfile('profile-1');

    expect(profile.displayName).toBe('Anna Coach');
    expect(profile.services).toHaveLength(2);
  });

  it('hides unverified profiles behind not-found', async () => {
    prisma.proProfile.findUnique.mockResolvedValue({
      ...verifiedProfile,
      status: 'PENDING_REVIEW',
    });

    await expect(catalog.getPublicProfile('profile-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ServiceType } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProsService } from './pros.service';

const baseProfile = {
  id: 'profile-1',
  userId: 'user-1',
  status: 'DRAFT',
  bio: 'Seasoned coach',
  languages: ['en'],
  createdAt: new Date(),
  updatedAt: new Date(),
  services: [
    {
      id: 's1',
      profileId: 'profile-1',
      type: 'CONSULTATION',
      priceMinor: 4000,
      currency: 'EUR',
      venueCity: '',
      venueClub: '',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  verificationRequests: [],
};

describe('ProsService', () => {
  let service: ProsService;

  const prisma = {
    proProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    proService: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    verificationRequest: {
      create: jest.fn(),
    },
    user: {
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      emailVerifiedAt: new Date(),
    });
    const moduleRef = await Test.createTestingModule({
      providers: [ProsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ProsService);
  });

  it('creates an empty draft profile on first access', async () => {
    prisma.proProfile.findUnique.mockResolvedValue(null);
    prisma.proProfile.create.mockResolvedValue({
      ...baseProfile,
      bio: '',
      languages: [],
      services: [],
    });

    const profile = await service.getProfile('user-1');

    expect(prisma.proProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'user-1' } }),
    );
    expect(profile.status).toBe('draft');
    expect(profile.services).toEqual([]);
  });

  it('rejects the game service without a mapped venue', async () => {
    await expect(
      service.upsertService('user-1', ServiceType.Game, {
        priceMinor: 5000,
        currency: 'EUR',
        venueLabel: 'TTC Berlin',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.proService.upsert).not.toHaveBeenCalled();
  });

  it('upserts a service keyed by profile and type', async () => {
    prisma.proProfile.findUnique.mockResolvedValue(baseProfile);

    await service.upsertService('user-1', ServiceType.Consultation, {
      priceMinor: 4500,
      currency: 'eur',
    });

    expect(prisma.proService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          profileId_type: { profileId: 'profile-1', type: 'CONSULTATION' },
        },
        create: expect.objectContaining({
          priceMinor: 4500,
          currency: 'EUR',
        }) as object,
      }),
    );
  });

  it('blocks verification submission until the email is confirmed', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ emailVerifiedAt: null });
    prisma.proProfile.findUnique.mockResolvedValue(baseProfile);

    await expect(
      service.submitVerification('user-1', { credentials: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks verification submission while a request is pending', async () => {
    prisma.proProfile.findUnique.mockResolvedValue({
      ...baseProfile,
      status: 'PENDING_REVIEW',
    });

    await expect(
      service.submitVerification('user-1', {
        credentials: 'ITTF licensed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks submission of an incomplete profile and names what is missing', async () => {
    prisma.proProfile.findUnique.mockResolvedValue({
      ...baseProfile,
      bio: '  ',
      languages: [],
      services: [],
    });

    const error = await service
      .submitVerification('user-1', { credentials: 'x' })
      .catch((caught: ConflictException) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toContain('language');
    expect((error as ConflictException).message).toContain('service');
  });

  it('allows resubmission after rejection and moves the profile to pending', async () => {
    prisma.proProfile.findUnique.mockResolvedValue({
      ...baseProfile,
      status: 'REJECTED',
    });

    await service.submitVerification('user-1', {
      credentials: 'National champion 2019',
    });

    expect(prisma.verificationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: 'profile-1',
          credentials: 'National champion 2019',
        }) as object,
      }),
    );
    expect(prisma.proProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'PENDING_REVIEW' },
      }),
    );
  });
});

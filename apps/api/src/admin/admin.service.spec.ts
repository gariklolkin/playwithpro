import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const pendingRequest = {
  id: 'req-1',
  profileId: 'profile-1',
  status: 'PENDING',
  credentials: 'ITTF licensed coach',
  contactTelegram: '@coach_ma',
  contactPhone: '+49 151 1234567',
  callRequestedAt: null,
  adminNote: '',
  reviewedById: null,
  reviewedAt: null,
  createdAt: new Date(),
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

  const prisma = {
    verificationRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    proProfile: {
      update: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const mailer = {
    sendVerificationApprovedEmail: jest.fn(),
    sendVerificationRejectedEmail: jest.fn(),
    sendVerificationCallEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('approve verifies the profile, records the reviewer and emails the coach', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(pendingRequest);

    await service.approve('req-1', 'admin-1');

    expect(prisma.verificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedById: 'admin-1',
          reviewedAt: expect.any(Date) as Date,
        }) as object,
      }),
    );
    expect(prisma.proProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'VERIFIED' } }),
    );
    expect(mailer.sendVerificationApprovedEmail).toHaveBeenCalledWith(
      'coach@example.com',
      'Coach Ma',
    );
  });

  it('reject stores the note, marks the profile rejected and emails the coach', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(pendingRequest);

    await service.reject('req-1', 'admin-1', '  No verifiable credentials.  ');

    expect(prisma.verificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          adminNote: 'No verifiable credentials.',
        }) as object,
      }),
    );
    expect(prisma.proProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } }),
    );
    expect(mailer.sendVerificationRejectedEmail).toHaveBeenCalledWith(
      'coach@example.com',
      'Coach Ma',
      'No verifiable credentials.',
    );
  });

  it('requestCall stamps the request and emails the coach', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue(pendingRequest);

    await service.requestCall('req-1');

    expect(prisma.verificationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { callRequestedAt: expect.any(Date) as Date },
      }),
    );
    expect(mailer.sendVerificationCallEmail).toHaveBeenCalledWith(
      'coach@example.com',
      'Coach Ma',
      '@coach_ma, +49 151 1234567',
    );
  });

  it('refuses to review an already-reviewed request', async () => {
    prisma.verificationRequest.findUnique.mockResolvedValue({
      ...pendingRequest,
      status: 'APPROVED',
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

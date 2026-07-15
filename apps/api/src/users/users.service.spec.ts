import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const prisma = {
    user: { findUnique: jest.fn() },
    oAuthAccount: { deleteMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('unlinkGoogle', () => {
    it('refuses to unlink when the account has no password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: null,
        oauthAccounts: [{ provider: 'google' }],
      });

      await expect(service.unlinkGoogle('user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.oAuthAccount.deleteMany).not.toHaveBeenCalled();
    });

    it('unlinks when a password is set', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.c',
        role: 'AMATEUR',
        displayName: 'A',
        locale: 'en',
        timezone: 'UTC',
        emailVerifiedAt: new Date(),
        passwordHash: 'hash',
        oauthAccounts: [{ provider: 'google' }],
      });

      await service.unlinkGoogle('user-1');

      expect(prisma.oAuthAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', provider: 'google' },
      });
    });
  });
});

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { TokenService } from '../auth/token.service';
import { AvailabilityMaterializerService } from '../availability/availability-materializer.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    oAuthAccount: { deleteMany: jest.fn() },
  };
  const tokens = { revokeAllRefreshTokens: jest.fn() };
  const materializer = { rematerializeForUser: jest.fn() };
  const storage = {
    presignPut: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
    objectUrl: jest.fn((key: string) => `http://s3.local/bucket/${key}`),
  };

  const baseUser = {
    id: 'user-1',
    email: 'a@b.c',
    role: 'AMATEUR',
    displayName: 'A',
    locale: 'en',
    timezone: 'UTC',
    avatarKey: null as string | null,
    emailVerifiedAt: new Date(),
    passwordHash: null as string | null,
    oauthAccounts: [] as { provider: string }[],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenService, useValue: tokens },
        { provide: AvailabilityMaterializerService, useValue: materializer },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  describe('getMe', () => {
    it('throws for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateMe', () => {
    it('persists timezone and returns the updated profile', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue({
        ...baseUser,
        timezone: 'Europe/Berlin',
      });

      const me = await service.updateMe('user-1', {
        timezone: 'Europe/Berlin',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          displayName: undefined,
          locale: undefined,
          timezone: 'Europe/Berlin',
        },
        include: { oauthAccounts: true },
      });
      expect(me.timezone).toBe('Europe/Berlin');
      expect(materializer.rematerializeForUser).toHaveBeenCalledWith('user-1');
    });

    it('does not re-materialize slots when the timezone is unchanged', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue({ ...baseUser, displayName: 'B' });

      await service.updateMe('user-1', { displayName: 'B' });

      expect(materializer.rematerializeForUser).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password and keeps sessions intact', async () => {
      const hash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash: hash,
      });

      await expect(
        service.changePassword('user-1', 'wrong-password', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(tokens.revokeAllRefreshTokens).not.toHaveBeenCalled();
    });

    it('rejects password change for OAuth-only accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });

      await expect(
        service.changePassword('user-1', 'anything', 'new-password'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates the hash and revokes refresh tokens on success', async () => {
      const hash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash: hash,
      });

      await service.changePassword('user-1', 'correct-password', 'new-pass-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) as string },
      });
      expect(tokens.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1');
    });
  });

  describe('avatar flow', () => {
    it('issues a pre-signed URL under the user namespace', async () => {
      storage.presignPut.mockResolvedValue('http://s3.local/presigned');

      const result = await service.createAvatarUploadUrl('user-1', {
        contentType: 'image/png',
        sizeBytes: 1024,
      });

      expect(result.key).toMatch(/^avatars\/user-1\/[0-9a-f-]+\.png$/);
      expect(result.uploadUrl).toBe('http://s3.local/presigned');
      expect(storage.presignPut).toHaveBeenCalledWith(result.key, 'image/png');
    });

    it('rejects confirming a key outside the user namespace', async () => {
      await expect(
        service.confirmAvatar('user-1', 'avatars/user-2/x.png'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects confirmation when the object was never uploaded', async () => {
      storage.headObject.mockResolvedValue(null);

      await expect(
        service.confirmAvatar('user-1', 'avatars/user-1/x.png'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects and deletes an oversized upload', async () => {
      storage.headObject.mockResolvedValue({
        contentLength: 6 * 1024 * 1024,
        contentType: 'image/png',
      });

      await expect(
        service.confirmAvatar('user-1', 'avatars/user-1/x.png'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.deleteObject).toHaveBeenCalledWith('avatars/user-1/x.png');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('attaches the avatar and deletes the previous object', async () => {
      storage.headObject.mockResolvedValue({
        contentLength: 1024,
        contentType: 'image/png',
      });
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        avatarKey: 'avatars/user-1/old.png',
      });
      prisma.user.update.mockResolvedValue({
        ...baseUser,
        avatarKey: 'avatars/user-1/new.png',
      });

      const me = await service.confirmAvatar(
        'user-1',
        'avatars/user-1/new.png',
      );

      expect(me.avatarUrl).toBe(
        'http://s3.local/bucket/avatars/user-1/new.png',
      );
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'avatars/user-1/old.png',
      );
    });

    it('removes the avatar and deletes the object', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        avatarKey: 'avatars/user-1/old.png',
      });
      prisma.user.update.mockResolvedValue({ ...baseUser, avatarKey: null });

      const me = await service.removeAvatar('user-1');

      expect(me.avatarUrl).toBeNull();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { avatarKey: null },
        include: { oauthAccounts: true },
      });
      expect(storage.deleteObject).toHaveBeenCalledWith(
        'avatars/user-1/old.png',
      );
    });
  });

  describe('unlinkGoogle', () => {
    it('refuses to unlink when the account has no password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
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
        ...baseUser,
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

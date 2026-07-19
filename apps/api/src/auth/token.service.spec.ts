import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;

  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  describe('rotateRefreshToken', () => {
    it('revokes the presented token and issues a new one', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.rotateRefreshToken('raw-token');

      expect(result.userId).toBe('user-1');
      expect(result.token).toEqual(expect.any(String));
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-1' }) as object,
      });
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotateRefreshToken('nope')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('revokes the whole family when an already-rotated token is replayed', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.rotateRefreshToken('stolen')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an expired token without revoking the family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.rotateRefreshToken('old')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('consumeVerificationToken', () => {
    const validRecord = {
      id: 'vt-1',
      userId: 'user-1',
      kind: 'password_reset',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('marks the token used on first consumption', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(validRecord);

      const result = await service.consumeVerificationToken(
        'raw',
        'password_reset',
      );

      expect(result.userId).toBe('user-1');
      expect(prisma.verificationToken.update).toHaveBeenCalledWith({
        where: { id: 'vt-1' },
        data: { usedAt: expect.any(Date) as Date },
      });
    });

    it('rejects a token that was already used', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        usedAt: new Date(),
      });

      await expect(
        service.consumeVerificationToken('raw', 'password_reset'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.verificationToken.update).not.toHaveBeenCalled();
    });

    it('rejects a token of the wrong kind', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(validRecord);

      await expect(
        service.consumeVerificationToken('raw', 'email_verify'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an expired token', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...validRecord,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(
        service.consumeVerificationToken('raw', 'password_reset'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('email codes', () => {
    const hash = (userId: string, code: string) =>
      createHash('sha256').update(`${userId}:${code}`).digest('hex');
    const activeRecord = (code: string) => ({
      id: 'vt-1',
      userId: 'user-1',
      kind: 'email_verify',
      tokenHash: hash('user-1', code),
      attempts: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    it('createEmailCode invalidates previous codes and returns 6 digits', async () => {
      const code = await service.createEmailCode('user-1');

      expect(code).toMatch(/^\d{6}$/);
      expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', kind: 'email_verify' },
      });
      expect(prisma.verificationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          kind: 'email_verify',
          tokenHash: hash('user-1', code),
        }) as object,
      });
    });

    it('accepts the right code and marks it used', async () => {
      prisma.verificationToken.findFirst.mockResolvedValue(
        activeRecord('123456'),
      );

      await service.consumeEmailCode('user-1', '123456');

      expect(prisma.verificationToken.update).toHaveBeenCalledWith({
        where: { id: 'vt-1' },
        data: { usedAt: expect.any(Date) as Date },
      });
    });

    it('counts a wrong code and burns it on the final attempt', async () => {
      prisma.verificationToken.findFirst.mockResolvedValue({
        ...activeRecord('123456'),
        attempts: 4,
      });

      await expect(
        service.consumeEmailCode('user-1', '999999'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.verificationToken.update).toHaveBeenCalledWith({
        where: { id: 'vt-1' },
        data: { attempts: 5, usedAt: expect.any(Date) as Date },
      });
    });

    it('rejects a burned code even when the guess is right', async () => {
      prisma.verificationToken.findFirst.mockResolvedValue({
        ...activeRecord('123456'),
        attempts: 5,
      });

      await expect(
        service.consumeEmailCode('user-1', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.verificationToken.update).not.toHaveBeenCalled();
    });

    it('rejects an expired code', async () => {
      prisma.verificationToken.findFirst.mockResolvedValue({
        ...activeRecord('123456'),
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(
        service.consumeEmailCode('user-1', '123456'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let service: AuthService;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const tokens = {
    signAccessToken: jest.fn().mockReturnValue('access'),
    issueRefreshToken: jest.fn().mockResolvedValue('refresh'),
    rotateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeAllRefreshTokens: jest.fn(),
    createVerificationToken: jest.fn().mockResolvedValue('one-time'),
    consumeVerificationToken: jest.fn(),
  };
  const mailer = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenService, useValue: tokens },
        { provide: MailerService, useValue: mailer },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('register rejects duplicate emails with a generic message', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({
        email: 'taken@example.com',
        password: 'password1',
        displayName: 'X',
        role: 'amateur',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('login uses one generic error for unknown email and OAuth-only accounts', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await service
      .login({ email: 'a@b.c', password: 'x' })
      .catch((error: UnauthorizedException) => error.message);

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      passwordHash: null,
      oauthAccounts: [],
    });
    const oauthOnly = await service
      .login({ email: 'a@b.c', password: 'x' })
      .catch((error: UnauthorizedException) => error.message);

    expect(unknown).toBe(oauthOnly);
  });

  it('resetPassword consumes the token, updates the hash, and revokes all sessions', async () => {
    tokens.consumeVerificationToken.mockResolvedValue({ userId: 'user-1' });

    await service.resetPassword('one-time', 'new-password');

    expect(tokens.consumeVerificationToken).toHaveBeenCalledWith(
      'one-time',
      'password_reset',
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.any(String) as string },
    });
    expect(tokens.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1');
  });

  it('forgotPassword resolves silently for unknown emails', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.forgotPassword('ghost@example.com'),
    ).resolves.toBeUndefined();
    expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

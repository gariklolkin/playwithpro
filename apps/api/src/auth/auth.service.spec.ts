import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
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

  it('register stores the client timezone on the new user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      role: 'AMATEUR',
      displayName: 'N',
      locale: 'en',
      timezone: 'Europe/Berlin',
      emailVerifiedAt: null,
      passwordHash: 'hash',
      oauthAccounts: [],
    });

    await service.register({
      email: 'new@example.com',
      password: 'password1',
      displayName: 'N',
      role: 'amateur',
      timezone: 'Europe/Berlin',
    } as never);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timezone: 'Europe/Berlin' }) as object,
      }),
    );
  });

  it('register without a timezone leaves the database default', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      role: 'AMATEUR',
      displayName: 'N',
      locale: 'en',
      timezone: 'UTC',
      emailVerifiedAt: null,
      passwordHash: 'hash',
      oauthAccounts: [],
    });

    await service.register({
      email: 'new@example.com',
      password: 'password1',
      displayName: 'N',
      role: 'amateur',
    } as never);

    const [createArg] = prisma.user.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(createArg.data).not.toHaveProperty('timezone');
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

  it('login refuses a correct password while the email is unconfirmed', async () => {
    const passwordHash = await argon2.hash('password1', {
      type: argon2.argon2id,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash,
      emailVerifiedAt: null,
      oauthAccounts: [],
    });

    await expect(
      service.login({ email: 'a@b.c', password: 'password1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('register creates the account without signing in', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'n@e.c' });

    await service.register({
      email: 'n@e.c',
      password: 'password1',
      displayName: 'N',
      role: 'amateur',
    } as never);

    expect(mailer.sendVerificationEmail).toHaveBeenCalled();
    expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
  });

  it('verifyEmail confirms the address and signs the user in', async () => {
    tokens.consumeVerificationToken.mockResolvedValue({ userId: 'u1' });
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      email: 'n@e.c',
      role: 'AMATEUR',
      displayName: 'N',
      locale: 'en',
      timezone: 'UTC',
      emailVerifiedAt: new Date(),
      passwordHash: 'hash',
      oauthAccounts: [],
    });

    const result = await service.verifyEmail('one-time');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { emailVerifiedAt: expect.any(Date) as Date },
      }),
    );
    expect(result.user.emailVerified).toBe(true);
    expect(result.tokens.refreshToken).toBe('refresh');
  });

  it('refresh kills sessions of unverified accounts', async () => {
    tokens.rotateRefreshToken.mockResolvedValue({
      userId: 'u1',
      token: 'next',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      emailVerifiedAt: null,
      oauthAccounts: [],
    });

    await expect(service.refresh('raw')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
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

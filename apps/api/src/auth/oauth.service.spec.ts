import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LegalService } from '../legal/legal.service';
import type { OAuthCompleteDto } from './dto/oauth-complete.dto';
import { AuthService } from './auth.service';
import { GoogleProfile } from './google-oauth.client';
import { OAuthService } from './oauth.service';

const profile: GoogleProfile = {
  providerAccountId: 'google-sub-1',
  email: 'player@example.com',
  emailVerified: true,
  displayName: 'Player One',
};

describe('OAuthService', () => {
  let service: OAuthService;

  const prisma = {
    oAuthAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(
      (fn: (t: typeof prisma) => Promise<unknown>): Promise<unknown> =>
        fn(prisma),
    ),
  };
  const legal = { assertCurrent: jest.fn(), record: jest.fn() };
  const signup = (role: Role, timezone?: string): OAuthCompleteDto =>
    ({
      role,
      timezone,
      acceptedTerms: '2026-09-18',
      acceptedPrivacy: '2026-09-18',
      locale: 'fr',
    }) as OAuthCompleteDto;
  const auth = {
    signIn: jest.fn().mockResolvedValue({
      user: { id: 'user-1' },
      tokens: { accessToken: 'a', refreshToken: 'r' },
    }),
  };
  const jwt = {
    sign: jest.fn().mockReturnValue('pending-jwt'),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
      ],
    }).compile();
    service = moduleRef.get(OAuthService);
  });

  describe('handleGoogleCallback', () => {
    it('returns pending signup for a brand new email (no user row yet)', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      const outcome = await service.handleGoogleCallback(profile);

      expect(outcome).toEqual({
        kind: 'pending_signup',
        pendingToken: 'pending-jwt',
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('signs in directly when the Google account is already linked', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({
        user: { id: 'user-1', oauthAccounts: [] },
      });

      const outcome = await service.handleGoogleCallback(profile);

      expect(outcome.kind).toBe('signed_in');
      expect(auth.signIn).toHaveBeenCalled();
    });

    it('links the Google account to an existing verified user', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        emailVerifiedAt: new Date(),
        oauthAccounts: [],
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        oauthAccounts: [{ provider: 'google' }],
      });

      const outcome = await service.handleGoogleCallback(profile);

      expect(outcome.kind).toBe('signed_in');
      expect(prisma.oAuthAccount.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          provider: 'google',
          providerAccountId: 'google-sub-1',
        },
      });
    });

    it('returns suspended for a linked account under suspension', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({
        user: { id: 'user-1', suspendedAt: new Date(), oauthAccounts: [] },
      });

      const outcome = await service.handleGoogleCallback(profile);

      expect(outcome).toEqual({ kind: 'suspended' });
      expect(auth.signIn).not.toHaveBeenCalled();
    });

    it('refuses to link to a suspended existing account', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        emailVerifiedAt: new Date(),
        suspendedAt: new Date(),
        oauthAccounts: [],
      });

      const outcome = await service.handleGoogleCallback(profile);

      expect(outcome).toEqual({ kind: 'suspended' });
      expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
    });

    it('refuses to link when the existing account email is unverified', async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        emailVerifiedAt: null,
        oauthAccounts: [],
      });

      const outcome = await service.handleGoogleCallback(profile);

      expect(outcome).toEqual({ kind: 'email_conflict' });
      expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
    });
  });

  describe('completeSignup', () => {
    const pendingPayload = {
      kind: 'oauth_pending',
      provider: 'google',
      providerAccountId: 'google-sub-1',
      email: 'player@example.com',
      displayName: 'Player One',
    };

    it('creates a verified user with the chosen role and linked account', async () => {
      jwt.verify.mockReturnValue(pendingPayload);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        oauthAccounts: [{ provider: 'google' }],
      });

      await service.completeSignup('pending-jwt', signup(Role.Professional));

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'player@example.com',
          role: 'PROFESSIONAL',
          displayName: 'Player One',
          emailVerifiedAt: expect.any(Date) as Date,
          locale: 'fr',
        }) as object,
        include: { oauthAccounts: true },
      });
      expect(legal.record).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          userId: 'user-1',
          locale: 'fr',
          context: 'oauth_complete',
        }),
      );
      expect(auth.signIn).toHaveBeenCalled();
    });
    it('stores the client timezone on the created user', async () => {
      jwt.verify.mockReturnValue(pendingPayload);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        oauthAccounts: [{ provider: 'google' }],
      });

      await service.completeSignup(
        'pending-jwt',
        signup(Role.Amateur, 'Asia/Tokyo'),
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timezone: 'Asia/Tokyo' }) as object,
        }),
      );
    });

    it('rejects a missing or invalid pending token', async () => {
      await expect(
        service.completeSignup(undefined, signup(Role.Amateur)),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      jwt.verify.mockImplementation(() => {
        throw new Error('expired');
      });
      await expect(
        service.completeSignup('bad', signup(Role.Amateur)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the email got registered meanwhile', async () => {
      jwt.verify.mockReturnValue(pendingPayload);
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.completeSignup('pending-jwt', signup(Role.Amateur)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

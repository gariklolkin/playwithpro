import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignupRole } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaRole } from '../users/user.mapper';
import { AuthResult, AuthService } from './auth.service';
import { GoogleProfile } from './google-oauth.client';

const PENDING_SIGNUP_TTL = '15m';

export type GoogleCallbackOutcome =
  | { kind: 'signed_in'; result: AuthResult }
  /** No account for this email yet — role choice pending, no user row created. */
  | { kind: 'pending_signup'; pendingToken: string }
  /** Email belongs to an unverified password account — refuse silent takeover. */
  | { kind: 'email_conflict' };

interface PendingSignupPayload {
  kind: 'oauth_pending';
  provider: 'google';
  providerAccountId: string;
  email: string;
  displayName: string;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  async handleGoogleCallback(
    profile: GoogleProfile,
  ): Promise<GoogleCallbackOutcome> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: { include: { oauthAccounts: true } } },
    });
    if (account) {
      return {
        kind: 'signed_in',
        result: await this.auth.signIn(account.user),
      };
    }

    if (!profile.emailVerified) {
      return { kind: 'email_conflict' };
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { oauthAccounts: true },
    });
    if (existing) {
      if (existing.emailVerifiedAt === null) {
        return { kind: 'email_conflict' };
      }
      await this.prisma.oAuthAccount.create({
        data: {
          userId: existing.id,
          provider: 'google',
          providerAccountId: profile.providerAccountId,
        },
      });
      const linked = await this.prisma.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: { oauthAccounts: true },
      });
      return { kind: 'signed_in', result: await this.auth.signIn(linked) };
    }

    const payload: PendingSignupPayload = {
      kind: 'oauth_pending',
      provider: 'google',
      providerAccountId: profile.providerAccountId,
      email: profile.email,
      displayName: profile.displayName,
    };
    return {
      kind: 'pending_signup',
      pendingToken: this.jwt.sign(payload, { expiresIn: PENDING_SIGNUP_TTL }),
    };
  }

  /** Finishes first-time Google signup once the visitor picked a role. */
  async completeSignup(
    pendingToken: string | undefined,
    role: SignupRole,
    timezone?: string,
  ): Promise<AuthResult> {
    if (!pendingToken) {
      throw new UnauthorizedException();
    }
    let payload: PendingSignupPayload;
    try {
      payload = this.jwt.verify<PendingSignupPayload>(pendingToken);
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.kind !== 'oauth_pending') {
      throw new UnauthorizedException();
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists. Log in instead.',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email: payload.email,
        role: toPrismaRole(role),
        displayName: payload.displayName,
        ...(timezone ? { timezone } : {}),
        emailVerifiedAt: new Date(), // Google already verified the address
        oauthAccounts: {
          create: {
            provider: payload.provider,
            providerAccountId: payload.providerAccountId,
          },
        },
      },
      include: { oauthAccounts: true },
    });
    return this.auth.signIn(user);
  }
}

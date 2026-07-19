import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@playwithpro/shared';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000;
// 6-digit codes are low-entropy: short TTL + attempt cap make up for it.
export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export type VerificationKind = 'email_verify' | 'password_reset';

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(userId: string, role: Role): string {
    const payload: AccessTokenPayload = { sub: userId, role };
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token);
  }

  async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return raw;
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token is treated
   * as theft: every refresh token of that user is revoked.
   */
  async rotateRefreshToken(
    raw: string,
  ): Promise<{ userId: string; token: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });
    if (!record) {
      throw new UnauthorizedException();
    }
    if (record.revokedAt) {
      await this.revokeAllRefreshTokens(record.userId);
      throw new UnauthorizedException();
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException();
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const token = await this.issueRefreshToken(record.userId);
    return { userId: record.userId, token };
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async createVerificationToken(
    userId: string,
    kind: VerificationKind,
  ): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    await this.prisma.verificationToken.create({
      data: {
        userId,
        kind,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
    return raw;
  }

  /** Consumes a single-use token; any invalid state yields the same error. */
  async consumeVerificationToken(
    raw: string,
    kind: VerificationKind,
  ): Promise<{ userId: string }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });
    if (
      !record ||
      record.kind !== kind ||
      record.usedAt !== null ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException('This link is invalid or has expired.');
    }
    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return { userId: record.userId };
  }

  /** Issues a fresh email code; any previous code for the user stops working. */
  async createEmailCode(userId: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({
        where: { userId, kind: 'email_verify' },
      }),
      this.prisma.verificationToken.create({
        data: {
          userId,
          kind: 'email_verify',
          // Salted by userId: identical codes for different users must not
          // collide on the unique tokenHash column.
          tokenHash: hashToken(`${userId}:${code}`),
          expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        },
      }),
    ]);
    return code;
  }

  /**
   * Checks a submitted email code. Wrong entries count toward a cap that
   * burns the code; every failure mode throws the same error.
   */
  async consumeEmailCode(userId: string, code: string): Promise<void> {
    const invalid = new BadRequestException(
      'This code is invalid or has expired.',
    );
    const record = await this.prisma.verificationToken.findFirst({
      where: { userId, kind: 'email_verify', usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !record ||
      record.expiresAt < new Date() ||
      record.attempts >= EMAIL_CODE_MAX_ATTEMPTS
    ) {
      throw invalid;
    }
    if (record.tokenHash !== hashToken(`${userId}:${code}`)) {
      const attempts = record.attempts + 1;
      await this.prisma.verificationToken.update({
        where: { id: record.id },
        data: {
          attempts,
          // The final wrong attempt burns the code for good.
          ...(attempts >= EMAIL_CODE_MAX_ATTEMPTS
            ? { usedAt: new Date() }
            : {}),
        },
      });
      throw invalid;
    }
    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
  }
}

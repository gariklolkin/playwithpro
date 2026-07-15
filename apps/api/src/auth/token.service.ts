import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@playwithpro/shared';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000;

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
}

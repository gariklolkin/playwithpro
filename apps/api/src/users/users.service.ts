import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MeResponse } from '@playwithpro/shared';
import * as argon2 from 'argon2';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { toMeResponse, UserWithOAuth } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async getMe(userId: string): Promise<MeResponse> {
    return toMeResponse(await this.requireUser(userId));
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<MeResponse> {
    await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        locale: dto.locale,
        timezone: dto.timezone,
      },
      include: { oauthAccounts: true },
    });
    return toMeResponse(user);
  }

  /**
   * Changes the password and revokes every refresh token; the caller gets a
   * fresh pair from the controller so only other sessions are logged out.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.passwordHash === null) {
      throw new BadRequestException(
        'This account has no password yet. Use password reset to set one.',
      );
    }
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.tokens.revokeAllRefreshTokens(userId);
  }

  /** Unlinking Google is forbidden while the account has no password. */
  async unlinkGoogle(userId: string): Promise<MeResponse> {
    const user = await this.requireUser(userId);
    if (user.passwordHash === null) {
      throw new ForbiddenException(
        'Set a password before unlinking your Google account.',
      );
    }
    await this.prisma.oAuthAccount.deleteMany({
      where: { userId, provider: 'google' },
    });
    return this.getMe(userId);
  }

  private async requireUser(userId: string): Promise<UserWithOAuth> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { oauthAccounts: true },
    });
    if (!user) {
      throw new NotFoundException();
    }
    return user;
  }
}

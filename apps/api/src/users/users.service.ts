import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeResponse } from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toMeResponse, UserWithOAuth } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<MeResponse> {
    return toMeResponse(await this.requireUser(userId));
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

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AVATAR_ALLOWED_CONTENT_TYPES,
  AVATAR_MAX_SIZE_BYTES,
  AvatarUploadUrlResponse,
  MeResponse,
} from '@playwithpro/shared';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { TokenService } from '../auth/token.service';
import { AvailabilityMaterializerService } from '../availability/availability-materializer.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AvatarUploadUrlDto } from './dto/avatar-upload-url.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { toMeResponse, UserWithOAuth } from './user.mapper';

const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly availabilityMaterializer: AvailabilityMaterializerService,
    private readonly storage: StorageService,
  ) {}

  private readonly avatarUrlOf = (key: string): string =>
    this.storage.objectUrl(key);

  async getMe(userId: string): Promise<MeResponse> {
    return toMeResponse(await this.requireUser(userId), this.avatarUrlOf);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<MeResponse> {
    const before = await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        locale: dto.locale,
        timezone: dto.timezone,
      },
      include: { oauthAccounts: true },
    });
    if (dto.timezone && dto.timezone !== before.timezone) {
      // The weekly template is anchored to the coach's wall clock, so slot
      // instants must be recomputed under the new timezone.
      await this.availabilityMaterializer.rematerializeForUser(userId);
    }
    return toMeResponse(user, this.avatarUrlOf);
  }

  /** Step 1 of the avatar flow: validate intent, hand out a pre-signed PUT. */
  async createAvatarUploadUrl(
    userId: string,
    dto: AvatarUploadUrlDto,
  ): Promise<AvatarUploadUrlResponse> {
    const key = `avatars/${userId}/${randomUUID()}.${AVATAR_EXTENSIONS[dto.contentType]}`;
    return {
      uploadUrl: await this.storage.presignPut(key, dto.contentType),
      key,
    };
  }

  /** Step 2: the browser uploaded directly to storage; verify and attach. */
  async confirmAvatar(userId: string, key: string): Promise<MeResponse> {
    if (!key.startsWith(`avatars/${userId}/`)) {
      throw new ForbiddenException('This upload does not belong to you.');
    }
    const head = await this.storage.headObject(key);
    if (!head) {
      throw new BadRequestException('Uploaded file not found in storage.');
    }
    if (head.contentLength > AVATAR_MAX_SIZE_BYTES) {
      await this.storage.deleteObject(key);
      throw new BadRequestException('Avatar exceeds the 5 MB size limit.');
    }
    if (
      !(AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(
        head.contentType,
      )
    ) {
      await this.storage.deleteObject(key);
      throw new BadRequestException('Avatar must be a JPEG, PNG, or WebP.');
    }
    const before = await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key },
      include: { oauthAccounts: true },
    });
    if (before.avatarKey && before.avatarKey !== key) {
      await this.storage.deleteObject(before.avatarKey);
    }
    return toMeResponse(user, this.avatarUrlOf);
  }

  async removeAvatar(userId: string): Promise<MeResponse> {
    const before = await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: null },
      include: { oauthAccounts: true },
    });
    if (before.avatarKey) {
      await this.storage.deleteObject(before.avatarKey);
    }
    return toMeResponse(user, this.avatarUrlOf);
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

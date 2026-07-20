import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PlayerCardResponse,
  PlayerProfileResponse,
  UpdatePlayerProfileRequest,
} from '@playwithpro/shared';
import { PlayerProfile, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  toPlayerProfileResponse,
  toPrismaGrip,
  toPrismaHandedness,
  toPrismaLevel,
  toPrismaStyle,
} from './player-profile.mapper';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Returns the player's profile, creating an empty one on first access. */
  private async ensureProfile(userId: string): Promise<PlayerProfile> {
    const existing = await this.prisma.playerProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.playerProfile.create({ data: { userId } });
  }

  async getProfile(userId: string): Promise<PlayerProfileResponse> {
    return toPlayerProfileResponse(await this.ensureProfile(userId));
  }

  async updateProfile(
    userId: string,
    dto: UpdatePlayerProfileRequest,
  ): Promise<PlayerProfileResponse> {
    const profile = await this.ensureProfile(userId);
    const updated = await this.prisma.playerProfile.update({
      where: { id: profile.id },
      data: {
        level: dto.level === undefined ? undefined : toPrismaLevel(dto.level),
        style: toPrismaStyle(dto.style),
        yearsOfExperience: dto.yearsOfExperience,
        handedness: toPrismaHandedness(dto.handedness),
        grip: toPrismaGrip(dto.grip),
        about: dto.about,
      },
    });
    return toPlayerProfileResponse(updated);
  }

  /** Read-only card for coaches/admins: playing details + public identity. */
  async getPlayerCard(playerUserId: string): Promise<PlayerCardResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: playerUserId },
      include: { playerProfile: true },
    });
    if (!user || user.role !== Role.AMATEUR) {
      throw new NotFoundException('Player not found.');
    }
    const profile =
      user.playerProfile ?? (await this.ensureProfile(playerUserId));
    return {
      ...toPlayerProfileResponse(profile),
      userId: user.id,
      displayName: user.displayName,
      avatarUrl:
        user.avatarKey === null ? null : this.storage.objectUrl(user.avatarKey),
    };
  }
}

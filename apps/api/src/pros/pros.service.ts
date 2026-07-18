import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  ProProfileResponse,
  ServiceType,
  SubmitVerificationRequest,
  UpdateProProfileRequest,
  UpsertProServiceRequest,
} from '@playwithpro/shared';
import { ProProfileStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProfileWithRelations,
  toPrismaServiceType,
  toProfileResponse,
} from './pro-profile.mapper';

/** Latest verification request first; that's the one shown to the coach. */
const PROFILE_INCLUDE = {
  services: { orderBy: { type: 'asc' } },
  verificationRequests: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const;

@Injectable()
export class ProsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the coach's profile, creating an empty draft on first access. */
  private async ensureProfile(userId: string): Promise<ProfileWithRelations> {
    const existing = await this.prisma.proProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    if (existing) {
      return existing;
    }
    return this.prisma.proProfile.create({
      data: { userId },
      include: PROFILE_INCLUDE,
    });
  }

  async getProfile(userId: string): Promise<ProProfileResponse> {
    return toProfileResponse(await this.ensureProfile(userId));
  }

  async updateProfile(
    userId: string,
    dto: UpdateProProfileRequest,
  ): Promise<ProProfileResponse> {
    const profile = await this.ensureProfile(userId);
    const updated = await this.prisma.proProfile.update({
      where: { id: profile.id },
      data: {
        bio: dto.bio,
        achievements: dto.achievements,
        languages: dto.languages,
      },
      include: PROFILE_INCLUDE,
    });
    return toProfileResponse(updated);
  }

  async upsertService(
    userId: string,
    type: ServiceType,
    dto: UpsertProServiceRequest,
  ): Promise<ProProfileResponse> {
    if (
      type === ServiceType.Game &&
      (!dto.venueLabel?.trim() ||
        dto.venueLat === undefined ||
        dto.venueLng === undefined)
    ) {
      throw new BadRequestException(
        'The in-person game service requires a venue picked on the map.',
      );
    }
    const profile = await this.ensureProfile(userId);
    const prismaType = toPrismaServiceType(type);
    const data = {
      priceMinor: dto.priceMinor,
      currency: dto.currency.toUpperCase(),
      venueLabel: dto.venueLabel?.trim() ?? '',
      venueLat: dto.venueLat ?? null,
      venueLng: dto.venueLng ?? null,
      active: dto.active ?? true,
    };
    await this.prisma.proService.upsert({
      where: {
        profileId_type: { profileId: profile.id, type: prismaType },
      },
      create: { profileId: profile.id, type: prismaType, ...data },
      update: data,
    });
    return this.getProfile(userId);
  }

  async deleteService(
    userId: string,
    type: ServiceType,
  ): Promise<ProProfileResponse> {
    const profile = await this.ensureProfile(userId);
    await this.prisma.proService.deleteMany({
      where: { profileId: profile.id, type: toPrismaServiceType(type) },
    });
    return this.getProfile(userId);
  }

  async submitVerification(
    userId: string,
    dto: SubmitVerificationRequest,
  ): Promise<ProProfileResponse> {
    const profile = await this.ensureProfile(userId);

    if (profile.status === ProProfileStatus.PENDING_REVIEW) {
      throw new ConflictException('A verification request is already pending.');
    }
    if (profile.status === ProProfileStatus.VERIFIED) {
      throw new ConflictException('This profile is already verified.');
    }

    const missing: string[] = [];
    if (!profile.bio.trim()) {
      missing.push('a bio');
    }
    if (profile.languages.length === 0) {
      missing.push('at least one language');
    }
    if (!profile.services.some((service) => service.active)) {
      missing.push('at least one active service');
    }
    if (missing.length > 0) {
      throw new ConflictException(
        `Complete your profile before submitting: add ${missing.join(', ')}.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.verificationRequest.create({
        data: {
          profileId: profile.id,
          credentials: dto.credentials.trim(),
          contact: dto.contact.trim(),
        },
      }),
      this.prisma.proProfile.update({
        where: { id: profile.id },
        data: { status: ProProfileStatus.PENDING_REVIEW },
      }),
    ]);
    return this.getProfile(userId);
  }
}

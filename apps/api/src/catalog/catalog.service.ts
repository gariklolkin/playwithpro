import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CATALOG_PAGE_SIZE,
  CatalogCoachCard,
  CatalogResponse,
  PublicProProfileResponse,
} from '@playwithpro/shared';
import {
  Prisma,
  ProProfileStatus,
  ProService,
  SlotStatus,
  User,
} from '@prisma/client';
import { MIN_NOTICE_MS } from '../availability/availability.service';
import {
  ratingAvg,
  toPrismaServiceType,
  toServiceResponse,
} from '../pros/pro-profile.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';

type CatalogProfile = {
  id: string;
  bio: string;
  languages: string[];
  ratingSum: number;
  ratingCount: number;
  user: Pick<User, 'displayName' | 'avatarKey'>;
  services: ProService[];
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: CatalogQueryDto): Promise<CatalogResponse> {
    // When service types and a price cap are both given, one and the same
    // service must satisfy both — a cheap consultation must not surface an
    // expensive video-analysis coach under a video-analysis filter.
    const serviceFilter: Prisma.ProServiceWhereInput = {
      active: true,
      ...(query.serviceTypes?.length
        ? { type: { in: query.serviceTypes.map(toPrismaServiceType) } }
        : {}),
      ...(query.maxPriceMinor !== undefined
        ? { priceMinor: { lte: query.maxPriceMinor } }
        : {}),
    };
    const where: Prisma.ProProfileWhereInput = {
      status: ProProfileStatus.VERIFIED,
      ...(query.languages?.length
        ? { languages: { hasSome: query.languages } }
        : {}),
      services: { some: serviceFilter },
    };
    const page = query.page ?? 1;
    const [total, profiles] = await this.prisma.$transaction([
      this.prisma.proProfile.count({ where }),
      this.prisma.proProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * CATALOG_PAGE_SIZE,
        take: CATALOG_PAGE_SIZE,
        select: {
          id: true,
          bio: true,
          languages: true,
          ratingSum: true,
          ratingCount: true,
          user: { select: { displayName: true, avatarKey: true } },
          services: { where: { active: true }, orderBy: { type: 'asc' } },
        },
      }),
    ]);
    const nextSlots = await this.nextSlotByProfile(
      profiles.map((profile) => profile.id),
    );
    return {
      items: profiles.map((profile) =>
        this.toCard(profile, nextSlots.get(profile.id) ?? null),
      ),
      total,
      page,
      pageSize: CATALOG_PAGE_SIZE,
    };
  }

  async getPublicProfile(proId: string): Promise<PublicProProfileResponse> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { id: proId },
      select: {
        id: true,
        status: true,
        bio: true,
        languages: true,
        ratingSum: true,
        ratingCount: true,
        user: { select: { displayName: true, avatarKey: true } },
        services: { where: { active: true }, orderBy: { type: 'asc' } },
      },
    });
    if (!profile || profile.status !== ProProfileStatus.VERIFIED) {
      throw new NotFoundException();
    }
    return {
      id: profile.id,
      displayName: profile.user.displayName,
      avatarUrl: this.avatarUrl(profile.user.avatarKey),
      bio: profile.bio,
      languages: profile.languages,
      services: profile.services.map(toServiceResponse),
      ratingAvg: ratingAvg(profile.ratingSum, profile.ratingCount),
      ratingCount: profile.ratingCount,
    };
  }

  /** One grouped query for the whole page — no per-coach slot lookups. */
  private async nextSlotByProfile(
    profileIds: string[],
  ): Promise<Map<string, Date>> {
    if (profileIds.length === 0) {
      return new Map();
    }
    const grouped = await this.prisma.availabilitySlot.groupBy({
      by: ['profileId'],
      where: {
        profileId: { in: profileIds },
        status: SlotStatus.OPEN,
        startsAt: { gt: new Date(Date.now() + MIN_NOTICE_MS) },
      },
      _min: { startsAt: true },
    });
    return new Map(
      grouped
        .filter((row) => row._min.startsAt !== null)
        .map((row) => [row.profileId, row._min.startsAt as Date]),
    );
  }

  private toCard(
    profile: CatalogProfile,
    nextSlotAt: Date | null,
  ): CatalogCoachCard {
    const cheapest = profile.services.reduce((min, service) =>
      service.priceMinor < min.priceMinor ? service : min,
    );
    return {
      id: profile.id,
      displayName: profile.user.displayName,
      avatarUrl: this.avatarUrl(profile.user.avatarKey),
      languages: profile.languages,
      services: profile.services.map(toServiceResponse),
      priceFromMinor: cheapest.priceMinor,
      currency: cheapest.currency,
      nextSlotAt: nextSlotAt?.toISOString() ?? null,
      ratingAvg: ratingAvg(profile.ratingSum, profile.ratingCount),
      ratingCount: profile.ratingCount,
    };
  }

  private avatarUrl(avatarKey: string | null): string | null {
    return avatarKey === null ? null : this.storage.objectUrl(avatarKey);
  }
}

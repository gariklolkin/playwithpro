import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityRuleInput,
  CoachAvailabilityResponse,
  PublicAvailabilitySlot,
} from '@playwithpro/shared';
import {
  AvailabilitySlotSource,
  Prisma,
  ProProfile,
  ProProfileStatus,
  SlotStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityMaterializerService,
  SLOT_MINUTES,
} from './availability-materializer.service';

const MINUTE = 60_000;
const HOUR = 3_600_000;
/** Slots starting sooner than this are not offered publicly. */
export const MIN_NOTICE_MS = 2 * HOUR;
const MINUTES_PER_DAY = 24 * 60;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: AvailabilityMaterializerService,
  ) {}

  async getMyAvailability(userId: string): Promise<CoachAvailabilityResponse> {
    const profile = await this.ensureProfile(userId);
    return this.toResponse(profile.id, userId);
  }

  /** Replaces the whole weekly template and re-materializes slots. */
  async replaceRules(
    userId: string,
    rules: AvailabilityRuleInput[],
  ): Promise<CoachAvailabilityResponse> {
    validateRules(rules);
    const profile = await this.ensureProfile(userId);
    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({
        where: { profileId: profile.id },
      }),
      this.prisma.availabilityRule.createMany({
        data: rules.map((rule) => ({ ...rule, profileId: profile.id })),
      }),
    ]);
    await this.materializer.materializeProfile(profile.id);
    return this.toResponse(profile.id, userId);
  }

  async addManualSlot(
    userId: string,
    startsAtIso: string,
  ): Promise<CoachAvailabilityResponse> {
    const startsAt = new Date(startsAtIso);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid slot start.');
    }
    if (startsAt.getTime() % (30 * MINUTE) !== 0) {
      throw new BadRequestException('Slots must start on a :00/:30 boundary.');
    }
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('Slots must be in the future.');
    }
    const profile = await this.ensureProfile(userId);
    // A 60-minute slot overlaps any active slot starting less than an hour away.
    const overlapping = await this.prisma.availabilitySlot.findFirst({
      where: {
        profileId: profile.id,
        status: { not: SlotStatus.REMOVED },
        startsAt: {
          gt: new Date(startsAt.getTime() - SLOT_MINUTES * MINUTE),
          lt: new Date(startsAt.getTime() + SLOT_MINUTES * MINUTE),
        },
      },
    });
    if (overlapping) {
      throw new ConflictException('The slot overlaps an existing one.');
    }
    try {
      await this.prisma.availabilitySlot.create({
        data: {
          profileId: profile.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * MINUTE),
          source: AvailabilitySlotSource.MANUAL,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // A REMOVED row still owns this start; slot times stay unique per coach.
        throw new ConflictException('A slot already exists at this time.');
      }
      throw error;
    }
    return this.toResponse(profile.id, userId);
  }

  async removeSlot(
    userId: string,
    slotId: string,
  ): Promise<CoachAvailabilityResponse> {
    const profile = await this.ensureProfile(userId);
    const slot = await this.prisma.availabilitySlot.findUnique({
      where: { id: slotId },
    });
    if (!slot || slot.profileId !== profile.id) {
      throw new NotFoundException();
    }
    if (slot.status !== SlotStatus.OPEN) {
      throw new ConflictException('Only open slots can be removed.');
    }
    if (slot.source === AvailabilitySlotSource.MANUAL) {
      // Deleting frees the start for later re-adding; only rule-generated
      // removals need a tombstone to survive re-materialization.
      await this.prisma.availabilitySlot.delete({ where: { id: slot.id } });
    } else {
      await this.prisma.availabilitySlot.update({
        where: { id: slot.id },
        data: { status: SlotStatus.REMOVED },
      });
    }
    return this.toResponse(profile.id, userId);
  }

  /** Open bookable slots of a verified coach, for the catalog/booking flow. */
  async getPublicSlots(proId: string): Promise<PublicAvailabilitySlot[]> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { id: proId },
      select: { status: true },
    });
    if (!profile || profile.status !== ProProfileStatus.VERIFIED) {
      throw new NotFoundException();
    }
    const slots = await this.prisma.availabilitySlot.findMany({
      where: {
        profileId: proId,
        status: SlotStatus.OPEN,
        startsAt: { gt: new Date(Date.now() + MIN_NOTICE_MS) },
      },
      orderBy: { startsAt: 'asc' },
    });
    return slots.map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    }));
  }

  /** Mirrors the lazy draft-profile creation in ProsService. */
  private async ensureProfile(userId: string): Promise<ProProfile> {
    const existing = await this.prisma.proProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.proProfile.create({ data: { userId } });
  }

  private async toResponse(
    profileId: string,
    userId: string,
  ): Promise<CoachAvailabilityResponse> {
    const [user, rules, slots] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timezone: true },
      }),
      this.prisma.availabilityRule.findMany({
        where: { profileId },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.availabilitySlot.findMany({
        where: {
          profileId,
          status: { not: SlotStatus.REMOVED },
          startsAt: { gt: new Date() },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return {
      timezone: user.timezone,
      rules: rules.map((rule) => ({
        id: rule.id,
        weekday: rule.weekday,
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
      })),
      slots: slots.map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        status: slot.status === SlotStatus.BOOKED ? 'booked' : 'open',
        source:
          slot.source === AvailabilitySlotSource.MANUAL ? 'manual' : 'rule',
      })),
    };
  }
}

function validateRules(rules: AvailabilityRuleInput[]): void {
  for (const rule of rules) {
    if (rule.startMinute % 30 !== 0 || rule.endMinute % 30 !== 0) {
      throw new BadRequestException('Times must align to 30 minutes.');
    }
    if (rule.endMinute > MINUTES_PER_DAY) {
      throw new BadRequestException('A window must end within the day.');
    }
    if (rule.endMinute - rule.startMinute < SLOT_MINUTES) {
      throw new BadRequestException(
        'A window must be at least 60 minutes long.',
      );
    }
  }
  for (let weekday = 0; weekday < 7; weekday++) {
    const windows = rules
      .filter((rule) => rule.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < windows.length; i++) {
      if (windows[i].startMinute < windows[i - 1].endMinute) {
        throw new BadRequestException(
          'Windows on the same day must not overlap.',
        );
      }
    }
  }
}

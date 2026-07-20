import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AvailabilityRule,
  AvailabilitySlotSource,
  SlotStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, calendarDateIn, wallClockToUtc } from './timezone';

export const HORIZON_DAYS = 28;
export const SLOT_MINUTES = 60;
const MINUTE = 60_000;

type WeeklyRule = Pick<
  AvailabilityRule,
  'weekday' | 'startMinute' | 'endMinute'
>;

/**
 * Expands weekly rules into future UTC slot starts over the horizon,
 * iterating calendar days in the coach's timezone so wall-clock times
 * survive DST transitions. Deduped: a DST gap can fold two wall times
 * onto one instant.
 */
export function expandRules(
  rules: WeeklyRule[],
  timeZone: string,
  now: Date,
): Date[] {
  const starts = new Map<number, Date>();
  let day = calendarDateIn(timeZone, now);
  for (let i = 0; i < HORIZON_DAYS; i++) {
    for (const rule of rules) {
      if (rule.weekday !== day.weekday) {
        continue;
      }
      for (
        let minute = rule.startMinute;
        minute + SLOT_MINUTES <= rule.endMinute;
        minute += SLOT_MINUTES
      ) {
        const startsAt = wallClockToUtc(
          timeZone,
          day.year,
          day.month,
          day.day,
          minute,
        );
        if (startsAt.getTime() > now.getTime()) {
          starts.set(startsAt.getTime(), startsAt);
        }
      }
    }
    day = addDays(day, 1);
  }
  return [...starts.values()].sort((a, b) => a.getTime() - b.getTime());
}

@Injectable()
export class AvailabilityMaterializerService {
  private readonly logger = new Logger(AvailabilityMaterializerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Keeps the rolling horizon filled as days pass. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async materializeAll(): Promise<void> {
    const owners = await this.prisma.availabilityRule.findMany({
      distinct: ['profileId'],
      select: { profileId: true },
    });
    for (const { profileId } of owners) {
      try {
        await this.materializeProfile(profileId);
      } catch (error) {
        this.logger.error(
          `Slot materialization failed for profile ${profileId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /** Re-anchors rule-generated slots after the coach's timezone changes. */
  async rematerializeForUser(userId: string): Promise<void> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (profile) {
      await this.materializeProfile(profile.id);
    }
  }

  /**
   * Reconciles the coach's future slots with the weekly template:
   * missing starts are created; open rule-generated slots that no longer
   * match any rule are deleted. Existing rows at a desired start — in any
   * status, including REMOVED — are left untouched, which is what makes a
   * coach's one-off removal survive regeneration. MANUAL and BOOKED rows
   * are never modified.
   */
  async materializeProfile(profileId: string, now = new Date()): Promise<void> {
    const profile = await this.prisma.proProfile.findUnique({
      where: { id: profileId },
      include: {
        availabilityRules: true,
        user: { select: { timezone: true } },
      },
    });
    if (!profile) {
      return;
    }
    const desired = expandRules(
      profile.availabilityRules,
      profile.user.timezone,
      now,
    );
    const desiredStarts = new Set(desired.map((d) => d.getTime()));

    const existing = await this.prisma.availabilitySlot.findMany({
      where: { profileId, startsAt: { gt: now } },
      select: { id: true, startsAt: true, status: true, source: true },
    });
    const existingStarts = new Set(existing.map((s) => s.startsAt.getTime()));

    const toCreate = desired.filter((d) => !existingStarts.has(d.getTime()));
    const staleIds = existing
      .filter(
        (slot) =>
          slot.source === AvailabilitySlotSource.RULE &&
          slot.status === SlotStatus.OPEN &&
          !desiredStarts.has(slot.startsAt.getTime()),
      )
      .map((slot) => slot.id);

    if (toCreate.length === 0 && staleIds.length === 0) {
      return;
    }
    await this.prisma.$transaction([
      this.prisma.availabilitySlot.deleteMany({
        where: { id: { in: staleIds } },
      }),
      this.prisma.availabilitySlot.createMany({
        data: toCreate.map((startsAt) => ({
          profileId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * MINUTE),
        })),
        // Guards against a concurrent materialization racing the unique key.
        skipDuplicates: true,
      }),
    ]);
  }
}

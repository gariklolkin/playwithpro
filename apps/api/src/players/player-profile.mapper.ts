import {
  Grip,
  Handedness,
  PlayerLevel,
  PlayerProfileResponse,
  PlayingStyle,
} from '@playwithpro/shared';
import {
  Grip as PrismaGrip,
  Handedness as PrismaHandedness,
  PlayerLevel as PrismaPlayerLevel,
  PlayerProfile,
  PlayingStyle as PrismaPlayingStyle,
} from '@prisma/client';

export function toSharedLevel(level: PrismaPlayerLevel): PlayerLevel {
  return level.toLowerCase() as PlayerLevel;
}

export function toPrismaLevel(level: PlayerLevel): PrismaPlayerLevel {
  return level.toUpperCase() as PrismaPlayerLevel;
}

export function toSharedHandedness(
  handedness: PrismaHandedness | null,
): Handedness | null {
  return handedness === null ? null : (handedness.toLowerCase() as Handedness);
}

export function toPrismaHandedness(
  handedness: Handedness | null | undefined,
): PrismaHandedness | null | undefined {
  if (handedness === undefined) return undefined;
  return handedness === null
    ? null
    : (handedness.toUpperCase() as PrismaHandedness);
}

export function toSharedStyle(
  style: PrismaPlayingStyle | null,
): PlayingStyle | null {
  return style === null ? null : (style.toLowerCase() as PlayingStyle);
}

export function toPrismaStyle(
  style: PlayingStyle | null | undefined,
): PrismaPlayingStyle | null | undefined {
  if (style === undefined) return undefined;
  return style === null ? null : (style.toUpperCase() as PrismaPlayingStyle);
}

export function toSharedGrip(grip: PrismaGrip | null): Grip | null {
  return grip === null ? null : (grip.toLowerCase() as Grip);
}

export function toPrismaGrip(
  grip: Grip | null | undefined,
): PrismaGrip | null | undefined {
  if (grip === undefined) return undefined;
  return grip === null ? null : (grip.toUpperCase() as PrismaGrip);
}

export function toPlayerProfileResponse(
  profile: PlayerProfile,
): PlayerProfileResponse {
  return {
    id: profile.id,
    level: toSharedLevel(profile.level),
    style: toSharedStyle(profile.style),
    yearsOfExperience: profile.yearsOfExperience,
    handedness: toSharedHandedness(profile.handedness),
    grip: toSharedGrip(profile.grip),
    about: profile.about,
  };
}

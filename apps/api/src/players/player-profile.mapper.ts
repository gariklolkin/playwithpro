import {
  Grip,
  Handedness,
  PlayerCardResponse,
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

/**
 * A profile row is created lazily on first read with default values; only a
 * later save bumps `updatedAt` past `createdAt`. Equality means unfilled.
 */
export function isProfileFilled(
  profile: Pick<PlayerProfile, 'createdAt' | 'updatedAt'>,
): boolean {
  return profile.updatedAt.getTime() > profile.createdAt.getTime();
}

export function toPlayerProfileResponse(
  profile: PlayerProfile,
): PlayerProfileResponse {
  return {
    id: profile.id,
    filled: isProfileFilled(profile),
    level: toSharedLevel(profile.level),
    style: toSharedStyle(profile.style),
    yearsOfExperience: profile.yearsOfExperience,
    handedness: toSharedHandedness(profile.handedness),
    grip: toSharedGrip(profile.grip),
    about: profile.about,
  };
}

/**
 * Read-only card for coaches (via a shared paid session) and admins. A
 * player who never opened their profile has no row yet: the card then shows
 * the unfilled state with the defaults, exactly as a lazily created row would.
 */
export function toPlayerCard(
  user: { id: string; displayName: string; avatarKey: string | null },
  profile: PlayerProfile | null,
  avatarUrlOf: (key: string) => string,
): PlayerCardResponse {
  const details: PlayerProfileResponse = profile
    ? toPlayerProfileResponse(profile)
    : {
        id: '',
        filled: false,
        level: PlayerLevel.Beginner,
        style: null,
        yearsOfExperience: null,
        handedness: null,
        grip: null,
        about: '',
      };
  return {
    ...details,
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarKey === null ? null : avatarUrlOf(user.avatarKey),
  };
}

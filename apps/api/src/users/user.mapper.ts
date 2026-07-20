import { MeResponse, Role } from '@playwithpro/shared';
import { OAuthAccount, Role as PrismaRole, User } from '@prisma/client';

export type UserWithOAuth = User & { oauthAccounts: OAuthAccount[] };

export function toSharedRole(role: PrismaRole): Role {
  return role.toLowerCase() as Role;
}

export function toPrismaRole(role: Role): PrismaRole {
  return role.toUpperCase() as PrismaRole;
}

export function toMeResponse(
  user: UserWithOAuth,
  avatarUrlOf: (key: string) => string,
): MeResponse {
  return {
    id: user.id,
    email: user.email,
    role: toSharedRole(user.role),
    displayName: user.displayName,
    locale: user.locale,
    timezone: user.timezone,
    emailVerified: user.emailVerifiedAt !== null,
    hasPassword: user.passwordHash !== null,
    googleLinked: user.oauthAccounts.some(
      (account) => account.provider === 'google',
    ),
    avatarUrl: user.avatarKey === null ? null : avatarUrlOf(user.avatarKey),
  };
}

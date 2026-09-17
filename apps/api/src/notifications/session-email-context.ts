import type { Prisma } from '@prisma/client';
import { toSharedServiceType } from '../pros/pro-profile.mapper';
import { isOnlineService } from '../bookings/session-access';
import type {
  CalendarAttendee,
  CalendarSessionInput,
} from '../calendar/calendar-provider';
import type { SessionEmailFacts } from '../mailer/session-email-params';

/** Everything the dispatcher needs to render any session email. */
export const SESSION_EMAIL_INCLUDE = {
  player: {
    select: {
      id: true,
      email: true,
      displayName: true,
      locale: true,
      timezone: true,
    },
  },
  proProfile: {
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          locale: true,
          timezone: true,
        },
      },
      services: { where: { type: 'GAME' }, select: { venueLabel: true } },
    },
  },
  _count: { select: { videos: true } },
  dispute: {
    select: {
      status: true,
      outcome: true,
      kind: true,
      responseDueAt: true,
      resolvedVia: true,
    },
  },
  review: { select: { rating: true } },
  // The proposal a reschedule email is about (looked up by the payload id).
  reschedules: {
    select: {
      id: true,
      status: true,
      expiresAt: true,
      options: {
        select: { startsAt: true },
        orderBy: { startsAt: 'asc' as const },
      },
    },
  },
  payments: {
    where: { status: { in: ['HELD', 'RELEASED', 'REFUNDED'] } },
    select: { status: true },
    take: 1,
  },
} as const satisfies Prisma.SessionInclude;

export type SessionEmailRow = Prisma.SessionGetPayload<{
  include: typeof SESSION_EMAIL_INCLUDE;
}>;

export function sessionFacts(session: SessionEmailRow): SessionEmailFacts {
  const online = isOnlineService(session.serviceType);
  return {
    sessionId: session.id,
    serviceType: toSharedServiceType(session.serviceType),
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    roomPath: online ? `/sessions/${session.id}/room` : null,
    venue: online ? null : (session.proProfile.services[0]?.venueLabel ?? null),
    playerName: session.player.displayName,
    coachName: session.proProfile.user.displayName,
    coachProfileId: session.proProfile.id,
    amountMinor: session.priceMinor,
    feeMinor: session.platformFeeMinor,
    currency: session.currency,
    clipsCount: session._count.videos,
  };
}

export function calendarInput(session: SessionEmailRow): CalendarSessionInput {
  return {
    ...sessionFacts(session),
    sequence: session.calendarSequence,
  };
}

export function attendeeOf(
  session: SessionEmailRow,
  role: 'player' | 'coach',
): CalendarAttendee {
  const user = role === 'player' ? session.player : session.proProfile.user;
  return {
    email: user.email,
    displayName: user.displayName,
    locale: user.locale,
    timezone: user.timezone,
    role,
  };
}

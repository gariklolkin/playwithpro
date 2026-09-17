import type { ServiceType } from '@playwithpro/shared';
import {
  formatDateOnly,
  formatMoney,
  formatWhen,
  type EmailParams,
  type EmailRenderer,
} from './email-renderer';

export type PartyRole = 'player' | 'coach';

/** Everything a session email can mention; built once per session row. */
export interface SessionEmailFacts {
  sessionId: string;
  serviceType: ServiceType;
  startsAt: Date;
  endsAt: Date;
  /** Platform room path for online services (localized per recipient), null for a game. */
  roomPath: string | null;
  venue: string | null;
  playerName: string;
  coachName: string;
  /** ProProfile id of the coach (public coach page). */
  coachProfileId: string;
  amountMinor: number;
  feeMinor: number;
  currency: string;
  clipsCount: number;
}

export interface EmailRecipient {
  displayName: string;
  locale: string;
  timezone: string;
  role: PartyRole | 'admin';
}

/**
 * The parameters shared by every session template, in the recipient's
 * locale and timezone: names, localized service label, dates, money, the
 * "where" line and the sessions link.
 */
export function sessionEmailParams(
  renderer: EmailRenderer,
  facts: SessionEmailFacts,
  recipient: EmailRecipient,
): EmailParams {
  const locale = renderer.resolveLocale(recipient.locale);
  const service = renderer.message(locale, `service.${facts.serviceType}`);
  const where = facts.roomPath
    ? renderer.message(locale, 'common.whereRoom', {
        url: renderer.link(locale, facts.roomPath),
      })
    : renderer.message(locale, 'common.whereVenue', {
        venue: facts.venue ?? '',
      });
  return {
    name: recipient.displayName,
    player: facts.playerName,
    coach: facts.coachName,
    counterpart:
      recipient.role === 'coach' ? facts.playerName : facts.coachName,
    service,
    date: formatDateOnly(facts.startsAt, locale, recipient.timezone),
    when: formatWhen(facts.startsAt, locale, recipient.timezone),
    amount: formatMoney(facts.amountMinor, facts.currency, locale),
    fee: formatMoney(facts.feeMinor, facts.currency, locale),
    net: formatMoney(
      facts.amountMinor - facts.feeMinor,
      facts.currency,
      locale,
    ),
    where,
    clipsLine: renderer.message(locale, 'session.paid.clipsLine', {
      count: facts.clipsCount,
    }),
    sessionsLine: renderer.message(locale, 'common.sessions', {
      url: renderer.link(locale, '/dashboard/sessions'),
    }),
    url: renderer.link(locale, '/dashboard/sessions'),
  };
}

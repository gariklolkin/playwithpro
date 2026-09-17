import { NotificationKind } from '@prisma/client';

/** Optional email categories a user may switch off (User columns). */
export type PreferenceKey =
  'emailReminders' | 'emailClipChanges' | 'emailReviews';

export interface KindMeta {
  /** Catalog key of the email template. */
  messageKey: string;
  /** Present for optional kinds: the preference that gates them (RFC 8058 link). */
  preference?: PreferenceKey;
}

/**
 * One kind per event and recipient role. Transactional kinds (no
 * `preference`) are always sent and carry no unsubscribe link; optional
 * kinds are gated at dispatch by the recipient's preference and skipped
 * first when the daily budget is exhausted.
 */
export const KIND_META: Record<NotificationKind, KindMeta> = {
  SESSION_PAID_PLAYER: { messageKey: 'session.paid.player' },
  SESSION_PAID_COACH: { messageKey: 'session.paid.coach' },
  SESSION_CLIPS_CHANGED: {
    messageKey: 'session.clipsChanged',
    preference: 'emailClipChanges',
  },
  SESSION_REMINDER_24H: {
    messageKey: 'session.reminder',
    preference: 'emailReminders',
  },
  SESSION_REMINDER_1H: {
    messageKey: 'session.reminder',
    preference: 'emailReminders',
  },
  SESSION_ENDED_PLAYER: { messageKey: 'session.ended.player' },
  SESSION_ENDED_COACH: { messageKey: 'session.ended.coach' },
  SESSION_COMPLETED_PLAYER: { messageKey: 'session.completed.player' },
  SESSION_COMPLETED_COACH: { messageKey: 'session.completed.coach' },
  DISPUTE_OPENED_PLAYER: { messageKey: 'dispute.opened.player' },
  DISPUTE_OPENED_COACH: { messageKey: 'dispute.opened.coach' },
  DISPUTE_OPENED_ADMIN: { messageKey: 'dispute.opened.admin' },
  DISPUTE_RESOLVED_PLAYER: { messageKey: 'dispute.resolved.player' },
  DISPUTE_RESOLVED_COACH: { messageKey: 'dispute.resolved.coach' },
  SESSION_CANCELLED_PLAYER: { messageKey: 'session.cancelled.player' },
  SESSION_CANCELLED_COACH: { messageKey: 'session.cancelled.coach' },
  SESSION_CANCELLED_ADMIN: { messageKey: 'session.cancelled.admin' },
  REVIEW_RECEIVED: {
    messageKey: 'review.received',
    preference: 'emailReviews',
  },
};

export function isTransactional(kind: NotificationKind): boolean {
  return KIND_META[kind].preference === undefined;
}

/** `<kind>:<sessionId>:<recipientId>` — the exactly-once key. */
export function dedupeKeyFor(
  kind: NotificationKind,
  sessionId: string | null,
  recipientId: string,
): string {
  return `${kind}:${sessionId ?? '-'}:${recipientId}`;
}

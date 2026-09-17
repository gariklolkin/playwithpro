/**
 * Ports for product observability. Business modules depend only on these
 * interfaces; the vendor behind them (PostHog when a token is configured,
 * a no-op otherwise) is an implementation detail, like the payment, video
 * and calendar providers. Nothing here must block a later OpenTelemetry
 * rollout for logs/metrics/traces — those are separate ports.
 */

/** Scalar property values; free text written by users is never an event property. */
export type EventProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface TrackInput {
  /** Event name in snake_case, e.g. `session_paid`. */
  event: string;
  /** The acting user's id (the key the funnel is joined on). */
  distinctId: string;
  properties?: EventProperties;
}

export interface Analytics {
  /**
   * Records a product event. Server-side lifecycle events mirror
   * transactional records the platform already holds and are sent without
   * creating a person profile (`$process_person_profile: false`), so a
   * user who declined browser capture never gains a profile from the
   * server side.
   */
  track(input: TrackInput): void;
}

export interface ErrorContext {
  route?: string;
  method?: string;
  status?: number;
  userId?: string;
  /** Free-form scalar tags (never bodies or headers). */
  [key: string]: string | number | boolean | undefined;
}

export interface ErrorReporter {
  /** Reports an unexpected exception; deduplicated and rate-limited per process. */
  captureException(error: unknown, context?: ErrorContext): void;
}

export interface FeatureFlags {
  /**
   * Evaluates a boolean flag for a user id. Local evaluation with periodic
   * refresh, so a request-path check never calls the vendor synchronously.
   * Resolves to `fallback` without a configured token or on any failure.
   */
  isEnabled(name: string, userId: string, fallback?: boolean): Promise<boolean>;
}

export const ANALYTICS = Symbol('ANALYTICS');
export const ERROR_REPORTER = Symbol('ERROR_REPORTER');
export const FEATURE_FLAGS = Symbol('FEATURE_FLAGS');

/**
 * Money and lifecycle events emitted by the API as the source of truth for
 * the booking funnel. Property set is fixed: `{ serviceType, amountMinor,
 * currency, sessionId }` plus a role/outcome discriminator where relevant.
 */
export const LIFECYCLE_EVENTS = {
  sessionPaid: 'session_paid',
  sessionCompleted: 'session_completed',
  sessionRefunded: 'session_refunded',
  sessionCancelled: 'session_cancelled',
  sessionDisputed: 'session_disputed',
  disputeResolved: 'dispute_resolved',
  cancellationFeeWaived: 'cancellation_fee_waived',
  cancellationSettled: 'cancellation_settled',
  sessionClassified: 'session_classified',
  disputeAutoResolved: 'dispute_auto_resolved',
  disputeCoachResponded: 'dispute_coach_responded',
} as const;

/** Feature flags are named after the OpenSpec change they guard. */
export const FLAGS = {
  /** Kill switch for the in-app support panel entry points. */
  supportPanel: 'add-product-observability-support-panel',
} as const;

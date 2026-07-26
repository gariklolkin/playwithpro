export enum PaymentStatus {
  RequiresHold = "requires_hold",
  Held = "held",
  Failed = "failed",
  /** Escrow paid out to the coach (confirmation, auto-confirm, or dispute resolution). */
  Released = "released",
  /** Escrow returned to the player (pre-start cancellation or dispute resolution). */
  Refunded = "refunded",
}

/**
 * Sentinel payment-instrument token the mock provider declines.
 * Dev-visible toggle on the checkout page; also used by e2e tests.
 */
export const MOCK_DECLINE_INSTRUMENT = "mock-decline";

export enum PaymentStatus {
  RequiresHold = "requires_hold",
  Held = "held",
  Failed = "failed",
  /** Reserved for the payout change. */
  Released = "released",
  /** Reserved for the dispute change. */
  Refunded = "refunded",
}

/**
 * Sentinel payment-instrument token the mock provider declines.
 * Dev-visible toggle on the checkout page; also used by e2e tests.
 */
export const MOCK_DECLINE_INSTRUMENT = "mock-decline";

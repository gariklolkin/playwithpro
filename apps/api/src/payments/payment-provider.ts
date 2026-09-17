/**
 * Port for the escrow payment integration. Business logic depends only on
 * this interface; the vendor behind it (mock in MVP, Stripe Connect candidate
 * later) is an implementation detail.
 */
export interface HoldInput {
  /** Used as an idempotency key for the hold. */
  sessionId: string;
  /** Integer minor units, never floats. */
  amountMinor: number;
  /** ISO 4217 code. */
  currency: string;
  /**
   * Opaque payment-instrument token from the client (a real vendor's
   * payment-method id). The mock provider interprets sentinel values.
   */
  instrument?: string;
}

export type HoldResult =
  { ok: true; providerRef: string } | { ok: false; reason: string };

/** A partial release: the part of the hold that goes back to the player. */
export interface ReleaseOptions {
  /** Integer minor units, 0 < refundMinor < held amount. */
  refundMinor?: number;
}

export interface PaymentProvider {
  /** Place funds on hold (escrow); must not transfer them. */
  hold(input: HoldInput): Promise<HoldResult>;
  /**
   * Release held funds to the coach. With `refundMinor` the provider returns
   * that part to the player and releases the rest — one movement (a late
   * cancellation); never exposed via API.
   */
  release(providerRef: string, options?: ReleaseOptions): Promise<void>;
  /** Return held funds to the player (dispute change); not exposed via API yet. */
  refund(providerRef: string): Promise<void>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Coach-side fee withheld from the payout at release, in minor units. */
export function computePlatformFee(
  priceMinor: number,
  feePercent: number,
): number {
  return Math.round((priceMinor * feePercent) / 100);
}

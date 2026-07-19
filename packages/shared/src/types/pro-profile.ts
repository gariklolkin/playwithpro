import type { ProProfileStatus } from "../enums/pro-profile";
import type { ServiceType } from "../enums/service-type";
import type { BookingStatus, VerificationState } from "../enums/verification";
import type { VerificationBookingResponse } from "./verification";

export const BIO_MAX_LENGTH = 4000;
export const CREDENTIALS_MAX_LENGTH = 4000;

export interface ProServiceResponse {
  type: ServiceType;
  /** Hourly price in integer minor units (e.g. cents). */
  priceMinor: number;
  /** ISO 4217 code. */
  currency: string;
  /** GAME only: club/address as picked on the map. */
  venueLabel: string;
  venueLat: number | null;
  venueLng: number | null;
  active: boolean;
}

export interface UpsertProServiceRequest {
  priceMinor: number;
  currency: string;
  /** Required for the in-person game service. */
  venueLabel?: string;
  venueLat?: number;
  venueLng?: number;
  active?: boolean;
}

export interface UpdateProProfileRequest {
  /** Single free-form "about" block; optional. */
  bio?: string;
  /** ISO 639-1 codes, subset of the platform's supported locales. */
  languages?: string[];
}

export interface VerificationRequestResponse {
  id: string;
  state: VerificationState;
  credentials: string;
  adminNote: string;
  noShowCount: number;
  /** Outcome of the latest finished booking; drives the "pick a new time" banner. */
  lastBookingOutcome: BookingStatus | null;
  /** The active (scheduled) booking, when state is `scheduled`/`in_progress`. */
  booking: VerificationBookingResponse | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ProProfileResponse {
  id: string;
  status: ProProfileStatus;
  bio: string;
  languages: string[];
  services: ProServiceResponse[];
  latestVerification: VerificationRequestResponse | null;
}

/** The reviewed material is the profile itself; extra notes are optional. */
export interface SubmitVerificationRequest {
  credentials?: string;
}

export interface RejectVerificationRequest {
  note: string;
}

/** Admin queue item: request with profile and user summary.
 *  Ordered by meeting time (soonest first); unscheduled requests follow. */
export interface AdminVerificationItem {
  requestId: string;
  submittedAt: string;
  credentials: string;
  state: VerificationState;
  /** The scheduled call, when one is booked. */
  meeting: {
    bookingId: string;
    startsAt: string;
    endsAt: string;
    meetUrl: string | null;
  } | null;
  profile: ProProfileResponse;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}
